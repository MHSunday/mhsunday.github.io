// js/main-sessions.js — 上堂日曆（admin 可編輯+同步；teacher 唯讀）
import { getSessions, saveSessions, importDefaultSessions, syncAllFromGAS, syncPermissionsFromGAS, exportRollcallsToGAS } from './data.js';
import { onRoleLoaded, logout } from './auth.js';

const $ = (id) => document.getElementById(id);

let sessionsCache = [];
let isAdminView = false;

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
    if (!isAdminView) titleInput.disabled = true;
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
    if (!isAdminView) eventInput.disabled = true;
    eventTd.appendChild(eventInput);
    if (isAdminView) {
      const hbtn = document.createElement('button');
      hbtn.type = 'button';
      hbtn.className = 'ml-2 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100';
      hbtn.textContent = '假期';
      hbtn.title = '標記/取消為假期（天氣惡劣停課）';
      hbtn.addEventListener('click', () => toggleHoliday(s.date));
      eventTd.appendChild(hbtn);
    }

    tr.appendChild(dateTd);
    tr.appendChild(titleTd);
    tr.appendChild(eventTd);
    body.appendChild(tr);
  }
}

function toggleHoliday(date) {
  const inp = document.querySelector(`#sessionsBody input[data-date="${date}"][data-field="event"]`);
  if (!inp) return;
  const v = (inp.value || '').trim();
  inp.value = v.startsWith('假期') ? '' : '假期：停課（天氣惡劣）';
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
    setMessage(`${sessionsCache.length} 筆${isAdminView ? '' : '（唯讀，僅管理員可編輯）'}`);
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
    await importDefaultSessions();
    setMessage('已載入預設日曆');
    await loadSessions();
  } catch (err) {
    setMessage(`import 失敗：${err.message}`, true);
  }
}

async function handleSync() {
  if (!confirm('將 Sheets 嘅名單/日曆/全年點名同步去 Firestore？\n\n⚠️ 一次性操作，逐班 fetch 需時（可能幾分鐘），期間請勿關閉頁面。')) return;
  setMessage('同步中（逐班進行，請耐心等候）...');
  try {
    const out = await syncAllFromGAS();
    setMessage(`同步完成：${out.classes} 班、${out.sessions} 個上堂日`);
    await loadSessions();
  } catch (err) {
    setMessage(`同步失敗：${err.message}`, true);
  }
}

async function handlePermSync() {
  if (!confirm('將 GAS permissions 表同步去 Firestore（老師先可以寫點名）？')) return;
  setMessage('同步權限中...');
  try {
    const out = await syncPermissionsFromGAS();
    setMessage(`已同步 ${out.users} 個權限到 Firestore`);
  } catch (err) {
    setMessage(`同步權限失敗：${err.message}`, true);
  }
}

async function handleExport() {
  if (!confirm('將 Firestore 嘅點名匯出返去 GAS 試算表（rollcalls 表）？')) return;
  setMessage('匯出中...');
  try {
    const out = await exportRollcallsToGAS();
    setMessage(`已匯出 ${out.exported} 筆點名到試算表`);
  } catch (err) {
    setMessage(`匯出失敗：${err.message}`, true);
  }
}

function init(role) {
  isAdminView = !!(role && role.role === 'admin');
  $('logoutBtn').addEventListener('click', () => logout());
  if (isAdminView) {
    $('saveBtn').addEventListener('click', handleSave);
    $('importBtn').addEventListener('click', handleImport);
    const syncBtn = $('syncBtn');
    const exportBtn = $('exportBtn');
    const permSyncBtn = $('permSyncBtn');
    if (syncBtn) syncBtn.addEventListener('click', handleSync);
    if (exportBtn) exportBtn.addEventListener('click', handleExport);
    if (permSyncBtn) permSyncBtn.addEventListener('click', handlePermSync);
  } else {
    // teacher：唯讀，隱藏編輯/import/sync/export 按鈕
    $('saveBtn').style.display = 'none';
    $('importBtn').style.display = 'none';
    const syncCard = $('syncCard');
    if (syncCard) syncCard.style.display = 'none';
  }
}

onRoleLoaded((role) => {
  if (role && (role.role === 'admin' || role.role === 'teacher')) {
    init(role);
    loadSessions();
  } else {
    setMessage('此頁僅限教職員使用', true);
    setTimeout(() => window.location.replace('./form.html'), 1500);
  }
});