// Dev probe: loads a page from game/ in headless chromium, waits for __shotReady, then samples
// window.__fps, __diag and any console errors. `node tools/probe.mjs [root] [query] [sampleMs]`
const HELP = `Usage: node tools/probe.mjs [root] [query] [sampleMs]

  root       directory to serve from (default: game)
  query      URL path + query, e.g. "?shot=play&seed=1" (default: "")
  sampleMs   how long to sample fps, ms (default: 2000)
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'game');
const query = process.argv[3] ?? '';
const sampleMs = Number(process.argv[4] ?? 2000);
const width = Number(process.env.W ?? 1280);
const height = Number(process.env.H ?? 800);

if (!existsSync(root)) {
  console.error(`probe: root does not exist: ${root}`);
  process.exit(1);
}
if (!Number.isFinite(sampleMs) || sampleMs <= 0) {
  console.error('probe: sampleMs must be a positive number');
  process.exit(1);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' };

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(root, path));
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('nf');
  }
});
await new Promise((d) => server.listen(0, '127.0.0.1', d));
const port = server.address().port;

const chrome = '/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const child = spawn(chrome, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-gl=angle',
  '--window-size=' + width + ',' + height, '--force-device-scale-factor=1',
  '--remote-debugging-port=0', `--user-data-dir=${process.env.TMPDIR ?? '/tmp'}/probe-${process.pid}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let devPort = null;
let errText = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', (c) => {
  errText += c;
  const m = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(errText);
  if (m && devPort === null) devPort = Number(m[1]);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
while (devPort === null) await sleep(40);
let version = null;
const vDeadline = Date.now() + 30000;
while (!version && Date.now() < vDeadline) {
  try { version = await (await fetch(`http://127.0.0.1:${devPort}/json/version`)).json(); } catch { await sleep(60); }
}
if (!version) throw new Error('probe: chrome DevTools version endpoint unreachable');
const ws = new WebSocket(version.webSocketDebuggerUrl);
let id = 1;
const pending = new Map();
const logs = [];
await new Promise((d) => ws.addEventListener('open', d));
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.fail(new Error(JSON.stringify(msg.error))) : p.done(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') logs.push(`${msg.params.type}: ${(msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
  if (msg.method === 'Runtime.exceptionThrown') logs.push(`EXCEPTION: ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`);
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level !== 'verbose') logs.push(`log ${msg.params.entry.level}: ${msg.params.entry.text}`);
});
const send = (method, params = {}, sessionId) => {
  const mid = id++;
  const payload = { id: mid, method, params };
  if (sessionId) payload.sessionId = sessionId;
  ws.send(JSON.stringify(payload));
  return new Promise((done, fail) => pending.set(mid, { done, fail }));
};
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
await send('Page.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: `http://127.0.0.1:${port}/${query}` }, sessionId);
const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 180000) {
  const p = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true }, sessionId);
  if (p.result?.value === true) { ready = true; break; }
  await sleep(100);
}
const fpsProbe = await send('Runtime.evaluate', {
  expression: `new Promise((done) => { let f = 0; const t0 = performance.now(); let worst = 0, last = t0;
    function tick(now){ f++; worst = Math.max(worst, now - last); last = now;
      if (now - t0 < ${sampleMs}) requestAnimationFrame(tick); else done({ fps: f / ((now - t0) / 1000), frames: f, worstMs: worst }); }
    requestAnimationFrame(tick); })`,
  awaitPromise: true, returnByValue: true,
}, sessionId);
const diag = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__diag ?? null)', returnByValue: true }, sessionId);
console.log(JSON.stringify({ ready, fps: fpsProbe.result?.value, diag: JSON.parse(diag.result?.value ?? 'null'), logs: logs.filter((l) => !/Failed to load resource/.test(l)).slice(0, 40) }, null, 1));
child.kill('SIGKILL');
server.close();
process.exit(0);
