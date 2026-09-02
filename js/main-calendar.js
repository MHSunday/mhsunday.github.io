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

function isActivity(s) {
  const e = (s.event || '').trim();
  return e.length > 0 && !isHoliday(s);
}

// 移除假期前綴 "假期：" / "假期:" / "假期 "，例如 "假期：農曆新年" → "農曆新年"
function stripHolidayPrefix(event) {
  return (event || '').replace(/^假期[：: ]+/, '').trim();
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
    const holiday = isHoliday(s);
    const activity = isActivity(s);
    if (holiday) {
      tr.className = 'bg-gray-700 text-white';
    } else if (activity) {
      tr.className = 'bg-sky-100 hover:bg-sky-200';
    } else {
      tr.className = 'hover:bg-blue-50';
    }

    const dateTd = document.createElement('td');
    dateTd.className = 'border p-2 whitespace-nowrap';
    dateTd.textContent = s.date;

    const titleTd = document.createElement('td');
    titleTd.className = 'border p-2';
    titleTd.textContent = s.title || '';

    const eventTd = document.createElement('td');
    eventTd.className = `border p-2 ${holiday ? 'text-gray-100' : (activity ? 'text-sky-900 font-medium' : '')}`;
    eventTd.textContent = holiday ? stripHolidayPrefix(s.event) : (s.event || '');

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
    setMessage(`共 ${list.length} 日（深灰 = 假期，淺藍 = 活動）`);
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
