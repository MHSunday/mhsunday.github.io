// js/main-calendar-docs.js — 班級 2026/27 行事曆 .docx 編輯器（admin）
//
// 資料流：
//   Google Drive .docx ──(GAS import)──> 編輯器 ──(Firestore 草稿)──> 發佈 ──(GAS publish)──> 同一個 .docx
//
// 注意：這個功能需要 Firestore（calendarConfig / classCalendars），
// 亦需要已部署新版 GAS（calendarDocs.js + web_main.js router）。

import {
  getAllClasses,
  getCalendarConfigs,
  saveCalendarConfig,
  getClassCalendar,
  saveClassCalendar,
  markClassCalendarPushed
} from './data.js';
import { importClassCalendarDoc, publishClassCalendarDoc, seedCalendarConfigs } from './api.js';
import { onRoleLoaded, logout } from './auth.js';
import { sortClasses } from './classOrder.js';

const $ = (id) => document.getElementById(id);

const FIELDS = [
  { key: 'date', label: '日期', placeholder: '例：9月6日', width: 'w-[92px]' },
  { key: 'sunday', label: '主日', placeholder: '例：常年期第23主日', width: 'w-[150px]' },
  { key: 'gospel', label: '福音', placeholder: '例：瑪18:15-20', width: 'w-[130px]' },
  { key: 'activity', label: '主日學特別活動', placeholder: '例：開學禮', width: 'w-[150px]' },
  { key: 'lesson', label: '課次及主題', placeholder: '例：課次 1', width: 'w-[150px]' },
  { key: 'note', label: '備註', placeholder: '例：玫瑰月', width: 'w-[150px]' }
];

const state = {
  classes: [],
  configs: new Map(),
  classKey: '',
  config: null,
  calendar: null,
  savedJson: '',
  draftSavedAt: '',
  lastPushedAt: '',
  source: '',
  lastImport: null,
  activeTable: 0
};

let loadToken = 0;
let busyDepth = 0;

// ============================================================
// 小工具
// ============================================================

function setMessage(text, type = 'info') {
  const el = $('message');
  if (!text) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  const styles = {
    info: 'bg-blue-50 border border-blue-200 text-blue-800',
    success: 'bg-green-50 border border-green-200 text-green-800',
    warning: 'bg-amber-50 border border-amber-300 text-amber-900',
    error: 'bg-red-50 border border-red-200 text-red-700'
  };
  el.className = `rounded-lg px-4 py-3 text-sm font-medium mb-4 ${styles[type] || styles.info}`;
  el.textContent = text;
  el.classList.remove('hidden');
}

function clearMessage() {
  setMessage('');
}

function setBusy(on, label) {
  if (on) {
    busyDepth++;
  } else {
    busyDepth = Math.max(0, busyDepth - 1);
  }
  if (on && label) setMessage(label, 'info');
  updateButtons();
}

function updateButtons() {
  const busy = busyDepth > 0;
  const hasCal = !!state.calendar;
  const docUrl = $('docUrlInput').value.trim();
  const hasDoc = !!extractDocId(docUrl);

  $('saveConfigBtn').disabled = busy || !state.classKey;
  $('importBtn').disabled = busy || !hasDoc;
  $('seedBtn').disabled = busy;
  $('reloadBtn').disabled = busy || !state.classKey;
  $('saveDraftBtn').disabled = busy || !hasCal;
  $('publishBtn').disabled = busy || !hasCal || !hasDoc;
  $('addRowBtn').disabled = busy || !hasCal;
  $('addSectionBtn').disabled = busy || !hasCal;
}

function extractDocId(urlOrId) {
  const raw = String(urlOrId || '').trim();
  if (!raw) return '';
  const m = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;
  return '';
}

