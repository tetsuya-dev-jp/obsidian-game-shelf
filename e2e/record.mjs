// Record the real isolated Obsidian renderer: node e2e/record.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const expectedVault = await realpath(path.join(here, '.runtime/vault'));
const state = JSON.parse(await readFile(path.join(here, '.runtime/launcher.json'), 'utf8'));
assert.equal(state.vaultPath, expectedVault, 'Refusing to record outside the isolated E2E vault');
assert.equal(state.port, 19491, 'Unexpected CDP port');
const output = path.join(root, 'docs/media');
const c = await connect({ port: state.port, vaultName: path.basename(expectedVault) });
const frameDir = await mkdtemp(path.join(os.tmpdir(), 'game-shelf-record-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = (fn, ...args) =>
  c.evaluate(`(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(',')})`, {
    timeoutMs: 60000,
  });

async function until(expression, timeoutMs = 25000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await c.evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function click(selector, text) {
  const point = await evaluate(
    async (selector, text) => {
      const element = [...document.querySelectorAll(selector)].find((candidate) => {
        if (text === undefined) return true;
        const title = candidate.querySelector('.gs-result-title,.gs-card-title');
        return title ? title.textContent.trim() === text : candidate.textContent.includes(text);
      });
      if (!element) throw new Error(`Missing visible control: ${selector} ${text ?? ''}`);
      if (element.matches(':disabled')) throw new Error(`Disabled control: ${selector}`);
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) throw new Error(`Hidden control: ${selector}`);
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
    selector,
    text,
  );
  await c.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await c.call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    clickCount: 1,
    ...point,
  });
  await c.call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    clickCount: 1,
    ...point,
  });
}

