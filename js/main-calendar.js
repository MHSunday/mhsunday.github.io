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

// 天主教讀經循環：2022 年為甲年（A），之後每 3 年循環
function yearCycleOf(dateStr) {
  const y = parseInt(dateStr.slice(0, 4), 10);
  const idx = ((y - 2022) % 3 + 3) % 3;
  return ['甲', '乙', '丙'][idx];
}

const CN_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function toCnNum(n) {
  if (n <= 10) return n === 10 ? '十' : CN_DIGIT[n];
  if (n < 20) return '十' + CN_DIGIT[n - 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return CN_DIGIT[tens] + '十' + (ones ? CN_DIGIT[ones] : '');
}

// 解析 "常年期第23主日" → { season: '常年期', sunday: 23 }
// 支援：將臨期/聖誕期/四旬期/復活期/常年期
function parseTitle(title) {
  if (!title) return null;
  const m = title.match(/(將臨期|聖誕期|四旬期|復活期|常年期)第?(\d+)主日/);
  if (!m) return null;
  return { season: m[1], sunday: parseInt(m[2], 10) };
}

function shortTitle(dateStr, title) {
  const parsed = parseTitle(title);
  if (!parsed) return title || '';
  return `${yearCycleOf(dateStr)}年/${parsed.season}/第${toCnNum(parsed.sunday)}主日`;
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
    // 假期：深色底；活動：第二色（淺藍）；普通：白底
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
    titleTd.className = 'border p-2 whitespace-nowrap';
    titleTd.textContent = shortTitle(s.date, s.title);

    const eventTd = document.createElement('td');
    eventTd.className = `border p-2 ${holiday ? 'text-gray-100' : (activity ? 'text-sky-900 font-medium' : '')}`;
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