function normalizeDocUrl(urlOrId) {
  const id = extractDocId(urlOrId);
  return id ? `https://docs.google.com/document/d/${id}/edit` : '';
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('zh-HK', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function snapshot(cal) {
  return JSON.stringify({ title: cal.title || '', tables: cal.tables || [] });
}

function isDirty() {
  return !!state.calendar && snapshot(state.calendar) !== state.savedJson;
}

function orderOf(classKey) {
  const i = state.classes.indexOf(classKey);
  return i >= 0 ? i + 1 : 0;
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight || 30) + 'px';
}

function autoGrowAll() {
  setTimeout(() => {
    document.querySelectorAll('#tableEditor textarea').forEach(autoGrow);
  }, 0);
}

// ============================================================
// 初始化
// ============================================================

async function init() {
  $('logoutBtn').addEventListener('click', () => logout());
  $('classSelect').addEventListener('change', (e) => selectClass(e.target.value));
  $('docUrlInput').addEventListener('input', () => {
    updateButtons();
    renderConfigInfo();
  });
  $('saveConfigBtn').addEventListener('click', saveConfigAndMaybeImport);
  $('importBtn').addEventListener('click', () => importFromDoc(false));
  $('seedBtn').addEventListener('click', seedAllConfigs);
  $('reloadBtn').addEventListener('click', () => selectClass(state.classKey, true));
  $('previewBtn').addEventListener('click', showPreview);
  $('saveDraftBtn').addEventListener('click', () => saveDraft(false));
  $('publishBtn').addEventListener('click', publish);
  $('addRowBtn').addEventListener('click', () => addRow('row'));
  $('addSectionBtn').addEventListener('click', () => addRow('section'));
  $('titleInput').addEventListener('input', (e) => {
    if (!state.calendar) return;
    state.calendar.title = e.target.value;
    updateDirtyStatus();
  });
  $('tableTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-table-index]');
    if (!btn) return;
    state.activeTable = Number(btn.dataset.tableIndex) || 0;
    renderTabs();
    renderTable();
  });
  $('tableEditor').addEventListener('input', onEditorInput);
  $('tableEditor').addEventListener('click', onEditorClick);
  $('closePreviewBtn').addEventListener('click', closePreview);
  $('printBtn').addEventListener('click', () => window.print());
  $('previewModal').addEventListener('click', (e) => {
    if (e.target === $('previewModal')) closePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
  });
  window.addEventListener('beforeunload', (e) => {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = '';
  });

  setBusy(true, '載入班級…');
  try {
    const [classes, configs] = await Promise.all([getAllClasses(), getCalendarConfigs()]);
    const all = new Set([...(classes || []), ...(configs || []).map(c => c.classKey)]);
    state.classes = sortClasses(Array.from(all));
    state.configs = new Map((configs || []).map(c => [c.classKey, c]));

    if (!state.classes.length) {
      setMessage('找不到任何班級。請先確認 Firestore classes 已同步。', 'error');
      return;
    }

    populateClassSelect();
    const param = new URLSearchParams(window.location.search).get('class');
    const firstWithDoc = state.classes.find(c => (state.configs.get(c) || {}).docUrl);
    const target = (param && state.classes.includes(param)) ? param : (firstWithDoc || state.classes[0]);
    $('classSelect').value = target;
    await selectClass(target, true);
  } catch (err) {
    setMessage(
      `載入失敗：${err.message}\n請確認已部署 Firestore rules（calendarConfig / classCalendars）。`,
      'error'
    );
  } finally {
    setBusy(false);
  }
}

function populateClassSelect() {
  const sel = $('classSelect');
  const prev = sel.value;
  sel.innerHTML = '';
  state.classes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    const cfg = state.configs.get(c);
    opt.textContent = (cfg && cfg.docUrl) ? `${c} ✓` : c;
    sel.appendChild(opt);
  });
  if (prev && state.classes.includes(prev)) sel.value = prev;
}

// ============================================================
// 選擇班級 + 載入
// ============================================================

