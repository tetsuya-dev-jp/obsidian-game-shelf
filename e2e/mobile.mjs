// Real Obsidian desktop renderer, emulated touch/viewports; not native iOS/Android.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { connect } from './cdp.mjs';

const state = JSON.parse(await readFile(new URL('./.runtime/launcher.json', import.meta.url), 'utf8'));
assert.equal(state.vaultPath, new URL('./.runtime/vault', import.meta.url).pathname);
const c = await connect();
const run = (fn, ...args) => c.evaluate(`(${fn.toString()})(${args.map(x => JSON.stringify(x)).join(',')})`, { timeoutMs: 30000 });
const pause = () => new Promise(resolve => setTimeout(resolve, 100));
const report = { date: new Date().toISOString(), nativeMobile: false, syntheticNetwork: true, layouts: [], interactions: [] };
const files = [];
const folder = `E2E mobile ${Date.now()}`;
let saved;
async function until(expression) {
  for (let i = 0; i < 150; i++) {
    if (await c.evaluate(expression)) return;
    await pause();
  }
  throw new Error(`Timed out: ${expression}`);
}
async function viewport(width, height) {
  await c.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await pause();
}
async function tap(selector) {
  await run(selector => document.querySelector(selector).scrollIntoView({ block: 'center' }), selector);
  await pause();
  const point = await run(selector => {
    const el = document.querySelector(selector), r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (!el.contains(document.elementFromPoint(x, y))) throw new Error(`Covered control: ${selector}`);
    return { x, y };
  }, selector);
  await c.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, radiusX: 1, radiusY: 1 }] });
  await c.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause();
}
async function swipe(start, dx, dy) {
  await c.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (let step = 1; step <= 8; step++) {
    await c.call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + dx * step / 8, y: start.y + dy * step / 8 }] });
    await new Promise(resolve => setTimeout(resolve, 24));
  }
  await c.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause();
}
async function layout(language, screen) {
  const geometry = await run(() => {
    const root = document.querySelector('.gs-root'), shell = root.querySelector('.gs-shell');
    const bounds = root.getBoundingClientRect();
    const issues = [];
    for (const fallback of root.querySelectorAll('.gs-cover-fallback'))
      if (fallback.textContent.trim()) issues.push('Text squeezed into a cover placeholder');
    for (const el of root.querySelectorAll('button, input, select, textarea, summary, .gs-field, .gs-facets, .gs-toolbar')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.left < bounds.left - 1 || r.right > bounds.right + 1)
        issues.push(`outside pane: ${el.className || el.tagName}`);
      if (el.matches('button, input:not([type="checkbox"]), select, summary') && r.height < 44)
        issues.push(`short touch target: ${el.textContent || el.getAttribute('aria-label')}`);
      if (el.matches('button.gs-with-icon, .gs-nav button')) {
        const range = document.createRange();
        for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          range.selectNodeContents(node);
          for (const text of range.getClientRects()) if (text.top < r.top - 1 || text.bottom > r.bottom + 1 || text.right > r.right + 1)
            issues.push(`clipped button label: ${el.textContent}`);
        }
      }
      if (el.matches('input:not([type="checkbox"]), select, textarea') && parseFloat(getComputedStyle(el).fontSize) < 16)
        issues.push(`small input text: ${el.getAttribute('aria-label')}`);
    }
    return {
      viewport: [innerWidth, innerHeight], paneWidth: root.clientWidth,
      rootOverflow: [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight],
      horizontalOverflow: shell.scrollWidth - shell.clientWidth,
      libraryVisible: !!root.querySelector('.gs-library')?.getBoundingClientRect().width,
      detailVisible: !!root.querySelector('.gs-detail')?.getBoundingClientRect().width,
      issues,
    };
  });
  assert.deepEqual(geometry.rootOverflow, [0, 0], JSON.stringify({ language, screen, ...geometry }));
  assert(geometry.horizontalOverflow <= 1, JSON.stringify({ language, screen, ...geometry }));
  assert.deepEqual(geometry.issues, [], JSON.stringify({ language, screen, ...geometry }));
  if (screen === 'detail' || screen === 'manual')
    assert.equal(geometry.libraryVisible, geometry.paneWidth > 960);
  report.layouts.push({ language, screen, ...geometry });
}
try {
  assert.equal(await c.evaluate('app.vault.adapter.basePath'), state.vaultPath);
  await until(`!!app.plugins.plugins['game-shelf']`);
  saved = await run(() => {
    const p = app.plugins.plugins['game-shelf'];
    return { settings: structuredClone(p.settings), theme: document.body.className };
  });
  await run(() => app.changeTheme('obsidian'));
  report.app = await c.evaluate('document.title');
  await c.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await c.call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await run(async (html, searchHtml) => {
    const p = app.plugins.plugins['game-shelf'];
    window.gsMobileRequest = p.request;
    p.request = async url => {
      if (url.startsWith('https://gamesneverdie.com/ja/search')) return { status: 200, text: searchHtml };
      if (url.startsWith('https://gamesneverdie.com/ja/games/')) return { status: 200, text: html };
      throw new Error(`Unexpected test request: ${url}`);
    };
    p.clearCaches();
    if (!app.workspace.leftSplit.collapsed) app.workspace.leftSplit.collapse();
    if (!app.workspace.rightSplit.collapsed) app.workspace.rightSplit.collapse();
    const v = await p.openShelf('library');
    // Scope mobile CSS to the plugin, leaving the desktop host layout intact.
    v.contentEl.parentElement.classList.add('is-mobile');
    document.getElementById('game-shelf-mobile-review')?.remove();
  }, await readFile(new URL('../tests/fixtures/game.html', import.meta.url), 'utf8'), await readFile(new URL('../tests/fixtures/search.html', import.meta.url), 'utf8'));
  await c.call('Fetch.enable', { patterns: [{ urlPattern: 'https://media.gamesneverdie.com/*' }] });
  c.on('Fetch.requestPaused', event => {
    void c.call('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
      body: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6QAAAABJRU5ErkJggg==',
    }).catch(() => {});
  });
  for (const language of ['ja', 'en']) {
    await viewport(390, 844);
    await run(async (language, folder) => {
      const p = app.plugins.plugins['game-shelf'];
      await p.updateSettings({ ...p.settings, folder, language, noteLanguage: language, provider: 'gamesneverdie', online: false,
        statuses: [...p.settings.statuses, '長いカスタムステータス Custom status with a long label'] });
      (await p.openShelf('library')).openManual();
    }, language, folder);
    const title = `${language} Mobile journal — 長いタイトルでもスマホとタブレットで記録できるゲーム`;
    await c.call('Input.insertText', { text: title });
    await tap('.gs-create-action button');
    await until(`app.plugins.plugins['game-shelf'].notes.list().some(x=>x.title===${JSON.stringify(title)})`);
    const path = await run(title => app.plugins.plugins['game-shelf'].notes.list().find(x => x.title === title).path, title);
    files.push(path);
    for (const [width, height] of [[320, 568], [360, 800], [390, 844], [430, 932], [600, 960], [744, 1133], [768, 1024], [820, 1180], [844, 390], [1024, 768], [1133, 744], [1440, 1000]]) {
      await viewport(width, height);
      await run(async () => { const v = await app.plugins.plugins['game-shelf'].openShelf('library'); v.libraryPath = null; v.layout = 'grid'; v.render(); });
      await layout(language, 'library');
      if (language === 'ja' && width === 390)
        await c.screenshot(new URL('../docs/media/mobile-library-390.png', import.meta.url).pathname);
      await tap('.gs-toolbar button');
      await layout(language, 'list');
      await run(async path => (await app.plugins.plugins['game-shelf'].openShelf('library')).selectLibrary(path), path);
      await layout(language, 'detail');
      if (language === 'ja' && [390, 744, 1133].includes(width))
        await c.screenshot(new URL(`../docs/media/mobile-detail-${width}.png`, import.meta.url).pathname);
      await run(async () => (await app.plugins.plugins['game-shelf'].openShelf('library')).openManual());
      await layout(language, 'manual');
      await run(async () => { const p = app.plugins.plugins['game-shelf']; await p.updateSettings({ ...p.settings, online: true }); await p.openShelf('discover'); });
      await layout(language, 'discover');
    }
    await viewport(390, 844);
    await run(async path => {
      const p = app.plugins.plugins['game-shelf'];
      const v = await p.openShelf('library');
      v.selectLibrary(path, true);
    }, path);
    const text = language === 'ja' ? 'タッチ操作と画面回転後も残るプレイ記録。' : 'A play log kept after touch input and rotation.';
    await c.call('Input.insertText', { text });
    await run(() => { const m = document.querySelector('.gs-journal input'); m.value = '17'; m.dispatchEvent(new Event('input', { bubbles: true })); });
    await viewport(844, 390);
    assert.equal(await c.evaluate(`document.querySelector('.gs-journal-text').value`), text);
    // Short viewport represents the space remaining above an on-screen keyboard.
    await viewport(390, 420);
    await layout(language, 'keyboard-space');
    await tap('.gs-journal button');
    await until(`document.querySelector('.gs-minutes-total')?.textContent.includes('17')`);
    const persisted = await run(async path => {
      const f = app.vault.getFileByPath(path);
      return { body: await app.vault.read(f), minutes: app.metadataCache.getFileCache(f)?.frontmatter.playtime_minutes };
    }, path);
    assert.equal(persisted.minutes, 17);
    assert(persisted.body.includes(text));
    report.interactions.push({ language, touchCreate: true, rotationPreservesDraft: true, touchSaveAboveKeyboard: true, persistedMinutes: 17 });
    await viewport(390, 844);
    await run(() => { document.activeElement.blur(); document.querySelector('.gs-shell').scrollTop = 0; });
    const header = await c.evaluate(`document.querySelector('.gs-header').getBoundingClientRect().top`);
    const start = await run(() => { const r = document.querySelector('.gs-shell').getBoundingClientRect(); return { x: r.left + 8, y: r.top + r.height * .7 }; });
    await swipe(start, 0, -200);
    assert(await c.evaluate(`document.querySelector('.gs-shell').scrollTop > 0`), 'Touch must scroll the content');
    await swipe({ ...start, x: start.x + 140 }, -120, 0);
    assert.equal(await c.evaluate(`document.querySelector('.gs-shell').scrollLeft`), 0);
    assert.equal(await c.evaluate(`document.querySelector('.gs-root').scrollTop`), 0);
    assert.equal(await c.evaluate(`document.querySelector('.gs-header').getBoundingClientRect().top`), header);
    report.interactions.push({ language, verticalTouchScroll: true, noHorizontalPan: true, headerFixed: true });
    await run(async () => {
      const p = app.plugins.plugins['game-shelf'];
      await p.openShelf('discover');
      const input = document.querySelector('.gs-search-form input');
      input.value = 'test'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await tap('.gs-search-form button');
    await until(`!!document.querySelector('.gs-result')`);
    await layout(language, 'search-results');
    await tap('.gs-result');
    await until(`!!document.querySelector('.gs-title-input')`);
    await layout(language, 'search-preview');
    await tap('.gs-detail-back');
    assert(await c.evaluate(`document.querySelector('.gs-result').getBoundingClientRect().width > 0`));
    console.log(`PASS ${language}: 12 viewport sizes, creation, journal, rotation, touch scrolling, search and back`);
  }
  await viewport(744, 1133);
  await run(() => {
    app.changeTheme('moonstone');
    document.querySelector('.gs-root').parentElement.classList.add('theme-light');
  });
  await pause();
  await layout('en', 'light-search-results');
  await c.screenshot(new URL('../docs/media/mobile-light-744.png', import.meta.url).pathname);
  // Floating navigation/home-indicator space stays outside the content scroller.
  await run(() => document.querySelector('.gs-root').parentElement.style.setProperty('--view-bottom-spacing', '84px'));
  const bottom = await run(() => {
    const r = document.querySelector('.gs-root').getBoundingClientRect();
    return r.bottom - document.querySelector('.gs-shell').getBoundingClientRect().bottom;
  });
  assert(bottom >= 84);
  report.interactions.push({ floatingNavigationReserved: bottom });
  await writeFile(new URL('../docs/mobile-checks.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS ${report.layouts.length} layouts; native iOS/Android remains untested.`);
} finally {
  await c.call('Fetch.disable');
  await run(async (files, saved) => {
    const p = app.plugins.plugins['game-shelf'];
    if (window.gsMobileRequest) { p.request = window.gsMobileRequest; delete window.gsMobileRequest; p.clearCaches(); }
    for (const path of files) { const f = app.vault.getFileByPath(path); if (f) await app.fileManager.trashFile(f); }
    const parent = document.querySelector('.gs-root')?.parentElement;
    parent?.classList.remove('is-mobile', 'theme-light');
    parent?.style.removeProperty('--view-bottom-spacing');
    if (saved) {
      await p.updateSettings(saved.settings);
      app.changeTheme(saved.theme.includes('theme-light') ? 'moonstone' : 'obsidian');
      await p.openShelf('library');
    }
  }, files, saved);
  await c.call('Emulation.setTouchEmulationEnabled', { enabled: false });
  await c.call('Emulation.setFocusEmulationEnabled', { enabled: false });
  await c.call('Emulation.clearDeviceMetricsOverride');
  c.close();
}
