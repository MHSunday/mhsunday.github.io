// js/main-calendar.js — 上堂日曆（唯讀，teacher/admin 可睇；admin 先見到「編輯日曆」）
import { getSessions } from './data.js';
import { onRoleLoaded, logout } from './auth.js';

const $ = (id) => document.getElementById(id);

function setMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text || '';
  el.className = `text-center text-sm font-medium min-h-[1.25rem] ${isError ? 'text-red-600' : 'text-green-600'}`;
}

function isHoliday(s) {
  return (s.event || '').startsWith('假期');
}

function render(list) {
  const body = $('calendarBody');
  body.innerHTML = '';
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="3" class="border p-4 text-center text-gray-400">沒有資料</td></tr>';
    return;
  }
  for (const s of list) {
    const tr = document.createElement('tr');
    tr.className = isHoliday(s) ? 'bg-gray-50' : 'hover:bg-blue-50';

    const dateTd = document.createElement('td');
    dateTd.className = 'border p-2 whitespace-nowrap';
    dateTd.textContent = s.date;

    const titleTd = document.createElement('td');
    titleTd.className = 'border p-2';
    titleTd.textContent = s.title || '';

    const eventTd = document.createElement('td');
    eventTd.className = `border p-2 ${isHoliday(s) ? 'text-gray-500' : ''}`;
    eventTd.textContent = s.event || '';

    tr.appendChild(dateTd);
    tr.appendChild(titleTd);
    tr.appendChild(eventTd);
    body.appendChild(tr);
  }
}

async function load() {
  setMessage('載入中...');
  try {
    const list = await getSessions();
    render(list);
    setMessage(`共 ${list.length} 日（灰色 = 假期/停課）`);
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
  }
}

function init(role) {
  $('logoutBtn').addEventListener('click', () => logout());
  const isAdmin = role && role.role === 'admin';
  const editLink = $('editLink');
  if (isAdmin && editLink) editLink.classList.remove('hidden');
  load();
}

onRoleLoaded((role) => {
  if (role && (role.role === 'admin' || role.role === 'teacher')) {
    init(role);
  } else {
    setMessage('此頁僅限教職員使用', true);
    setTimeout(() => window.location.replace('./form.html'), 1500);
  }
});