async function selectClass(classKey, force = false) {
  if (!classKey) return;
  if (!force && isDirty()) {
    const ok = confirm('目前有未儲存變更，確定切換班級？');
    if (!ok) {
      $('classSelect').value = state.classKey;
      return;
    }
  }

  const token = ++loadToken;
  state.classKey = classKey;
  state.config = state.configs.get(classKey) || null;
  state.calendar = null;
  state.savedJson = '';
  state.draftSavedAt = '';
  state.lastPushedAt = '';
  state.source = '';
  state.activeTable = 0;

  $('docUrlInput').value = state.config ? (state.config.docUrl || '') : '';
  $('titleInput').value = '';
  $('emptyCard').classList.remove('hidden');
  $('editorCard').classList.add('hidden');
  $('actionBar').classList.add('hidden');
  $('tableTabs').innerHTML = '';
  $('tableEditor').innerHTML = '';
  clearMessage();
  renderConfigInfo();
  updateButtons();

  if (!state.config || !state.config.docUrl) {
    updateDirtyStatus();
    return;
  }

  setBusy(true, '載入草稿…');
  try {
    const draft = await getClassCalendar(classKey);
    if (token !== loadToken) return;
    if (draft && Array.isArray(draft.tables) && draft.tables.length) {
      state.calendar = normalizeCalendar({ title: draft.title || '', tables: draft.tables });
      state.savedJson = snapshot(state.calendar);
      state.draftSavedAt = draft.updatedAt || '';
      state.lastPushedAt = draft.lastPushedAt || '';
      state.source = 'draft';
      renderEditor();
      setMessage('已載入 Firestore 草稿。按「發佈到 Google Doc」才會寫入文件。', 'info');
    } else {
      await importFromDoc(true, token);
    }
  } catch (err) {
    if (token === loadToken) setMessage(`載入草稿失敗：${err.message}`, 'error');
  } finally {
    if (token === loadToken) setBusy(false);
  }
}

function normalizeCalendar(cal) {
  const clean = (v) => String(v == null ? '' : v).replace(/\r\n?/g, '\n');
  const tables = (cal && Array.isArray(cal.tables) ? cal.tables : []).map(t => ({
    rows: (t && Array.isArray(t.rows) ? t.rows : []).map(r => {
      if (r && r.type === 'section') {
        return { type: 'section', text: clean(r.text) };
      }
      return {
        type: 'row',
        date: clean(r && r.date),
        sunday: clean(r && r.sunday),
        gospel: clean(r && r.gospel),
        activity: clean(r && r.activity),
        lesson: clean(r && r.lesson),
        note: clean(r && r.note)
      };
    })
  }));
  return { title: clean(cal && cal.title), tables };
}

async function importFromDoc(auto = false, token = loadToken) {
  const url = normalizeDocUrl($('docUrlInput').value) || (state.config && state.config.docUrl) || '';
  if (!url) {
    setMessage('請先填寫 Google Doc 連結。', 'error');
    return;
  }
  if (!auto && isDirty()) {
    const ok = confirm('目前有未儲存變更，從文件載入會覆蓋編輯器內容。確定繼續？');
    if (!ok) return;
  }

  setBusy(true, '正在讀取 Google Doc…（第一次可能較慢）');
  try {
    const res = await importClassCalendarDoc(url);
    if (token !== loadToken) return;

    state.calendar = normalizeCalendar({ title: res.title, tables: res.tables });
    state.savedJson = snapshot(state.calendar);
    state.draftSavedAt = '';
    state.lastPushedAt = '';
    state.source = 'doc';
    state.lastImport = res;
    state.activeTable = 0;

    // 順手更新連結設定（不影響載入成功）
    let configWarning = '';
    try {
      const saved = await saveCalendarConfig(state.classKey, {
        className: state.classKey,
        docUrl: url,
        docId: res.docId,
        docTitle: res.docTitle,
        order: orderOf(state.classKey),
        enabled: true
      });
      state.config = { classKey: state.classKey, ...saved };
      state.configs.set(state.classKey, state.config);
      populateClassSelect();
      $('classSelect').value = state.classKey;
      renderConfigInfo();
    } catch (e) {
      configWarning = `（連結設定未能儲存：${e.message}）`;
    }

    renderEditor();
    setMessage(
      `已從文件載入「${res.docTitle || res.docId}」，共 ${res.rowCount} 列。尚未儲存草稿。${configWarning}`,
      configWarning ? 'warning' : 'success'
    );
  } catch (err) {
    if (token === loadToken) setMessage(`讀取失敗：${err.message}`, 'error');
  } finally {
    if (token === loadToken) setBusy(false);
  }
}

async function saveConfigAndMaybeImport() {
  if (!state.classKey) return;
  const raw = $('docUrlInput').value;
  const url = normalizeDocUrl(raw);
  if (raw.trim() && !url) {
    setMessage('連結格式不正確。請貼上 Google Docs 網址（包含 /d/…）或完整檔案 ID。', 'error');
    return;
  }

  setBusy(true, '儲存連結…');
  try {
    const cfg = await saveCalendarConfig(state.classKey, {
      className: state.classKey,
      docUrl: url,
      docId: extractDocId(url),
      docTitle: state.config ? (state.config.docTitle || '') : '',
      order: orderOf(state.classKey),
      enabled: !!url
    });
    state.config = { classKey: state.classKey, ...cfg };
    state.configs.set(state.classKey, state.config);
    $('docUrlInput').value = url;
    populateClassSelect();
    $('classSelect').value = state.classKey;
    renderConfigInfo();
    setMessage(url ? '文件連結已儲存。' : '已清除文件連結。', 'success');

    if (url && !state.calendar) {
      await importFromDoc(true);
    }
  } catch (err) {
    setMessage(`儲存連結失敗：${err.message}`, 'error');
  } finally {
    setBusy(false);
  }
}

