// Usage: node e2e/launch.mjs start|stop|status|prepare
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
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
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'e2e/.runtime');
const vault = path.join(runtime, 'vault');
const stateFile = path.join(runtime, 'launcher.json');
const appRun = path.resolve(
  process.env.OBSIDIAN_BINARY || path.join(runtime, 'app/squashfs-root/AppRun'),
);
const port = 19491;
const pluginId = 'game-shelf';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function existingState() {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function processStartTicks(pid) {
  try {
    const line = await readFile(`/proc/${pid}/stat`, 'utf8');
    return line.slice(line.lastIndexOf(')') + 2).split(' ')[19];
  } catch {
    return null;
  }
}

async function isOurProcess(state) {
  return (
    state?.pid && state.startTicks && (await processStartTicks(state.pid)) === state.startTicks
  );
}

async function prepare() {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.id !== pluginId)
    throw new Error(`Expected manifest id ${pluginId}, got ${manifest.id}`);
  try {
    await stat(path.join(root, 'main.js'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Build the plugin first: main.js is missing');
    throw error;
  }
  await mkdir(path.join(vault, '.obsidian/plugins', pluginId), { recursive: true });
  for (const name of ['main.js', 'manifest.json', 'styles.css']) {
    try {
      await copyFile(path.join(root, name), path.join(vault, '.obsidian/plugins', pluginId, name));
    } catch (error) {
      if (name !== 'styles.css' || error.code !== 'ENOENT') throw error;
    }
  }
  const enabledFile = path.join(vault, '.obsidian/community-plugins.json');
  let enabled = [];
  try {
    enabled = JSON.parse(await readFile(enabledFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!Array.isArray(enabled)) throw new Error('community-plugins.json must be an array');
  if (!enabled.includes(pluginId))
    await writeFile(enabledFile, JSON.stringify([...enabled, pluginId], null, 2) + '\n');
  return await realpath(vault);
}

async function portIsFree() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => (error.code === 'EADDRINUSE' ? resolve(false) : reject(error)));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function waitForCdp(pid) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (!(await processStartTicks(pid)))
      throw new Error('Obsidian process exited before CDP became available');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      /* Startup is asynchronous. */
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for Obsidian CDP');
}

async function stop(state) {
  if (!state) return;
  if (await isOurProcess(state)) {
    try {
      process.kill(-state.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    for (let i = 0; i < 40 && (await isOurProcess(state)); i++) await delay(100);
    if (await isOurProcess(state)) {
      try {
        process.kill(-state.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
  if (
    state.tempRoot &&
    path.dirname(state.tempRoot) === os.tmpdir() &&
    path.basename(state.tempRoot).startsWith('game-shelf-e2e-')
  ) {
    await rm(state.tempRoot, { recursive: true, force: true });
  }
  await rm(stateFile, { force: true });
}

async function start() {
  const current = await existingState();
  if (await isOurProcess(current))
    throw new Error(`Isolated Obsidian already running (PID ${current.pid})`);
  if (current) await stop(current);
  if (!(await portIsFree())) throw new Error(`CDP port ${port} is already in use`);
  const vaultPath = await prepare();
  await stat(appRun);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'game-shelf-e2e-'));
  const configHome = path.join(tempRoot, 'config');
  const userDataDir = path.join(configHome, 'obsidian');
  await mkdir(userDataDir, { recursive: true });
  const id = randomBytes(8).toString('hex');
  await writeFile(
    path.join(userDataDir, 'obsidian.json'),
    JSON.stringify(
      {
        vaults: { [id]: { path: vaultPath, ts: Date.now(), open: true, trust: true } },
      },
      null,
      2,
    ) + '\n',
  );
  const log = openSync(path.join(tempRoot, 'obsidian.log'), 'a');
  const child = spawn(
    'xvfb-run',
    [
      '-a',
      '--server-args=-screen 0 1440x900x24',
      appRun,
      '--no-sandbox',
      '--user-data-dir=' + userDataDir,
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=' + port,
      vaultPath,
    ],
    {
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, XDG_CONFIG_HOME: configHome, TZ: 'Asia/Tokyo' },
    },
  );
  child.unref();
  closeSync(log);
  let startTicks;
  for (let i = 0; i < 20 && !startTicks; i++) {
    startTicks = await processStartTicks(child.pid);
    if (!startTicks) await delay(10);
  }
  const state = { pid: child.pid, startTicks, tempRoot, vaultPath, userDataDir, port };
  await writeFile(stateFile, JSON.stringify(state, null, 2) + '\n');
  try {
    await waitForCdp(child.pid);
  } catch (error) {
    await stop(state);
    throw error;
  }
  console.log(JSON.stringify({ ...state, log: path.join(tempRoot, 'obsidian.log') }, null, 2));
}

const command = process.argv[2];
try {
  if (command === 'prepare') console.log(await prepare());
  else if (command === 'start') await start();
  else if (command === 'stop') {
    await stop(await existingState());
    console.log('Stopped isolated Obsidian; vault preserved.');
  } else if (command === 'status') {
    const state = await existingState();
    console.log(JSON.stringify({ running: Boolean(await isOurProcess(state)), state }, null, 2));
  } else throw new Error('Usage: node e2e/launch.mjs start|stop|status|prepare');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
