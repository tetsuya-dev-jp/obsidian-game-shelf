// Real Obsidian mobile UI with a simulated keyboard; not physical iOS/Android.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { connect } from './cdp.mjs';

const state = JSON.parse(await readFile(new URL('./.runtime/launcher.json', import.meta.url), 'utf8'));
const c = await connect();
const run = (fn, ...args) => c.evaluate(`(${fn.toString()})(${args.map(x => JSON.stringify(x)).join(',')})`);
const pause = () => new Promise(resolve => setTimeout(resolve, 150));
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    try { if (await c.evaluate(expression)) return; } catch { /* Mobile emulation reloads the renderer. */ }
    await pause();
  }
  throw new Error(`Timed out: ${expression}`);
}
const report = { date: new Date().toISOString(), nativeMobile: false, keyboard: 'simulated Obsidian --keyboard-height', checks: [], dates: [], createActions: [] };
let saved;
let filePath;
let emulated = false;
async function keyboard(height) {
  await run(height => {
    document.documentElement.style.setProperty('--keyboard-height', `${height}px`);
    window.dispatchEvent(new Event(height ? 'keyboardWillShow' : 'keyboardWillHide'));
  }, height);
  await pause();
}
async function checkInput(selector, text) {
  await keyboard(0);
  await run(selector => {
    const input = document.querySelector(selector);
    input.scrollIntoView({ block: 'center' });
    input.focus({ preventScroll: true });
  }, selector);
  await c.call('Input.insertText', { text });
  const before = await run(selector => document.querySelector(selector).value, selector);
  assert.equal(before, text, 'The initial text must actually reach the focused input');
  const paneHeight = await run(() => document.querySelector('.gs-root').clientHeight);
  await keyboard(344);
  const geometry = await run(selector => {
    const input = document.querySelector(selector), root = document.querySelector('.gs-root');
    const r = input.getBoundingClientRect(), pane = root.getBoundingClientRect();
    const header = root.querySelector('.gs-header').getBoundingClientRect();
    return { selector, focused: document.activeElement === input, value: input.value,
      top: r.top, bottom: r.bottom, visibleTop: header.bottom,
      visibleBottom: pane.bottom - parseFloat(getComputedStyle(root).paddingBottom),
      paneHeight: pane.height, headerTop: header.top, paneTop: pane.top };
  }, selector);
  assert(paneHeight - geometry.paneHeight > 200, 'The simulated keyboard must actually shrink the view');
  assert(geometry.focused, JSON.stringify(geometry));
  assert.equal(geometry.value, before);
  assert(geometry.top >= geometry.visibleTop - 1 && geometry.bottom <= geometry.visibleBottom + 1,
    `Focused input disappeared after keyboard opened: ${JSON.stringify(geometry)}`);
  assert(Math.abs(geometry.headerTop - geometry.paneTop) <= 1, 'Header must remain visible');
  const suffix = selector === '.gs-journal input' ? '2' : 'a';
  await c.call('Input.insertText', { text: suffix });
  assert.equal(await run(selector => document.querySelector(selector).value, selector), before + suffix);
  await keyboard(0);
  assert.equal(await run(selector => document.querySelector(selector).value, selector), before + suffix);
  report.checks.push(geometry);
}
async function checkSelect(selector) {
  await keyboard(0);
  await run(selector => {
    const input = document.querySelector(selector);
    input.scrollIntoView({ block: 'center' });
    input.focus({ preventScroll: true });
  }, selector);
  await keyboard(344);
  const result = await run(selector => {
    const input = document.querySelector(selector), r = input.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { selector, visible: input.contains(hit), coveredBy: hit?.outerHTML.slice(0, 300), top: r.top, bottom: r.bottom };
  }, selector);
  assert(result.visible, `Focused select is covered: ${JSON.stringify(result)}`);
  report.checks.push(result);
  await keyboard(0);
}
try {
  assert.equal(await c.evaluate('app.vault.adapter.basePath'), state.vaultPath);
  await until(`!!app.plugins.plugins['game-shelf']`);
  emulated = !await c.evaluate(`document.body.classList.contains('emulate-mobile')`);
  if (emulated) {
    await c.evaluate('app.emulateMobile(true)');
    await until(`document.body.classList.contains('emulate-mobile') && !!app.plugins.plugins['game-shelf']`);
  }
  await c.call('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: false });
  await pause();
  saved = await run(() => {
    const p = app.plugins.plugins['game-shelf'];
    return { settings: structuredClone(p.settings), classes: document.body.className, style: document.body.getAttribute('style'),
      keyboard: document.documentElement.style.getPropertyValue('--keyboard-height') };
  });
  await run(async () => {
    const p = app.plugins.plugins['game-shelf'];
    document.body.style.removeProperty('--keyboard-height');
    document.body.classList.add('is-ios');
    document.body.style.setProperty('--safe-area-inset-top', '44px');
    document.body.style.setProperty('--safe-area-inset-bottom', '34px');
    await p.updateSettings({ ...p.settings, folder: `E2E inputs ${Date.now()}`, language: 'ja', online: false });
    const view = await p.openShelf('library');
    view.libraryPath = null;
    view.manual = false;
    view.localQuery = '';
    view.render();
  });
  report.app = await c.evaluate('document.title');
  await checkInput('.gs-toolbar input', 'library');
  await run(async () => (await app.plugins.plugins['game-shelf'].openShelf('library')).openManual());
  await checkInput('.gs-title-input', 'manual');
  for (const label of ['プレイ状況', '自分の評価', '所有状況'])
    await checkSelect(`.gs-create-fields select[aria-label="${label}"]`);
  for (const [width, height] of [[375, 812], [744, 1133], [840, 1280], [1024, 768]]) {
    await c.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const keyboardHeight of [0, 344]) {
      await run(() => document.querySelector('.gs-title-input').focus({ preventScroll: true }));
      await keyboard(keyboardHeight);
      assert(await run(() => {
        const input = document.querySelector('.gs-title-input'), root = document.querySelector('.gs-root');
        const r = input.getBoundingClientRect();
        return document.activeElement === input &&
          r.top >= Math.max(root.getBoundingClientRect().top, root.querySelector('.gs-header').getBoundingClientRect().bottom) - 1 &&
          r.bottom <= root.getBoundingClientRect().bottom - parseFloat(getComputedStyle(root).paddingBottom) + 1;
      }), `Focused title must remain visible at ${width}×${height}, keyboard ${keyboardHeight}`);
      for (const expanded of [false, true]) {
        await run(expanded => { document.querySelector('.gs-note-preview').open = expanded; }, expanded);
        await pause();
        for (const fraction of [0, 0.5, 1]) {
          await run(fraction => {
            const root = document.querySelector('.gs-root');
            root.scrollTop = (root.scrollHeight - root.clientHeight) * fraction;
          }, fraction);
          await pause();
          const result = await run(() => {
            const root = document.querySelector('.gs-root');
            const action = root.querySelector('.gs-create-action').getBoundingClientRect();
            const path = root.querySelector('.gs-target-path').getBoundingClientRect();
            const button = root.querySelector('.gs-create-action button');
            const r = button.getBoundingClientRect(), pane = root.getBoundingClientRect();
            const top = Math.max(r.top, pane.top, root.querySelector('.gs-header').getBoundingClientRect().bottom);
            const bottom = Math.min(r.bottom, pane.bottom - parseFloat(getComputedStyle(root).paddingBottom));
            const visible = bottom > top + 1;
            return { actionTop: action.top, precedingBottom: path.bottom, scrollTop: root.scrollTop,
              visible, reachable: !visible || button.contains(document.elementFromPoint(r.left + r.width / 2, (top + bottom) / 2)) };
          });
          assert(result.actionTop >= result.precedingBottom - 1,
            `Create action overlaps earlier form content: ${JSON.stringify({ width, height, keyboardHeight, expanded, fraction, ...result })}`);
          assert(result.reachable, 'Visible create button must remain reachable');
          report.createActions.push({ width, height, keyboardHeight, expanded, fraction, ...result });
        }
      }
    }
  }
  await keyboard(0);
  await c.call('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: false });
  filePath = await run(async () => {
    const p = app.plugins.plugins['game-shelf'];
    const result = await p.notes.manual({ title: 'Mobile input regression', status: 'backlog', rating: null, ownership: 'owned', groups: [], saveCover: false });
    return result.file.path;
  });
  await until(`app.plugins.plugins['game-shelf'].notes.list().some(x => x.path === ${JSON.stringify(filePath)})`);
  await run(async path => (await app.plugins.plugins['game-shelf'].openShelf('library')).selectLibrary(path), filePath);
  await checkInput('.gs-journal-text', 'A session kept after keyboard resize.');
  await checkInput('.gs-journal input', '17');
  await run(() => document.querySelector('.gs-journal').requestSubmit());
  await until(`app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(filePath)}))?.frontmatter.playtime_minutes === 172`);
  assert((await run(path => app.vault.read(app.vault.getFileByPath(path)), filePath)).includes('A session kept after keyboard resize.a'));
  report.persistedMinutes = 172;
  for (const width of [320, 375, 390, 430, 744, 1024]) {
    await c.call('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 1, mobile: false });
    await pause();
    const dates = await run(() => Array.from(document.querySelectorAll('.gs-field input[type="date"]')).map(input => {
      // Check empty and populated controls without writing fixture dates to the note.
      input.value = input.getAttribute('aria-label') === 'プレイ開始日' ? '' : '2026-11-18';
      const r = input.getBoundingClientRect(), field = input.parentElement.getBoundingClientRect();
      return { value: input.value, width: r.width, fieldWidth: field.width,
        left: r.left, right: r.right, fieldLeft: field.left, fieldRight: field.right,
        appearance: getComputedStyle(input).appearance };
    }));
    assert.equal(dates.length, 2);
    for (const date of dates) {
      assert(date.left >= date.fieldLeft - 1 && date.right <= date.fieldRight + 1, JSON.stringify({ width, ...date }));
      assert.equal(date.appearance, 'none');
    }
    report.dates.push({ viewportWidth: width, controls: dates });
  }
  await c.call('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: false });
  await run(async () => {
    const p = app.plugins.plugins['game-shelf'];
    await p.updateSettings({ ...p.settings, online: true, provider: 'gamesneverdie' });
    await p.openShelf('discover');
  });
  await checkInput('.gs-search-form input', 'Zelda');
  await writeFile(new URL('../docs/mobile-input-checks.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS ${report.checks.length} focused inputs survive opening/closing the simulated keyboard`);
  console.log(`PASS ${report.createActions.length} create actions stay after the form while scrolling`);
} finally {
  await keyboard(0);
  if (saved) await run(async (saved, path) => {
    const p = app.plugins.plugins['game-shelf'];
    const file = path && app.vault.getFileByPath(path);
    if (file) await app.fileManager.trashFile(file);
    await p.updateSettings(saved.settings);
    await p.openShelf('library');
    document.body.className = saved.classes;
    if (saved.style === null) document.body.removeAttribute('style');
    else document.body.setAttribute('style', saved.style);
    if (saved.keyboard) document.documentElement.style.setProperty('--keyboard-height', saved.keyboard);
    else document.documentElement.style.removeProperty('--keyboard-height');
  }, saved, filePath);
  await c.call('Emulation.clearDeviceMetricsOverride');
  if (emulated) await c.evaluate('app.emulateMobile(false)');
  c.close();
}