async function seedAllConfigs() {
  const ok = confirm(
    '匯入 2026/27 的 9 個預設文件連結？\n\n' +
    '這只會更新「班級 ↔ 文件」設定，不會改動任何文件內容或草稿。\n' +
    '已存在的連結設定會被覆蓋。'
  );
  if (!ok) return;

  setBusy(true, '匯入預設文件連結…');
  try {
    const res = await seedCalendarConfigs();
    const configs = await getCalendarConfigs();
    state.configs = new Map(configs.map(c => [c.classKey, c]));
    state.config = state.configs.get(state.classKey) || null;
    $('docUrlInput').value = state.config ? (state.config.docUrl || '') : '';
    populateClassSelect();
    $('classSelect').value = state.classKey;
    renderConfigInfo();

    const bad = (res.results || []).filter(r => r.status !== 'ok');
    if (bad.length) {
      setMessage(
        `已匯入 ${res.saved} 個設定，其中 ${res.accessible} 個檔案可讀取。需注意：` +
        bad.map(r => `${r.className || '?'}（${r.reason || r.status}）`).join('；'),
        'warning'
      );
    } else {
      setMessage(`已匯入 ${res.saved} 個文件連結。`, 'success');
    }

    if (state.config && state.config.docUrl && !state.calendar) {
      await importFromDoc(true);
    }
  } catch (err) {
    setMessage(`匯入預設連結失敗：${err.message}`, 'error');
  } finally {
    setBusy(false);
  }
}

// ============================================================
// 渲染
// ============================================================

function renderConfigInfo() {
  const info = $('configInfo');
  const open = $('openDocLink');
  const inputUrl = normalizeDocUrl($('docUrlInput').value);
  const cfg = state.config;

  if (!cfg || !cfg.docUrl) {
    info.textContent = '未連結文件。貼上連結後按「儲存連結」。';
    open.classList.add('hidden');
    $('setupHint').classList.remove('hidden');
    return;
  }

  const parts = [];
  parts.push(`已連結：${cfg.docTitle || cfg.docId || '（未命名文件）'}`);
  if (cfg.updatedAt) parts.push(`設定更新：${fmtDateTime(cfg.updatedAt)}`);
  if (inputUrl && cfg.docUrl && inputUrl !== normalizeDocUrl(cfg.docUrl)) {
    parts.push('⚠️ 連結輸入框有未儲存變更');
  }
  info.textContent = parts.join('　｜　');
  open.href = cfg.docUrl;
  open.classList.remove('hidden');
  $('setupHint').classList.add('hidden');
}

function renderEditor() {
  $('emptyCard').classList.add('hidden');
  $('editorCard').classList.remove('hidden');
  $('actionBar').classList.remove('hidden');
  if (!state.calendar) return;

  if (state.activeTable >= state.calendar.tables.length) state.activeTable = 0;

  $('editorTitle').textContent = `${state.classKey}${state.config && state.config.docTitle ? ' — ' + state.config.docTitle : ''}`;
  $('titleInput').value = state.calendar.title || '';

  const regular = countRows(state.calendar, 'row');
  const sections = countRows(state.calendar, 'section');
  const meta = [
    `${state.calendar.tables.length} 個表格`,
    `${regular} 個資料列`,
    `${sections} 個分段列`
  ];
  if (state.draftSavedAt) meta.push(`草稿：${fmtDateTime(state.draftSavedAt)}`);
  if (state.lastPushedAt) meta.push(`上次發佈：${fmtDateTime(state.lastPushedAt)}`);
  if (state.source === 'doc') meta.push('來源：Google Doc（未儲存草稿）');
  $('editorMeta').textContent = meta.join('　｜　');

  renderTabs();
  renderTable();
  updateDirtyStatus();
  updateButtons();
}

