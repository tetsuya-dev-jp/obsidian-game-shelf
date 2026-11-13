// Capture the installed plugin in the isolated native Obsidian renderer.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { connect } from './cdp.mjs';

const c = await connect();
const output = new URL('../docs/media/', import.meta.url);
await mkdir(output, { recursive: true });
const results = [];
const axePath = process.env.AXE_SOURCE;
const axeSource = axePath ? await readFile(axePath, 'utf8') : null;
const run = (fn, ...args) =>
  c.evaluate(`(${fn.toString()})(${args.map((x) => JSON.stringify(x)).join(',')})`, {
    timeoutMs: 60000,
  });
const settle = () =>
  c.evaluate(
    `(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.all([...document.querySelectorAll('.gs-root img')].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r;setTimeout(r,5000)})));})()`,
  );
async function shot(name) {
  const pointer = await c.evaluate('({x:innerWidth-30,y:innerHeight-45})');
  await c.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...pointer });
  await settle();
  await c.evaluate(
    `new Promise(resolve=>{const end=Date.now()+2000;const check=()=>{const tooltips=[...document.querySelectorAll('.tooltip')].some(t=>Number(getComputedStyle(t).opacity)>.01);if(!tooltips||Date.now()>end)resolve();else requestAnimationFrame(check)};check()})`,
  );
  // Obsidian can leave an orphaned tooltip when its target is rerendered.
  // Dismiss this transient overlay only; do not alter the plugin's content.
  const dismissedTooltips = await c.evaluate(
    `(()=>{const tips=[...document.querySelectorAll('.tooltip')];for(const tip of tips)tip.remove();return tips.length;})()`,
  );
  const layout = await c.evaluate(
    `(()=>{const r=document.querySelector('.gs-root');return {viewport:[innerWidth,innerHeight],paneWidth:r.clientWidth,horizontalOverflow:r.scrollWidth>r.clientWidth+1,buttons:[...r.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).length}})()`,
  );
  if (layout.horizontalOverflow) throw new Error(`Horizontal overflow in ${name}`);
  if (axeSource) {
    await c.evaluate(axeSource);
    const audit = await c.evaluate(
      `axe.run(document.querySelector('.gs-root'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(x=>x.id)}))`,
      { timeoutMs: 60000 },
    );
    layout.accessibility = audit;
  }
  await c.screenshot(new URL(name, output).pathname);
  results.push({ name, dismissedTooltips, ...layout });
  console.log(name);
}
let settings;
try {
  settings = await c.evaluate(`structuredClone(app.plugins.plugins['game-shelf'].settings)`);
  await c.call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await run(async () => {
    app.setting.close();
    app.changeTheme('obsidian');
    const p = app.plugins.plugins['game-shelf'];
    await p.updateSettings({ ...p.settings, online: true, language: 'en' });
    const view = await p.openShelf('library');
    view.libraryPath = null;
    view.status = 'all';
    view.localQuery = '';
    view.platform = 'all';
    view.genre = 'all';
    view.setTab('library');
    document.querySelector('.gs-root').scrollTop = 0;
  });
  await shot('library-dark.png');
  await run(() => app.changeTheme('moonstone'));
  await shot('library-light.png');
  await run(async () => {
    app.changeTheme('obsidian');
    const p = app.plugins.plugins['game-shelf'];
    const view = await p.openShelf('discover');
    view.query = 'Sea of Stars';
    await view.performSearch(1);
    await view.selectGame('sea-of-stars');
  });
  await shot('discover.png');
  await run(async () => {
    const p = app.plugins.plugins['game-shelf'];
    const view = await p.openShelf('library');
    const item = p.notes.list().find((x) => x.slug === 'the-legend-of-zelda-ocarina-of-time--1');
    view.selectLibrary(item.path, true);
    const input = document.querySelector('.gs-journal-text');
    input.value = 'A quiet evening in Hyrule. The music made me stop and listen.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.gs-root').scrollTop = 0;
  });
  await shot('journal.png');
  await run(async () => {
    const p = app.plugins.plugins['game-shelf'];
    await p.updateSettings({ ...p.settings, language: 'ja' });
    const view = await p.openShelf('library');
    view.setTab('library');
    document.querySelector('.gs-detail>button')?.click();
  });
  await shot('library-ja.png');
  await run(() => {
    if (!app.workspace.leftSplit.collapsed) app.workspace.leftSplit.collapse();
  });
  await c.call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await c.evaluate(
    `new Promise(resolve=>{const end=Date.now()+3000;const check=()=>{if(document.querySelector('.gs-root').clientWidth>=innerWidth-60||Date.now()>end)resolve();else requestAnimationFrame(check)};check()})`,
  );
  await shot('narrow-library.png');
  await run(async () => {
    const p = app.plugins.plugins['game-shelf'];
    const view = await p.openShelf('library');
    const item = p.notes.list().find((x) => x.slug === 'the-legend-of-zelda-ocarina-of-time--1');
    view.selectLibrary(item.path, true);
  });
  await shot('narrow-journal.png');
  await run(async () => {
    const p = app.plugins.plugins['game-shelf'];
    const view = await p.openShelf('discover');
    await view.selectGame('sea-of-stars');
    document.querySelector('.gs-root').scrollTop = 0;
  });
  await shot('narrow-discover.png');
  await writeFile(
    new URL('../docs/visual-checks.json', import.meta.url),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        runtime: 'Real Obsidian 1.15.1 under xvfb; narrow desktop viewport, not native mobile',
        results,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await c.call('Emulation.clearDeviceMetricsOverride');
  if (settings)
    await run(async (settings) => {
      const p = app.plugins.plugins['game-shelf'];
      await p.updateSettings(settings);
      app.changeTheme('obsidian');
      await p.openShelf('library');
    }, settings).catch(() => undefined);
  c.close();
}
