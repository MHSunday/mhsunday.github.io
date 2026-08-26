// js/main-sessions.js — 上堂日曆管理頁（僅管理員）
import { getSessions, saveSessions } from './api.js';
import { onRoleLoaded, logout } from './auth.js';

const $ = (id) => document.getElementById(id);

let sessionsCache = [];

function setMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text || '';
  el.className = `text-center text-sm font-medium min-h-[1.25rem] ${isError ? 'text-red-600' : 'text-green-600'}`;
}

function sessionTagClass(eventText) {
  if (!eventText) return '';
  if (eventText.startsWith('假期')) return 'bg-gray-100 text-gray-500';
  if (eventText.includes('彌撒') || eventText.includes('活動') || eventText.includes('禮') || eventText.includes('慶祝會') || eventText.includes('領堅振') || eventText.includes('初領聖體') || eventText.includes('開學禮') || eventText.includes('結業禮')) return 'bg-orange-50';
  return '';
}

function renderSessions(list) {
  const body = $('sessionsBody');
  body.innerHTML = '';
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="3" class="border p-4 text-center text-gray-400">沒有資料</td></tr>';
    return;
  }
  for (const s of list) {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-blue-50';

    const dateTd = document.createElement('td');
    dateTd.className = 'border p-2 whitespace-nowrap';
    dateTd.textContent = s.date;

    const titleTd = document.createElement('td');
    titleTd.className = 'border p-2';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'w-full border border-gray-300 rounded p-1';
    titleInput.dataset.date = s.date;
    titleInput.dataset.field = 'title';
    titleInput.value = s.title || '';
    titleInput.placeholder = '例：常年期第25主日　瑪20:1-16';
    titleTd.appendChild(titleInput);

    const eventTd = document.createElement('td');
    const tag = sessionTagClass(s.event);
    eventTd.className = `border p-2 ${tag}`;
    const eventInput = document.createElement('input');
    eventInput.type = 'text';
    eventInput.className = 'w-full border border-gray-300 rounded p-1';
    eventInput.dataset.date = s.date;
    eventInput.dataset.field = 'event';
    eventInput.value = s.event || '';
    eventInput.placeholder = '例：開學禮 / 假期：聖誕假期';
    eventTd.appendChild(eventInput);

    tr.appendChild(dateTd);
    tr.appendChild(titleTd);
    tr.appendChild(eventTd);
    body.appendChild(tr);
  }
}

function collectSessions() {
  const map = new Map();
  document.querySelectorAll('#sessionsBody input[data-date]').forEach(inp => {
    const date = inp.dataset.date;
    if (!map.has(date)) map.set(date, { date, title: '', event: '' });
    if (inp.dataset.field === 'title') map.get(date).title = inp.value.trim();
    if (inp.dataset.field === 'event') map.get(date).event = inp.value.trim();
  });
  return Array.from(map.values()).sort((a, b) => a.date < b.date ? -1 : 1);
}

async function loadSessions() {
  setMessage('載入中...');
  try {
    sessionsCache = await getSessions();
    renderSessions(sessionsCache);
    setMessage(`共 ${sessionsCache.length} 筆`);
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
  }
}

async function handleSave() {
  const rows = collectSessions();
  if (!rows.length) return;
  setMessage('儲存中...');
  try {
    await saveSessions(rows);
    setMessage(`已儲存 ${rows.length} 筆`);
    await loadSessions();
  } catch (err) {
    setMessage(`儲存失敗：${err.message}`, true);
  }
}

async function handleImport() {
  if (!confirm('確定覆寫為預設日曆？現有資料會被取代。')) return;
  setMessage('import 中...');
  try {
    // 後端 RUN_ImportSessionsCalendar 已寫入；前端只需重新載入
    // 由於 RUN_* 只可喺 GAS 編輯器行，我哋提供 webhook 用 GAS 部署嘅 doPost 不適用
    // → 改為提示 user 喺 GAS 執行 RUN_ImportSessionsCalendar
    setMessage('請喺 GAS 編輯器執行 RUN_ImportSessionsCalendar；執行後 reload 呢個頁', true);
  } catch (err) {
    setMessage(`import 失敗：${err.message}`, true);
  }
}

function init() {
  $('logoutBtn').addEventListener('click', () => logout());
  $('saveBtn').addEventListener('click', handleSave);
  $('importBtn').addEventListener('click', handleImport);
}

onRoleLoaded((role) => {
  if (role && role.role === 'admin') {
    init();
    loadSessions();
  } else {
    setMessage('此頁僅限管理員使用', true);
    setTimeout(() => window.location.replace('./form.html'), 1500);
  }
});