function countRows(cal, type) {
  return (cal.tables || []).reduce(
    (n, t) => n + (t.rows || []).filter(r => (type === 'section' ? r.type === 'section' : r.type !== 'section')).length,
    0
  );
}

function renderTabs() {
  const wrap = $('tableTabs');
  wrap.innerHTML = '';
  if (!state.calendar) return;
  state.calendar.tables.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.tableIndex = String(i);
    btn.className = i === state.activeTable
      ? 'text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md font-medium'
      : 'text-sm bg-gray-100 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-200';
    btn.textContent = `表格 ${i + 1}（${(t.rows || []).length} 列）`;
    wrap.appendChild(btn);
  });
}

function renderTable() {
  const wrap = $('tableEditor');
  wrap.innerHTML = '';
  if (!state.calendar) return;
  const table = state.calendar.tables[state.activeTable];
  if (!table) return;

  const hint = document.createElement('div');
  hint.className = 'text-xs text-gray-500 mb-2';
  hint.textContent = '表頭固定不變；每格可按 Enter 分成多段（等同 Word 內多個段落）。';
  wrap.appendChild(hint);

  const tableEl = document.createElement('table');
  tableEl.className = 'cal-table w-full border-collapse min-w-[1000px] text-sm';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const opTh = document.createElement('th');
  opTh.className = 'w-[96px]';
  opTh.textContent = '操作';
  headRow.appendChild(opTh);
  FIELDS.forEach(f => {
    const th = document.createElement('th');
    th.className = f.width;
    th.textContent = f.label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  tableEl.appendChild(thead);

  const tbody = document.createElement('tbody');
  (table.rows || []).forEach((row, ri) => {
    if (row.type === 'section') {
      tbody.appendChild(buildSectionRow(ri, row));
    } else {
      tbody.appendChild(buildDataRow(ri, row));
    }
  });
  tableEl.appendChild(tbody);
  wrap.appendChild(tableEl);

  if (!(table.rows || []).length) {
    const empty = document.createElement('div');
    empty.className = 'text-center text-sm text-gray-400 py-6';
    empty.textContent = '呢個表格未有資料列。可按下面「新增資料列」開始。';
    wrap.appendChild(empty);
  }

  autoGrowAll();
}

function buildOps(ti, ri) {
  const box = document.createElement('div');
  box.className = 'flex items-center justify-center gap-1';

  const up = document.createElement('button');
  up.type = 'button';
  up.dataset.action = 'up';
  up.dataset.ti = String(ti);
  up.dataset.ri = String(ri);
  up.title = '上移';
  up.className = 'px-1.5 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100 text-xs';
  up.textContent = '↑';

  const down = document.createElement('button');
  down.type = 'button';
  down.dataset.action = 'down';
  down.dataset.ti = String(ti);
  down.dataset.ri = String(ri);
  down.title = '下移';
  down.className = 'px-1.5 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-100 text-xs';
  down.textContent = '↓';

  const del = document.createElement('button');
  del.type = 'button';
  del.dataset.action = 'delete';
  del.dataset.ti = String(ti);
  del.dataset.ri = String(ri);
  del.title = '刪除';
  del.className = 'px-1.5 py-0.5 rounded border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 text-xs';
  del.textContent = '✕';

  box.appendChild(up);
  box.appendChild(down);
  box.appendChild(del);
  return box;
}

function buildDataRow(ri, row) {
  const ti = state.activeTable;
  const tr = document.createElement('tr');
  tr.className = 'hover:bg-blue-50/40';

  const opTd = document.createElement('td');
  opTd.className = 'text-center';
  opTd.appendChild(buildOps(ti, ri));
  tr.appendChild(opTd);

  FIELDS.forEach(f => {
    const td = document.createElement('td');
    const ta = document.createElement('textarea');
    ta.className = 'cal-input';
    ta.rows = 1;
    ta.value = row[f.key] || '';
    ta.placeholder = f.placeholder;
    ta.dataset.field = f.key;
    ta.dataset.ti = String(ti);
    ta.dataset.ri = String(ri);
    td.appendChild(ta);
    tr.appendChild(td);
  });
  return tr;
}

function buildSectionRow(ri, row) {
  const ti = state.activeTable;
  const tr = document.createElement('tr');
  tr.className = 'bg-amber-50';

  const td = document.createElement('td');
  td.colSpan = FIELDS.length + 1;

  const box = document.createElement('div');
  box.className = 'flex items-start gap-2';

  const badge = document.createElement('span');
  badge.className = 'mt-1 shrink-0 text-[11px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded';
  badge.textContent = '分段';

  const ta = document.createElement('textarea');
  ta.className = 'cal-input flex-1';
  ta.rows = 1;
  ta.value = row.text || '';
  ta.placeholder = '例：甲年結束 – 乙年開始／2月10日(星期三)聖灰禮儀／3月25日…';
  ta.dataset.field = 'text';
  ta.dataset.ti = String(ti);
  ta.dataset.ri = String(ri);

  box.appendChild(badge);
  box.appendChild(ta);
  box.appendChild(buildOps(ti, ri));
  td.appendChild(box);
  tr.appendChild(td);
  return tr;
}

// ============================================================
// 編輯器事件
// ============================================================

function onEditorInput(e) {
  const ta = e.target.closest('textarea[data-field]');
  if (!ta || !state.calendar) return;
  const ti = Number(ta.dataset.ti);
  const ri = Number(ta.dataset.ri);
  const field = ta.dataset.field;
  const table = state.calendar.tables[ti];
  const row = table && table.rows[ri];
  if (!row) return;
  row[field] = ta.value;
  autoGrow(ta);
  updateDirtyStatus();
}

function onEditorClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn || !state.calendar) return;
  const ti = Number(btn.dataset.ti);
  const ri = Number(btn.dataset.ri);
  const table = state.calendar.tables[ti];
  if (!table || !table.rows[ri]) return;

  if (btn.dataset.action === 'up') {
    if (ri === 0) return;
    const tmp = table.rows[ri - 1];
    table.rows[ri - 1] = table.rows[ri];
    table.rows[ri] = tmp;
  } else if (btn.dataset.action === 'down') {
    if (ri >= table.rows.length - 1) return;
    const tmp = table.rows[ri + 1];
    table.rows[ri + 1] = table.rows[ri];
    table.rows[ri] = tmp;
  } else if (btn.dataset.action === 'delete') {
    if (!confirm('確定刪除此列？（未儲存前仍可重新載入草稿／文件）')) return;
    table.rows.splice(ri, 1);
  } else {
    return;
  }

  renderTabs();
  renderTable();
  updateDirtyStatus();
}

