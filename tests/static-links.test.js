// tests/static-links.test.js — 檢查所有本機連結、資源同 ES module import 都存在
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const htmlFiles = fs.readdirSync(ROOT)
  .filter((f) => f.toLowerCase().endsWith('.html'))
  .sort();

const jsFiles = fs.readdirSync(path.join(ROOT, 'js'))
  .filter((f) => f.toLowerCase().endsWith('.js'))
  .sort()
  .map((f) => path.join('js', f));

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|$)/i;

function isExternalOrDynamic(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  if (EXTERNAL.test(v)) return true;
  if (v.includes('${')) return true;
  return false;
}

function cleanTarget(value) {
  let v = String(value || '').trim();
  v = v.replace(/&amp;/g, '&');
  v = v.split('#')[0].split('?')[0];
  try { v = decodeURIComponent(v); } catch { /* keep raw */ }
  return v;
}

function resolveTarget(fromFile, value) {
  const cleaned = cleanTarget(value);
  if (!cleaned) return null;
  if (cleaned.startsWith('/')) return path.resolve(ROOT, cleaned.replace(/^\/+/, ''));
  return path.resolve(ROOT, path.dirname(fromFile), cleaned);
}

function assertExists(fromFile, value, kind) {
  if (isExternalOrDynamic(value)) return;
  if (String(value || '').trim().startsWith('//')) return;
  const cleaned = cleanTarget(value);
  if (!cleaned) return;
  const abs = resolveTarget(fromFile, value);
  if (!abs) return;
  const rel = path.relative(ROOT, abs) || '.';
  assert.ok(fs.existsSync(abs), `${fromFile}: ${kind} 指向不存在嘅檔案 → ${value} (${rel})`);
}

/** 由 JS 嘅 .html 導航字串解析：一律相對於網站根目錄 */
function assertRootTarget(fromFile, value, kind) {
  if (isExternalOrDynamic(value)) return;
  const v = String(value || '').trim();
  if (v.startsWith('//')) return;
  const cleaned = cleanTarget(v);
  if (!cleaned) return;
  const abs = path.resolve(ROOT, cleaned.replace(/^\.\//, '').replace(/^\/+/, ''));
  const rel = path.relative(ROOT, abs) || '.';
  assert.ok(fs.existsSync(abs), `${fromFile}: ${kind} 指向不存在嘅檔案 → ${value} (${rel})`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** 抽出 HTML 內所有 href / src 屬性 */
function collectHtmlAttributes(html) {
  const out = [];
  const re = /\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = re.exec(html))) {
    out.push({ kind: m[1], value: m[2] ?? m[3] ?? '' });
  }
  return out;
}

/** 抽出 <script type="module"> 內嘅 import */
function collectInlineImports(html) {
  const out = [];
  const scriptRe = /<script\b[^>]*type\s*=\s*["']module["'][^>]*>([\s\S]*?)<\/script>/gi;
  let s;
  while ((s = scriptRe.exec(html))) {
    const code = s[1];
    for (const m of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) out.push(m[1]);
    for (const m of code.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
    for (const m of code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1]);
  }
  return out;
}

function collectModuleSpecifiers(code) {
  const out = [];
  for (const m of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of code.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  for (const m of code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1]);
  return out;
}

function collectHtmlNavigationTargets(text) {
  const out = [];
  for (const m of text.matchAll(/['"`]((?:\.\/)?[\w./-]+\.html)(?:[?#][^'"`]*)?['"`]/g)) {
    out.push(m[1]);
  }
  return out;
}

test('HTML 嘅本機 href / src 全部存在', () => {
  const missing = [];
  for (const file of htmlFiles) {
    const html = read(file);
    for (const attr of collectHtmlAttributes(html)) {
      try {
        assertExists(file, attr.value, attr.kind);
      } catch (e) {
        missing.push(e.message);
      }
    }
  }
  assert.deepEqual(missing, [], `發現 ${missing.length} 個不存在嘅本機資源`);
});

test('HTML 內嵌 module script 嘅 import 全部存在', () => {
  const broken = [];
  for (const file of htmlFiles) {
    for (const spec of collectInlineImports(read(file))) {
      try {
        assertExists(file, spec, 'import');
      } catch (e) {
        broken.push(e.message);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('js/*.js 嘅 import 全部存在', () => {
  const broken = [];
  for (const file of jsFiles) {
    for (const spec of collectModuleSpecifiers(read(file))) {
      if (!spec.startsWith('.') && !spec.startsWith('/')) continue;
      try {
        assertExists(file, spec, 'import');
      } catch (e) {
        broken.push(e.message);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('程式入面寫死嘅 .html 導航目標全部存在', () => {
  const broken = [];
  const files = [...htmlFiles, ...jsFiles];
  for (const file of files) {
    const text = read(file);
    for (const target of collectHtmlNavigationTargets(text)) {
      try {
        assertRootTarget(file, target, 'navigation');
      } catch (e) {
        broken.push(e.message);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('每個 HTML 頁都有 <title>', () => {
  const missing = [];
  for (const file of htmlFiles) {
    if (!/<title>[^<]+<\/title>/i.test(read(file))) missing.push(file);
  }
  assert.deepEqual(missing, []);
});
