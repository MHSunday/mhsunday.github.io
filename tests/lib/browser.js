// tests/lib/browser.js — 無第三方依賴嘅 Chrome CDP 測試工具
// 啟動本機靜態 server、headless Chrome，為每個角色建立獨立 target，
// 攔截所有外部請求，並用 mocks.js 取代 data.js / api.js。

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { CLASSES, rolePreload, SNAPSHOT_EXPR, STUB_API, STUB_DATA } from './mocks.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8'
};

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export function startStaticServer(root, port) {
  const rootAbs = path.resolve(root);
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const rel = pathname.replace(/^\/+/, '');
    const abs = path.resolve(rootAbs, rel);
    const inside = abs === rootAbs || abs.startsWith(rootAbs + path.sep);
    let stat = null;
    try { stat = fs.statSync(abs); } catch { /* missing */ }
    if (!inside || !stat || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ].filter(Boolean);
  const found = candidates.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });
  if (!found) {
    throw new Error('搵唔到 Chrome。請設定 CHROME_PATH 環境變數指向 chrome 執行檔。');
  }
  return found;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.handlers.get(msg.method) || []) {
          try { fn(msg.params, msg.sessionId); } catch { /* handler error */ }
        }
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
}

export class RolePage {
  constructor(browser, roleKey, { targetId, sessionId }) {
    this.browser = browser;
    this.roleKey = roleKey;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.events = { console: [], exception: [], loadingFailed: [], response: [] };
  }

