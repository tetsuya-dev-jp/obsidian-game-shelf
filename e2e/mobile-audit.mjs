// Native Obsidian mobile UI; viewport, text scale and keyboard remain simulated.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { connect } from './cdp.mjs';

const state = JSON.parse(await readFile(new URL('./.runtime/launcher.json', import.meta.url), 'utf8'));
const c = await connect();
const run = (fn, ...args) => c.evaluate(`(${fn.toString()})(${args.map(x => JSON.stringify(x)).join(',')})`);
const pause = () => new Promise(resolve => setTimeout(resolve, 100));
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    try { if (await c.evaluate(expression)) return; } catch { /* Emulation reloads. */ }
    await pause();
  }
  throw new Error(`Timed out: ${expression}`);
}
const report = { date: new Date().toISOString(), nativeMobile: false, layouts: [], keyboards: [] };
let saved, path, emulated = false;
async function layout(context, surface, selector) {
  await pause();
  const result = await run(selector => {
    const root = document.querySelector(selector), pane = root.getBoundingClientRect(), issues = [];
    const tolerance = 1;
    for (const el of root.querySelectorAll('button, input:not([type="checkbox"]), select, textarea, summary, .gs-field')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 80) || el.tagName;
      if (r.left < pane.left - tolerance || r.right > pane.right + tolerance)
        issues.push(`outside surface: ${name}`);
      if (el.matches('input, textarea, select') && parseFloat(getComputedStyle(el).fontSize) < 16)
        issues.push(`focus-zoom text: ${name}`);
      if (el.matches('button, select, input, summary') && r.height < 44 && !el.closest('.setting-item'))
        issues.push(`small touch target: ${name}`);
      if (el.matches('.gs-with-icon, .gs-nav button')) {
        const range = document.createRange();
        for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          range.selectNodeContents(node);
          for (const text of range.getClientRects())
            if (text.right > r.right + tolerance || text.bottom > r.bottom + tolerance)
              issues.push(`clipped button text: ${name}`);
        }
      }
    }
    for (const el of root.querySelectorAll('p, .setting-item-name, .setting-item-description')) {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      if (Array.from(range.getClientRects()).some(r => r.left < pane.left - 1 || r.right > pane.right + 1))
        issues.push(`clipped readable text: ${el.textContent.slice(0, 100)}`);
    }
    const scroller = root.matches('.gs-igdb-setup') ? root.querySelector('.modal-content') : root;
    return { width: pane.width, height: pane.height, overflowX: getComputedStyle(scroller).overflowX,
      horizontalOverflow: scroller.scrollWidth - scroller.clientWidth, issues };
  }, selector);
  if (result.horizontalOverflow > 1 && !['hidden', 'clip'].includes(result.overflowX))
    result.issues.push('horizontal scrolling');
  report.layouts.push({ ...context, surface, ...result });
}
try {
  assert.equal(await c.evaluate('app.vault.adapter.basePath'), state.vaultPath);
  await until(`!!app.plugins.plugins['game-shelf']`);
  emulated = !await c.evaluate(`document.body.classList.contains('emulate-mobile')`);
  if (emulated) {
    await c.evaluate('app.emulateMobile(true)');
    await until(`document.body.classList.contains('emulate-mobile') && !!app.plugins.plugins['game-shelf']`);
  }
  saved = await run(() => ({ settings: structuredClone(app.plugins.plugins['game-shelf'].settings), classes: document.body.className, theme: app.vault.getConfig('theme'),
    style: document.body.getAttribute('style'), keyboard: document.documentElement.style.getPropertyValue('--keyboard-height') }));
  await run(async () => {
    const p = app.plugins.plugins['game-shelf'];
    app.setting.close();
    for (const modal of document.querySelectorAll('.gs-igdb-setup'))
      modal.querySelector('.modal-header-button, .modal-close-button')?.click();
    document.body.classList.add('is-ios');
    document.body.style.removeProperty('--keyboard-height');
    document.body.style.setProperty('--safe-area-inset-top', '44px');
    document.body.style.setProperty('--safe-area-inset-bottom', '34px');
    await p.updateSettings({ ...p.settings, folder: `E2E audit ${Date.now()}`, language: 'ja', online: false });
  });
  await until(`!document.querySelector('.gs-igdb-setup, .modal.mod-settings')`);
  path = await run(async () => (await app.plugins.plugins['game-shelf'].notes.manual({
    title: 'ゼルダの伝説 ブレス オブ ザ ワイルド — A long game title for mobile',
    status: 'backlog', rating: 4.5, ownership: 'owned', groups: [], saveCover: false,
  })).file.path);
  await until(`app.plugins.plugins['game-shelf'].notes.list().some(x=>x.path===${JSON.stringify(path)})`);
  for (const [language, theme, scale] of [
    ['ja', 'obsidian', 1], ['en', 'obsidian', 1], ['ja', 'obsidian', 1.5],
    ['en', 'moonstone', 1.5], ['ja', 'moonstone', 2], ['en', 'obsidian', 2],
  ]) {
    await run(async (language, theme, scale) => {
      const p = app.plugins.plugins['game-shelf'];
      await p.updateSettings({ ...p.settings, language, online: false });
      app.changeTheme(theme);
      document.body.style.setProperty('--preferred-text-scale', String(scale));
    }, language, theme, scale);
    for (const [width, height] of [[320,568], [375,812], [390,844], [430,932], [507,744], [600,960], [744,1133], [812,375], [1024,768], [1133,744]]) {
      await c.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const context = { language, theme, scale, viewport: [width, height] };
      await run(async () => { const v = await app.plugins.plugins['game-shelf'].openShelf('library'); v.libraryPath = null; v.manual = false; v.localQuery = ''; v.status = 'all'; v.platform = 'all'; v.genre = 'all'; v.render(); });
      assert(await c.evaluate(`document.querySelectorAll('.gs-game-card').length > 0`), 'Library audit needs actual game cards');
      await layout(context, 'library', '.gs-root');
      await run(async path => (await app.plugins.plugins['game-shelf'].openShelf('library')).selectLibrary(path), path);
      await layout(context, 'detail', '.gs-root');
      await run(async () => (await app.plugins.plugins['game-shelf'].openShelf('library')).openManual());
      await layout(context, 'manual', '.gs-root');
      await run(async () => { await app.plugins.plugins['game-shelf'].openShelf('discover'); });
      await layout(context, 'offline', '.gs-root');
      if ([375,744].includes(width)) {
        await run(() => app.plugins.plugins['game-shelf'].openIgdbSetup());
        await layout(context, 'credential-guide', '.gs-igdb-setup');
        await run(() => document.querySelector('.gs-igdb-setup .modal-header-button, .gs-igdb-setup .modal-close-button')?.click());
        await until(`!document.querySelector('.gs-igdb-setup')`);
        await run(() => { app.setting.findTabById('game-shelf').update(); app.setting.open(); app.setting.openTabById('game-shelf'); });
        await layout(context, 'settings', '.vertical-tab-content');
        await run(() => app.setting.close());
        await until(`!document.querySelector('.modal.mod-settings')`);
      }
    }
    // Keyboard tests include landscape and large text, where sticky chrome consumes space.
    for (const [width, height, keyboard] of [[375,812,344], [812,375,170]]) {
      await c.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await run(async () => {
        document.documentElement.style.setProperty('--keyboard-height', '0px');
        (await app.plugins.plugins['game-shelf'].openShelf('library')).openManual();
      });
      for (const selector of ['.gs-title-input', '.gs-create-fields select']) {
        await run(() => Array.from(document.querySelectorAll('.notice-cta')).find(e=>e.textContent==="Don't show again")?.click());
        await run(selector => { const e = document.querySelector(selector); e.scrollIntoView({ block:'center' }); e.focus({preventScroll:true}); }, selector);
        await run(keyboard => document.documentElement.style.setProperty('--keyboard-height', `${keyboard}px`), keyboard);
        await pause();
        const result = await run(selector => {
          const input = document.querySelector(selector), r = input.getBoundingClientRect();
          const root = document.querySelector('.gs-root').getBoundingClientRect();
          const hit = document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
          return { visible: input.contains(hit) && r.top >= root.top - 1 && r.bottom <= root.bottom + 1,
            bounds: r.toJSON(), pane: root.toJSON(), coveredBy: hit?.tagName + '.' + hit?.className };
        }, selector);
        report.keyboards.push({ language, theme, scale, viewport:[width,height], keyboard, selector, ...result });
        await run(() => document.documentElement.style.setProperty('--keyboard-height','0px'));
        await pause();
      }
    }
  }
  await writeFile(new URL('../docs/mobile-audit-checks.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  const failures = [...report.layouts.filter(x=>x.issues.length), ...report.keyboards.filter(x=>!x.visible)];
  console.log(JSON.stringify({ layouts: report.layouts.length, keyboards: report.keyboards.length, failures: failures.length, examples: failures.slice(0,12) }, null, 2));
  assert.equal(failures.length, 0, 'Mobile audit failures; see docs/mobile-audit-checks.json');
} finally {
  if (saved) await run(async (saved,path) => {
    app.setting.close();
    document.querySelector('.gs-igdb-setup .modal-header-button, .gs-igdb-setup .modal-close-button')?.click();
    const p=app.plugins.plugins['game-shelf'], file=path && app.vault.getFileByPath(path);
    if(file) await app.fileManager.trashFile(file);
    await p.updateSettings(saved.settings);
    app.changeTheme(saved.theme);
    document.body.className=saved.classes;
    if(saved.style===null) document.body.removeAttribute('style'); else document.body.setAttribute('style',saved.style);
    if(saved.keyboard) document.documentElement.style.setProperty('--keyboard-height',saved.keyboard); else document.documentElement.style.removeProperty('--keyboard-height');
    await p.openShelf('library');
  },saved,path);
  await c.call('Emulation.clearDeviceMetricsOverride');
  if(emulated) await c.evaluate('app.emulateMobile(false)');
  c.close();
}