function addRow(kind) {
  if (!state.calendar) return;
  const table = state.calendar.tables[state.activeTable];
  if (!table) return;
  if (kind === 'section') {
    table.rows.push({ type: 'section', text: '' });
  } else {
    table.rows.push({
      type: 'row',
      date: '', sunday: '', gospel: '', activity: '', lesson: '', note: ''
    });
  }
  renderTabs();
  renderTable();
  updateDirtyStatus();
  // 聚焦新列第一個輸入框
  setTimeout(() => {
    const rows = document.querySelectorAll('#tableEditor tbody tr');
    const last = rows[rows.length - 1];
    const ta = last && last.querySelector('textarea');
    if (ta) ta.focus();
  }, 0);
}

function updateDirtyStatus() {
  const el = $('dirtyStatus');
  if (!state.calendar) {
    el.textContent = '';
    el.className = 'text-sm text-gray-500';
    return;
  }
  if (isDirty()) {
    el.textContent = '● 有未儲存變更';
    el.className = 'text-sm text-amber-700 font-medium';
  } else if (state.source === 'doc' && !state.draftSavedAt) {
    el.textContent = '已從文件載入（尚未儲存草稿）';
    el.className = 'text-sm text-sky-700';
  } else {
    el.textContent = '✓ 草稿已儲存';
    el.className = 'text-sm text-green-700';
  }
}

// ============================================================
// 儲存 / 發佈
// ============================================================

async function saveDraft(silent) {
  if (!state.calendar) return false;
  if (!String(state.calendar.title || '').trim()) {
    setMessage('文件標題不可空白。', 'error');
    return false;
  }

  setBusy(true, '儲存草稿…');
  try {
    const saved = await saveClassCalendar(state.classKey, {
      ...state.calendar,
      className: state.classKey
    });
    state.savedJson = snapshot(state.calendar);
    state.draftSavedAt = saved.updatedAt || new Date().toISOString();
    state.source = 'draft';
    updateDirtyStatus();
    renderEditorMetaOnly();
    if (!silent) setMessage('草稿已儲存（尚未寫入 Google Doc）。', 'success');
    return true;
  } catch (err) {
    setMessage(`儲存草稿失敗：${err.message}`, 'error');
    return false;
  } finally {
    setBusy(false);
  }
}