  async _evaluate(expression) {
    const r = await this.browser.cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    }, this.sessionId);
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'evaluate failed');
    }
    return r.result.value;
  }

  /** 按 element id（用嚟測試頁籤／按鈕互動） */
  async click(id) {
    return this._evaluate(`(() => {
      const el = document.getElementById(${JSON.stringify(id)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
  }

  /** 再攞一次 snapshot（唔導航） */
  async snapshot() {
    return this._evaluate(SNAPSHOT_EXPR);
  }

  /** 導航到某頁，等固定時間後收集 snapshot + errors */
  async visit(relPath, waitMs = this.browser.waitMs) {
    const marks = {
      console: this.events.console.length,
      exception: this.events.exception.length,
      loadingFailed: this.events.loadingFailed.length,
      response: this.events.response.length
    };
    const url = this.browser.baseUrl + relPath;
    const navErrors = [];
    try {
      const r = await this.browser.cdp.send('Page.navigate', { url }, this.sessionId);
      if (r?.errorText) navErrors.push(`nav: ${r.errorText}`);
    } catch (e) {
      navErrors.push(`nav: ${e.message}`);
    }

    await sleep(waitMs);

    let snapshot;
    try {
      snapshot = await this._evaluate(SNAPSHOT_EXPR);
    } catch (e) {
      snapshot = {
        pathname: '', search: '', title: '', readyState: '',
        visibleIds: [], hiddenIds: [], links: [], actions: [], activeTab: '',
        message: '', bodyText: '', alerts: [], apiCalls: [], dataCalls: [],
        classOptionCount: null, classSelectValue: null, classSelectDisabled: null
      };
      navErrors.push(`snapshot: ${e.message}`);
    }

    const consoleErrors = this.events.console.slice(marks.console)
      .filter((p) => p.type === 'error')
      .map((p) => (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 400));
    const pageErrors = [
      ...navErrors,
      ...this.events.exception.slice(marks.exception)
        .map((p) => (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 500))
    ];
    const netFails = this.events.loadingFailed.slice(marks.loadingFailed)
      .filter((p) => !['net::ERR_ABORTED', 'net::ERR_BLOCKED_BY_CLIENT'].includes(p.errorText))
      .map((p) => `${p.errorText} ${p.type || ''}`.trim());
    const badResponses = this.events.response.slice(marks.response)
      .filter((p) => p.response.status >= 400 && !/\/favicon\.ico($|\?)/.test(p.response.url))
      .map((p) => `${p.response.status} ${p.response.url}`);

    return {
      role: this.roleKey,
      requested: relPath,
      url,
      ...snapshot,
      consoleErrors,
      pageErrors,
      netFails,
      badResponses
    };
  }

  async close() {
    try { await this.browser.cdp.send('Target.closeTarget', { targetId: this.targetId }); } catch { /* gone */ }
  }
}

export class Browser {
  constructor({ root, server, chrome, cdp, ws, chromePort, profileDir, waitMs }) {
    this.root = root;
    this.server = server;
    this.chrome = chrome;
    this.cdp = cdp;
    this.ws = ws;
    this.chromePort = chromePort;
    this.profileDir = profileDir;
    this.waitMs = waitMs;
    this.baseUrl = `http://127.0.0.1:${server.address().port}/`;
    this._targets = [];
  }

  /** 建立一個角色 context（新 target + 專屬 preload / request interception） */
  async role(roleKey) {
    const { targetId } = await this.cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new RolePage(this, roleKey, { targetId, sessionId });
    this._targets.push(page);

    const s = sessionId;
    await this.cdp.send('Page.enable', {}, s);
    await this.cdp.send('Runtime.enable', {}, s);
    await this.cdp.send('Network.enable', {}, s);
    await this.cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, s);

    this.cdp.on('Runtime.consoleAPICalled', (p, sid) => {
      if (sid === s) page.events.console.push(p);
    });
    this.cdp.on('Runtime.exceptionThrown', (p, sid) => {
      if (sid === s) page.events.exception.push(p);
    });
    this.cdp.on('Network.loadingFailed', (p, sid) => {
      if (sid === s) page.events.loadingFailed.push(p);
    });
    this.cdp.on('Network.responseReceived', (p, sid) => {
      if (sid === s) page.events.response.push(p);
    });

    this.cdp.on('Fetch.requestPaused', async (p, sid) => {
      if (sid !== s) return;
      try {
        const u = p.request.url;
        let body = null;
        let contentType = 'application/javascript; charset=utf-8';

        if (u.startsWith(this.baseUrl)) {
          let pathname = '';
          try { pathname = new URL(u).pathname; } catch { /* ignore */ }
          if (pathname.endsWith('/js/data.js')) {
            body = STUB_DATA;
          } else if (pathname.endsWith('/js/api.js')) {
            body = STUB_API;
          } else {
            await this.cdp.send('Fetch.continueRequest', { requestId: p.requestId }, s);
            return;
          }
        } else {
          // 所有外部請求（firebase / tailwind / fonts…）即刻用空內容回應
          body = '';
          if (u.includes('.css')) contentType = 'text/css; charset=utf-8';
        }

        await this.cdp.send('Fetch.fulfillRequest', {
          requestId: p.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: contentType },
            { name: 'Access-Control-Allow-Origin', value: '*' },
            { name: 'Cache-Control', value: 'no-store' }
          ],
          body: Buffer.from(body, 'utf8').toString('base64')
        }, s);
      } catch {
        // target 可能已經關閉
      }
    });

    await this.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: rolePreload(roleKey)
    }, s);

    return page;
  }

  /** 一次過用多個角色跑同一批頁面 */
  async visitRole(roleKey, pages) {
    const page = await this.role(roleKey);
    const out = [];
    for (const p of pages) {
      out.push(await page.visit(p));
    }
    return { page, results: out };
  }

  async stop() {
    for (const p of this._targets) {
      try { await p.close(); } catch { /* gone */ }
    }
    try { this.ws.close(); } catch { /* ignore */ }
    try {
      if (process.platform === 'win32' && this.chrome.pid) {
        await new Promise((resolve) => {
          const t = spawn('taskkill', ['/PID', String(this.chrome.pid), '/T', '/F'], { stdio: 'ignore' });
          t.on('exit', resolve);
          t.on('error', resolve);
          setTimeout(resolve, 3000);
        });
      } else {
        this.chrome.kill('SIGKILL');
      }
    } catch { /* ignore */ }
    await sleep(150);
    try { this.server.close(); } catch { /* ignore */ }
    try { fs.rmSync(this.profileDir, { recursive: true, force: true }); } catch { /* windows lock */ }
  }
}

export async function startBrowser({ root, waitMs = 2400 } = {}) {
  const chromePath = findChrome();
  const serverPort = await getFreePort();
  const server = await startStaticServer(root, serverPort);
  const chromePort = await getFreePort();
  const profileDir = path.join(os.tmpdir(), `mhsunday-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });

  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 80; i++) {
    if (chrome.exitCode !== null) break;
    try {
      const res = await fetch(`http://127.0.0.1:${chromePort}/json/version`);
      version = await res.json();
      break;
    } catch {
      await sleep(150);
    }
  }
  if (!version) {
    try { chrome.kill(); } catch { /* ignore */ }
    server.close();
    throw new Error('Chrome CDP 無啟動（可能係端口或執行檔問題）');
  }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = new CDP(ws);
  return new Browser({ root, server, chrome, cdp, ws, chromePort, profileDir, waitMs });
}

export { CLASSES };