async function type(selector, value, keyDelay = 0) {
  await evaluate((selector) => {
    const input = document.querySelector(selector);
    if (!input) throw new Error(`Missing input: ${selector}`);
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector);
  for (const character of value) {
    await c.call('Input.insertText', { text: character });
    if (keyDelay) await sleep(keyDelay);
  }
}

async function command(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    child.stdout.on('data', (chunk) => {
      output = (output + chunk).slice(-4000);
    });
    child.stderr.on('data', (chunk) => {
      errors = (errors + chunk).slice(-4000);
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${program} exited ${code}: ${errors}`)),
    );
  });
}

let savedSettings;
let recording = false;
let recordStarted = 0;
let recorder;
let frameCount = 0;
let captureError;
async function captureFrames() {
  while (recording) {
    const started = Date.now();
    try {
      const { data } = await c.call(
        'Page.captureScreenshot',
        {
          format: 'jpeg',
          quality: 82,
          captureBeyondViewport: false,
        },
        { timeoutMs: 10000 },
      );
      await writeFile(
        path.join(frameDir, `frame-${String(frameCount++).padStart(6, '0')}.jpg`),
        Buffer.from(data, 'base64'),
      );
    } catch (error) {
      captureError = error;
      recording = false;
    }
    await sleep(Math.max(0, 200 - (Date.now() - started)));
  }
}

async function encode() {
  assert(frameCount > 0, 'No screenshots captured');
  await mkdir(output, { recursive: true });
  const input = path.join(frameDir, 'frame-%06d.jpg');
  const mp4 = path.join(frameDir, 'demo.mp4');
  const gif = path.join(frameDir, 'demo.gif');
  await command('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-framerate',
    '5',
    '-i',
    input,
    '-vf',
    'scale=1440:1000:flags=lanczos,format=yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    mp4,
  ]);
  await command('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-framerate',
    '5',
    '-i',
    input,
    '-filter_complex',
    '[0:v]fps=5,scale=800:-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse',
    gif,
  ]);
  for (const file of [mp4, gif]) {
    assert((await stat(file)).size > 0, `Empty output: ${file}`);
    const duration = Number(
      await command('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        file,
      ]),
    );
    assert(Number.isFinite(duration) && duration > 0, `Invalid duration: ${file}`);
  }
  await copyFile(mp4, path.join(output, 'demo.mp4'));
  await copyFile(gif, path.join(output, 'demo.gif'));
  return { frames: frameCount, seconds: frameCount / 5 };
}

try {
  assert.equal(await c.evaluate('app.vault.adapter.basePath'), expectedVault);
  assert(await c.evaluate("!!app.plugins.plugins['game-shelf']"), 'Game Shelf is not loaded');
  savedSettings = await c.evaluate("structuredClone(app.plugins.plugins['game-shelf'].settings)");
  const alreadyExists = await c.evaluate(
    "!!app.plugins.plugins['game-shelf'].notes.find('gnd:sea-of-stars')",
  );
  await c.call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await c.call('Page.bringToFront');
  await c.call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await evaluate(async () => {
    app.setting.close();
    const plugin = app.plugins.plugins['game-shelf'];
    await plugin.updateSettings({
      ...plugin.settings,
      online: true,
      language: 'en',
      folder: 'Games',
    });
    await plugin.openShelf('library');
  });
  await until("!!document.querySelector('.gs-library .gs-game-grid')");

  recording = true;
  recordStarted = Date.now();
  recorder = captureFrames();
  await sleep(1600);
  await click('.gs-nav button', 'Find a game');
  await sleep(700);
  await type('.gs-search-form input', 'Sea of Stars', 90);
  await sleep(300);
  await click('.gs-search-form button', 'Search');
  await until(
    "[...document.querySelectorAll('.gs-result-title')].some(x=>x.textContent.trim()==='Sea of Stars')",
  );
  await sleep(1200);
  await click('.gs-result', 'Sea of Stars');
  await until(
    "!!document.querySelector('.gs-detail-hero') && !!document.querySelector('.gs-detail-hero h2')?.textContent.includes('Sea of Stars')",
  );
  await sleep(1500);

  if (!alreadyExists) {
    await evaluate(() => {
      const control = document.querySelector('.gs-create-fields select[aria-label="Play status"]');
      if (!control || ![...control.options].some((option) => option.value === 'playing'))
        throw new Error('Playing status is unavailable');
      control.value = 'playing';
      control.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(650);
    await click('.gs-create-action button', 'Create');
    await until("!!app.plugins.plugins['game-shelf'].notes.find('gnd:sea-of-stars')", 30000);
    await sleep(1400);
  } else {
    await until("!!document.querySelector('.gs-added')");
    await sleep(1000);
  }

  await evaluate(async () => {
    await app.plugins.plugins['game-shelf'].openShelf('library');
  });
  await until(
    "[...document.querySelectorAll('.gs-game-card .gs-card-title')].some(x=>x.textContent.trim()==='Sea of Stars')",
  );
  await click('.gs-game-card', 'Sea of Stars');
  await until("!!document.querySelector('.gs-journal-text')");
  await sleep(1100);
  if (!alreadyExists) {
    await type(
      '.gs-journal-text',
      'Spent 25 minutes exploring the coast. The soundtrack made the return to camp feel memorable.',
      11,
    );
    await type('.gs-journal input[type="number"]', '25', 200);
    await sleep(800);
    await click('.gs-journal button', 'Save');
    await until("document.querySelector('.gs-minutes-total')?.textContent.includes('25')");
    await sleep(1500);
  }
  await click('.gs-nav button', 'Library');
  await sleep(850);
  const finalStatus = await c.evaluate(
    "app.plugins.plugins['game-shelf'].notes.list().find(x=>x.slug==='sea-of-stars')?.status",
  );
  assert(finalStatus, 'Sea of Stars is missing from the library index');
  const filter = `.gs-statuses button[data-status=${JSON.stringify(finalStatus)}]`;
  await click(filter);
  await until(`!!document.querySelector(${JSON.stringify(`${filter}.is-active`)})`);
  await sleep(1700);
  await sleep(Math.max(0, 22000 - (Date.now() - recordStarted)));
  recording = false;
  await recorder;
  if (captureError) throw captureError;
  const result = await encode();
  console.log(
    `Recorded ${result.frames} real UI frames (${result.seconds.toFixed(1)} s) to docs/media/demo.mp4 and demo.gif`,
  );
} finally {
  recording = false;
  if (recorder) await recorder;
  const cleanup = await Promise.allSettled([
    savedSettings
      ? evaluate(async (settings) => {
          await app.plugins.plugins['game-shelf'].updateSettings(settings);
        }, savedSettings)
      : Promise.resolve(),
    c.call('Emulation.clearDeviceMetricsOverride'),
    c.call('Emulation.setFocusEmulationEnabled', { enabled: false }),
  ]);
  for (const result of cleanup)
    if (result.status === 'rejected') console.error('Cleanup:', result.reason);
  c.close();
  await rm(frameDir, { recursive: true, force: true });
  if (cleanup.some((result) => result.status === 'rejected')) process.exitCode = 1;
}