function renderEditorMetaOnly() {
  const regular = countRows(state.calendar, 'row');
  const sections = countRows(state.calendar, 'section');
  const meta = [
    `${state.calendar.tables.length} 個表格`,
    `${regular} 個資料列`,
    `${sections} 個分段列`
  ];
  if (state.draftSavedAt) meta.push(`草稿：${fmtDateTime(state.draftSavedAt)}`);
  if (state.lastPushedAt) meta.push(`上次發佈：${fmtDateTime(state.lastPushedAt)}`);
  if (state.source === 'doc') meta.push('來源：Google Doc（未儲存草稿）');
  $('editorMeta').textContent = meta.join('　｜　');
}

async function publish() {
  if (!state.calendar) return;
  const url = normalizeDocUrl($('docUrlInput').value) || (state.config && state.config.docUrl) || '';
  if (!url) {
    setMessage('請先設定 Google Doc 連結。', 'error');
    return;
  }

  const check = validateForPublish(state.calendar);
  if (!check.ok) {
    setMessage('未能發佈：\n- ' + check.errors.join('\n- '), 'error');
    return;
  }

  const warningText = check.warnings.length
    ? '\n\n請注意：\n- ' + check.warnings.join('\n- ')
    : '';
  const ok = confirm(
    `確定將「${state.calendar.title}」寫入 Google Doc？\n\n` +
    `檔案連結不變，但文件內現有表格內容會被覆蓋。${warningText}`
  );
  if (!ok) return;

  setBusy(true, '儲存草稿…');
  try {
    const saved = await saveClassCalendar(state.classKey, {
      ...state.calendar,
      className: state.classKey
    });
    state.savedJson = snapshot(state.calendar);
    state.draftSavedAt = saved.updatedAt || new Date().toISOString();
    state.source = 'draft';
    updateDirtyStatus();

    setMessage('正在寫入 Google Doc…（約需 5–20 秒）', 'info');
    const res = await publishClassCalendarDoc(url, state.calendar);

    state.lastPushedAt = res.lastPushedAt || new Date().toISOString();
    try {
      await markClassCalendarPushed(state.classKey, res);
    } catch (e) {
      // 不影響已寫入的文件；只提示
    }

    if (res.docId || res.docTitle || res.docUrl) {
      try {
        const cfg = await saveCalendarConfig(state.classKey, {
          className: state.classKey,
          docUrl: res.docUrl || url,
          docId: res.docId || extractDocId(url),
          docTitle: res.docTitle || (state.config && state.config.docTitle) || '',
          order: orderOf(state.classKey),
          enabled: true
        });
        state.config = { classKey: state.classKey, ...cfg };
        state.configs.set(state.classKey, state.config);
        populateClassSelect();
        $('classSelect').value = state.classKey;
        renderConfigInfo();
      } catch (e) {
        // ignore
      }
    }

    renderEditorMetaOnly();
    if (res.verified) {
      setMessage(
        `已發佈到「${res.docTitle || 'Google Doc'}」，自動驗證成功（${res.rowCount} 列）。` +
        `\n請開文件確認 Word 排版（字體／欄寬應保持不變）。`,
        'success'
      );
    } else {
      setMessage(
        `已寫入「${res.docTitle || 'Google Doc'}」，但自動驗證未通過：` +
        `${res.verifyError || '請開啟文件檢查內容'}。`,
        'warning'
      );
    }
  } catch (err) {
    setMessage(`發佈失敗：${err.message}`, 'error');
  } finally {
    setBusy(false);
  }
}

