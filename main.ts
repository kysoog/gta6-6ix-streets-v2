// Vice Meridian — the hand-in tool. Reads shots.json, serves game/ on loopback, drives
// headless Chromium through the DevTools protocol, waits for each scene's window.__shotReady
// flag, writes the screenshots, then builds out/dossier.json with the vendored make.fun
// library. Run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
};

function serve(root: string) {
  return new Promise<{ server: any; port: number }>((done) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(join(root, path));
      if (!file.startsWith(resolve(root) + '/') && file !== resolve(root)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      try {
        const body = readFileSync(file);
        res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => done({ server, port: (server.address() as any).port }));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CHROME_CANDIDATES = [
  process.env.MAKEFUN_CHROME,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
  '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
].filter(Boolean);

function findChrome() {
  for (const path of CHROME_CANDIDATES) if (path && existsSync(path)) return path;
  return null;
}

async function waitForDevtools(port: number, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return await response.json();
    } catch {
      // not listening yet
    }
    await sleep(60);
  }
  throw new Error('chromium devtools did not come up');
}

function connect(wsUrl: string) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map<number, { done: (v: any) => void; fail: (e: Error) => void }>();
  const listeners: Array<(m: any) => void> = [];
  const ready = new Promise<void>((done, fail) => {
    socket.addEventListener('open', () => done());
    socket.addEventListener('error', () => fail(new Error('devtools socket failed')));
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
    if (message.id !== undefined) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.fail(new Error(message.error.message));
      else waiter.done(message.result ?? {});
      return;
    }
    for (const listener of listeners) listener(message);
  });
  return {
    ready,
    on(listener: (m: any) => void) { listeners.push(listener); },
    send(method: string, params: any = {}, sessionId?: string) {
      const id = nextId++;
      const payload: any = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      socket.send(JSON.stringify(payload));
      return new Promise<any>((done, fail) => pending.set(id, { done, fail }));
    },
    close() { try { socket.close(); } catch { /* gone */ } },
  };
}

export async function captureScreenshots({
  gameDir, outDir, shotsPath, width = 1280, height = 800, verbose = true,
}: {
  gameDir: string; outDir: string; shotsPath: string; width?: number; height?: number; verbose?: boolean;
}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('no chromium binary found for headless capture');
  const shots = JSON.parse(readFileSync(shotsPath, 'utf8'));
  mkdirSync(outDir, { recursive: true });
  const { server, port } = await serve(gameDir);

  const userDataDir = join(tmpdir(), `makefun-shot-${process.pid}`);
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--disable-extensions',
    '--enable-unsafe-swiftshader',
    `--window-size=${width},${height}`,
    '--force-device-scale-factor=1',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let devtoolsPort: number | null = null;
  const stderrText: string[] = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderrText.push(chunk);
    const match = /DevTools listening on ws:\/\/(?:127\.0\.0\.1|localhost):(\d+)\//.exec(stderrText.join(''));
    if (match && devtoolsPort === null) devtoolsPort = Number(match[1]);
  });

  const cleanExit = () => { try { child.kill('SIGKILL'); } catch { /* gone */ } };

  try {
    const deadline = Date.now() + 20000;
    while (devtoolsPort === null && Date.now() < deadline) await sleep(40);
    if (devtoolsPort === null) throw new Error(`chromium gave no devtools port: ${stderrText.join('').slice(-400)}`);

    const version = await waitForDevtools(devtoolsPort);
    const cdp = connect(version.webSocketDebuggerUrl);
    await cdp.ready;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const logs: string[] = [];
    cdp.on((message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Runtime.consoleAPICalled') {
        const text = (message.params.args ?? []).map((a: any) => a.value ?? a.description ?? a.type).join(' ');
        logs.push(`${message.params.type}: ${text}`);
      } else if (message.method === 'Runtime.exceptionThrown') {
        logs.push(`exception: ${message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text}`);
      } else if (message.method === 'Log.entryAdded') {
        const entry = message.params.entry;
        if (entry.level === 'error' || entry.level === 'warning') logs.push(`log ${entry.level}: ${entry.text}`);
      }
    });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);

    const results: any[] = [];
    for (const shot of shots) {
      logs.length = 0;
      const url = `http://127.0.0.1:${port}/${shot.query ?? ''}`;
      await cdp.send('Page.navigate', { url }, sessionId);
      const started = Date.now();
      let ready = false;
      while (Date.now() - started < 300000) {
        const probe = await cdp.send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true }, sessionId);
        if (probe.result?.value === true) { ready = true; break; }
        await sleep(80);
      }
      if (!ready) throw new Error(`scene ${shot.name} never signalled __shotReady (${logs.slice(-6).join(' | ')})`);
      await cdp.send('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true }, sessionId);
      const capture = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88, captureBeyondViewport: false, fromSurface: true }, sessionId);
      const bytes = Buffer.from(capture.data, 'base64');
      const path = join(outDir, shot.name);
      writeFileSync(path, bytes);
      // Also keep the repository copy beside main.ts up to date.
      try { writeFileSync(join(here, 'screenshots', shot.name), bytes); } catch { /* best effort */ }
      results.push({ name: shot.name, bytes: bytes.length, ready, errors: logs.filter((l: string) => /exception|error/i.test(l)) });
      if (verbose) console.log(`shot ${shot.name}: ${bytes.length} bytes`);
    }
    cdp.close();
    return results;
  } finally {
    cleanExit();
    server.close();
  }
}

async function main() {
  const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
  if (!Array.isArray(shots) || shots.length === 0) throw new Error('shots.json must hold at least one shot');
  for (const shot of shots) {
    if (!existsSync(join(here, 'screenshots', shot.name))) {
      throw new Error(`shots.json lists ${shot.name} but screenshots/${shot.name} is missing`);
    }
  }

  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  await captureScreenshots({
    gameDir: join(here, 'game'),
    outDir: join(here, 'screenshots'),
    shotsPath: join(here, 'shots.json'),
  });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  }

  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, {
      text_max_bytes: 163840,
      screenshots: { max: 4, max_bytes: 262144 },
      game_max_files: 993,
      game_max_bytes: 50331648,
      game_path_max_bytes: 1000,
    }),
  );

  const names = readdirSync(join(out, 'screenshots')).filter((n) => n.endsWith('.jpg') || n.endsWith('.png'));
  console.log(`vice meridian: ${names.length} screenshots, dossier written`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(`main: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
