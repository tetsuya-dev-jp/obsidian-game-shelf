// Minimal CDP client for the isolated Obsidian renderer; Node 24 supplies WebSocket.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function connect({
  port = 19491,
  vaultName = 'vault',
  urlPrefix = 'app://',
  timeoutMs = 30000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let target;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(Math.min(2000, deadline - Date.now())),
      });
      if (!response.ok) throw new Error(`CDP target list: HTTP ${response.status}`);
      const targets = await response.json();
      target = targets.find(
        (item) =>
          item.type === 'page' && item.url.startsWith(urlPrefix) && item.title.includes(vaultName),
      );
      if (target?.webSocketDebuggerUrl) break;
    } catch (error) {
      if (Date.now() + 200 >= deadline)
        throw new Error(`Obsidian CDP target unavailable: ${error.message}`);
    }
    await delay(200);
  }
  if (!target?.webSocketDebuggerUrl) throw new Error(`No app:// CDP page for vault ${vaultName}`);

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 0;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('CDP WebSocket open timed out')),
      Math.max(1, deadline - Date.now()),
    );
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('CDP WebSocket failed to open'));
      },
      { once: true },
    );
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method)
      for (const listener of listeners.get(message.method) ?? []) listener(message.params);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
    else request.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('CDP WebSocket closed'));
    }
    pending.clear();
  });

  function call(method, params = {}, { timeoutMs: callTimeoutMs = 15000 } = {}) {
    if (socket.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error('CDP WebSocket is not open'));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, callTimeoutMs);
      pending.set(id, { method, resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression, options = {}) {
    const { timeoutMs: evaluationTimeoutMs = 15000, ...runtimeOptions } = options;
    const result = await call(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
        ...runtimeOptions,
      },
      { timeoutMs: evaluationTimeoutMs },
    );
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text ||
          'Runtime.evaluate failed',
      );
    return result.result.value;
  }

  async function screenshot(filePath) {
    const { data } = await call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const png = Buffer.from(data, 'base64');
    if (filePath) await writeFile(path.resolve(filePath), png);
    return png;
  }

  function close() {
    socket.close();
  }
  function on(method, listener) {
    const set = listeners.get(method) ?? new Set();
    set.add(listener);
    listeners.set(method, set);
    return () => set.delete(listener);
  }
  return { target, call, evaluate, screenshot, close, on };
}