function validateForPublish(cal) {
  const errors = [];
  const warnings = [];
  if (!String(cal.title || '').trim()) errors.push('文件標題不可空白');
  if (!Array.isArray(cal.tables) || cal.tables.length !== 3) {
    errors.push(`草稿必須有 3 個表格（目前 ${Array.isArray(cal.tables) ? cal.tables.length : 0} 個）`);
  }

  let total = 0;
  const dates = [];
  (cal.tables || []).forEach((t, ti) => {
    if (!t.rows || !t.rows.length) warnings.push(`表格 ${ti + 1} 沒有資料列`);
    (t.rows || []).forEach((r, ri) => {
      total++;
      const where = `表格 ${ti + 1} 第 ${ri + 1} 列`;
      if (r.type === 'section') {
        if (!String(r.text || '').trim()) warnings.push(`${where}：分段標題空白`);
        return;
      }
      const vals = ['date', 'sunday', 'gospel', 'activity', 'lesson', 'note']
        .map(k => String(r[k] || '').trim());
      if (vals.every(v => !v)) warnings.push(`${where}：全空白`);
      if (!vals[0]) warnings.push(`${where}：沒有日期`);
      if (!vals[1] && !vals[2]) warnings.push(`${where}：沒有主日／福音`);
      if (vals[0]) dates.push(vals[0]);
    });
  });

  if (!total) errors.push('草稿沒有任何資料列');
  if (total > 400) errors.push('資料列過多（最多 400 列）');

  const seen = new Set();
  const dup = new Set();
  dates.forEach(d => {
    if (seen.has(d)) dup.add(d);
    seen.add(d);
  });
  if (dup.size) warnings.push(`日期重複：${Array.from(dup).slice(0, 6).join('、')}`);

  const trimWarnings = warnings.slice(0, 8);
  if (warnings.length > trimWarnings.length) trimWarnings.push(`…另有 ${warnings.length - trimWarnings.length} 項`);
  return { ok: errors.length === 0, errors, warnings: trimWarnings };
}

// ============================================================
// 預覽
// ============================================================

function showPreview() {
  if (!state.calendar) return;
  const modal = $('previewModal');
  const area = $('previewPrintArea');
  area.innerHTML = '';

  const h = document.createElement('h1');
  h.className = 'text-center text-xl font-bold mb-1';
  h.textContent = state.calendar.title || '（未命名）';
  area.appendChild(h);

  const sub = document.createElement('p');
  sub.className = 'text-center text-xs text-gray-500 mb-4';
  sub.textContent = `${state.classKey}　｜　預覽（未寫入文件）`;
  area.appendChild(sub);

  const check = validateForPublish(state.calendar);
  if (check.warnings.length || check.errors.length) {
    const box = document.createElement('div');
    box.className = 'mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900';
    box.textContent = [
      ...check.errors.map(e => '錯誤：' + e),
      ...check.warnings.map(w => '注意：' + w)
    ].join('\n');
    box.style.whiteSpace = 'pre-line';
    area.appendChild(box);
  }

  state.calendar.tables.forEach((t, ti) => {
    const caption = document.createElement('div');
    caption.className = 'mt-4 mb-1 text-sm font-bold text-gray-700';
    caption.textContent = `表格 ${ti + 1}`;
    area.appendChild(caption);

    const table = document.createElement('table');
    table.className = 'preview-table w-full border-collapse';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['日期', '主日及福音', '主日學特別活動', '課次及主題', '備註'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    (t.rows || []).forEach(r => {
      const tr = document.createElement('tr');
      if (r.type === 'section') {
        tr.className = 'section-row';
        const td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = r.text || '';
        td.style.whiteSpace = 'pre-line';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      const date = document.createElement('td');
      date.textContent = r.date || '';
      date.style.whiteSpace = 'pre-line';
      date.className = 'text-center';
      tr.appendChild(date);

      const sunday = document.createElement('td');
      const s1 = document.createElement('div');
      s1.textContent = r.sunday || '';
      sunday.appendChild(s1);
      if (r.gospel) {
        const s2 = document.createElement('div');
        s2.textContent = r.gospel;
        sunday.appendChild(s2);
      }
      sunday.style.whiteSpace = 'pre-line';
      tr.appendChild(sunday);

      [r.activity, r.lesson, r.note].forEach(v => {
        const td = document.createElement('td');
        td.textContent = v || '';
        td.style.whiteSpace = 'pre-line';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    area.appendChild(table);
  });

  modal.classList.remove('hidden');
}

function closePreview() {
  $('previewModal').classList.add('hidden');
}

// ============================================================
// 權限 gate
// ============================================================

onRoleLoaded((role) => {
  if (!role || role.role !== 'admin') {
    window.location.replace(role && role.role === 'staff' ? './staff.html' : './class_portal.html');
    return;
  }
  init();
});
