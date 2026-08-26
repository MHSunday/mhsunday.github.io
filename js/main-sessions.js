// js/main-sessions.js — 上堂日曆管理頁（僅管理員）
import { getSessions, saveSessions, resetSessions } from './api.js';
import { onRoleLoaded, logout } from './auth.js';

const SESSION_TYPES = ['上課', '活動', '假期', '停課'];

let sessionsCache = [];

const $ = (id) => document.getElementById(id);

function setMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text || '';
  el.className = `text-center text-sm font-medium min-h-[1.25rem] ${isError ? 'text-red-600' : 'text-green-600'}`;
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

    const typeTd = document.createElement('td');
    typeTd.className = 'border p-2';
    const select = document.createElement('select');
    select.className = 'w-full border border-gray-300 rounded p-1';
    select.dataset.date = s.date;
    for (const t of SESSION_TYPES) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === s.type) opt.selected = true;
      select.appendChild(opt);
    }
    typeTd.appendChild(select);

    const noteTd = document.createElement('td');
    noteTd.className = 'border p-2';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'w-full border border-gray-300 rounded p-1';
    input.dataset.date = s.date;
    input.value = s.note || '';
    input.placeholder = '例：農曆新年假期';
    noteTd.appendChild(input);

    tr.appendChild(dateTd);
    tr.appendChild(typeTd);
    tr.appendChild(noteTd);
    body.appendChild(tr);
  }
}

function collectSessions() {
  const rows = [];
  document.querySelectorAll('#sessionsBody tr').forEach(tr => {
    const select = tr.querySelector('select[data-date]');
    const input = tr.querySelector('input[data-date]');
    if (!select) return;
    rows.push({ date: select.dataset.date, type: select.value, note: input ? input.value.trim() : '' });
  });
  return rows;
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

async function handleReset() {
  if (!confirm('確定重置為「學年內全部週日（上課）」？會覆寫現有修改。')) return;
  setMessage('重置中...');
  try {
    const out = await resetSessions();
    setMessage(`已重置 ${out.count} 筆`);
    await loadSessions();
  } catch (err) {
    setMessage(`重置失敗：${err.message}`, true);
  }
}

function init() {
  $('logoutBtn').addEventListener('click', () => logout());
  $('saveBtn').addEventListener('click', handleSave);
  $('resetBtn').addEventListener('click', handleReset);
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
