// Exercise completion controls through Chromium input in the isolated native app.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { connect } from './cdp.mjs';
const state = JSON.parse(
  await readFile(new URL('./.runtime/launcher.json', import.meta.url), 'utf8'),
);
assert(state.vaultPath.endsWith('/obsidian-game-shelf/e2e/.runtime/vault'));
const c = await connect();
const run = (fn, ...args) =>
  c.evaluate(`(${fn.toString()})(${args.map((x) => JSON.stringify(x)).join(',')})`, {
    timeoutMs: 30000,
  });
const wait = async (expression) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await c.evaluate(expression)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(expression);
};
const key = async (key, code, virtual) => {
  await c.call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: virtual,
    text: key === 'Enter' ? '\r' : undefined,
  });
  await c.call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: virtual,
  });
};
const title = `E2E narrow ${Date.now()}`;
let settings, filePath;
try {
  assert.equal(await c.evaluate('app.vault.adapter.basePath'), state.vaultPath);
  await c.call('Page.bringToFront');
  await c.call('Emulation.setFocusEmulationEnabled', { enabled: true });
  settings = await c.evaluate(`structuredClone(app.plugins.plugins['game-shelf'].settings)`);
  await c.call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await run(async () => {
    const p = app.plugins.plugins['game-shelf'];
    await p.updateSettings({ ...p.settings, language: 'en', online: false, folder: 'E2E checks' });
    if (!app.workspace.leftSplit.collapsed) app.workspace.leftSplit.collapse();
    const v = await p.openShelf('library');
    v.openManual();
  });
  await wait(`document.querySelector('.gs-root').clientWidth>=330`);
  await run((title) => {
    const input = document.querySelector('.gs-title-input');
    input.focus();
    input.value = title;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const button = document.querySelector('.gs-create-action button');
    button.scrollIntoView({ block: 'center' });
    button.focus();
  }, title);
  await c.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 365, y: 785 });
  await new Promise((r) => setTimeout(r, 300));
  const create = await c.evaluate(
    `(()=>{const b=document.querySelector('.gs-create-action button'),r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,focused:document.activeElement===b,overflow:document.querySelector('.gs-root').scrollWidth>document.querySelector('.gs-root').clientWidth+1,uncovered:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('button')===b}})()`,
  );
  assert(
    create.focused &&
      create.uncovered &&
      !create.overflow &&
      create.top >= 0 &&
      create.bottom < 818,
  );
  await c.screenshot(new URL('../docs/media/narrow-create-action.png', import.meta.url).pathname);
  await key('Enter', 'Enter', 13);
  await wait(
    `!!app.plugins.plugins['game-shelf'].notes.list().find(x=>x.title===${JSON.stringify(title)})`,
  );
  filePath = await run(
    (title) => app.plugins.plugins['game-shelf'].notes.list().find((x) => x.title === title).path,
    title,
  );
  await run(async (path) => {
    const p = app.plugins.plugins['game-shelf'];
    const v = await p.openShelf('library');
    v.selectLibrary(path, true);
  }, filePath);
  await c.call('Input.insertText', {
    text: 'Narrow-pane keyboard creation and mouse session save.',
  });
  await run(() => {
    const i = document.querySelector('.gs-journal input[type="number"]');
    i.value = '17';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    const b = document.querySelector('.gs-journal button');
    b.scrollIntoView({ block: 'center' });
    b.focus();
  });
  await new Promise((r) => setTimeout(r, 250));
  const save = await c.evaluate(
    `(()=>{const b=document.querySelector('.gs-journal button'),r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,x:r.left+r.width/2,y:r.top+r.height/2,focused:document.activeElement===b,uncovered:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('button')===b}})()`,
  );
  assert(
    save.focused && save.uncovered && save.top >= 0 && save.bottom < 818,
    JSON.stringify(save),
  );
  await c.screenshot(new URL('../docs/media/narrow-journal-action.png', import.meta.url).pathname);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await c.call('Input.dispatchMouseEvent', {
      type,
      x: save.x,
      y: save.y,
      ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }),
    });
  await wait(`document.querySelector('.gs-minutes-total')?.textContent.includes('17')`);
  const saved = await run(async (path) => {
    const f = app.vault.getFileByPath(path);
    return {
      content: await app.vault.read(f),
      minutes: app.metadataCache.getFileCache(f)?.frontmatter.playtime_minutes,
    };
  }, filePath);
  assert.equal(saved.minutes, 17);
  assert(saved.content.includes('Narrow-pane keyboard creation and mouse session save.'));
  await writeFile(
    new URL('../docs/narrow-checks.json', import.meta.url),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        app: await c.evaluate('document.title'),
        viewport: [390, 844],
        create: { ...create, activatedBy: 'Chromium Enter key' },
        save: { ...save, activatedBy: 'Chromium mouse click' },
        persistedMinutes: 17,
        bodyVerified: true,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'PASS narrow keyboard creates a real note; mouse saves journal; controls visible and uncovered.',
  );
} finally {
  if (filePath)
    await run(async (path) => {
      const f = app.vault.getFileByPath(path);
      if (f) await app.fileManager.trashFile(f);
    }, filePath);
  if (settings)
    await run(async (settings) => {
      const p = app.plugins.plugins['game-shelf'];
      await p.updateSettings(settings);
      await p.openShelf('library');
    }, settings);
  await c.call('Emulation.clearDeviceMetricsOverride');
  c.close();
}
