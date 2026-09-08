// js/main-portal.js — 每班 Portal 頁
import {
  getAllClasses, getClassPortal, getRollCallYear, getClassTodos
} from './data.js';
import { onRoleLoaded, logout } from './auth.js';
import { sortClasses, massAppliesTo, oneMonthLaterStr } from './classOrder.js';

const CATEGORY_LABEL = { '學生': '學生', '小導師': '小導師', '老師': '導師' };

const $ = (id) => document.getElementById(id);

let classes = [];
let currentClass = '';

function setMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text || '';
  el.className = `text-center text-sm font-medium min-h-[1.25rem] ${isError ? 'text-red-600' : 'text-green-600'}`;
}

function urlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayStr() { return fmt(new Date()); }
function shortDate(dateStr) {
  const [, m, d] = String(dateStr || '').split('-');
  return m && d ? `${Number(m)}/${Number(d)}` : dateStr;
}

async function init(role) {
  $('logoutBtn').addEventListener('click', () => logout());
  $('gotoRollcallBtn').addEventListener('click', () => {
    const url = `rollcall.html?class=${encodeURIComponent(currentClass)}`;
    window.location.href = url;
  });
  $('classSelect').addEventListener('change', async (e) => {
    currentClass = e.target.value;
    await loadPortal();
  });

  try {
    classes = await getAllClasses();
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
    return;
  }

  // 權限過濾：管理員睇全部；老師只可以睇自己班
  const myClasses = (role && role.role === 'teacher' && Array.isArray(role.classes) && role.classes.length)
    ? classes.filter(c => role.classes.includes(c))
    : classes;
  if (!myClasses.length) {
    setMessage('您沒有可用的班級權限', true);
    return;
  }
  classes = sortClasses(myClasses);

  const sel = $('classSelect');
  sel.innerHTML = '';
  classes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });

  const urlClass = urlParam('class');
  currentClass = classes.includes(urlClass) ? urlClass : (classes[0] || '');
  sel.value = currentClass;

  await loadPortal();
}

async function loadPortal() {
  if (!currentClass) return;
  setMessage('載入中...');
  try {
    const [p, yearMarks, todos] = await Promise.all([
      getClassPortal(currentClass),
      getRollCallYear(currentClass),
      getClassTodos(currentClass)
    ]);
    renderToday(p);
    renderActions(p);
    renderTodos(p, yearMarks, todos);
    renderRoster(p);
    renderLinks(p);
    renderDetails(p);
    renderAttendance(p, yearMarks);
    setMessage(`${currentClass}：共 ${p.rosterCount} 人`);
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
  }
}

function renderAttendance(p, yearMarks) {
  const card = $('attendanceCard');
  if (!card) return;
  const today = todayStr();
  const roster = p.roster || [];
  const classDays = (p.sessions || [])
    .filter(s => !(s.event || '').startsWith('假期') && s.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  let presentCount = 0;
  let totalCount = 0;
  for (const s of classDays) {
    const marks = yearMarks[s.date] || {};
    roster.forEach(m => {
      if (marks[m.name] && marks[m.name].present === true) presentCount++;
      totalCount++;
    });
  }
  const attended = totalCount ? `${presentCount}/${totalCount}` : '—';
  $('attendanceInfo').textContent = `${attended} 人次（${classDays.length} 個上堂日）`;
  $('attendancePct').textContent = `${totalCount ? Math.round((presentCount / totalCount) * 100) : 0}%`;
  card.classList.remove('hidden');
}

function renderToday(p) {
  const card = $('todayCard');
  if (p.todaySession) {
    const s = p.todaySession;
    const label = [s.title, s.event].filter(Boolean).join(' · ');
    $('todayInfo').textContent = `${s.date}${label ? '（' + label + '）' : ''}`;
    card.classList.remove('hidden');
  } else {
    card.classList.add('hidden');
  }
}

function renderActions(p) {
  const grid = $('actionGrid');
  const today = p.todaySession ? p.todaySession.date : '';
  const buttons = [
    { label: '今日點名', desc: today || '揀日期', href: `rollcall.html?class=${encodeURIComponent(p.className)}&date=${today}` },
    { label: '全年矩陣', desc: '睇全年出席', href: `rollcall.html?class=${encodeURIComponent(p.className)}&tab=matrix` },
    { label: '出席統計', desc: '每位學生出席／彌撒次數', href: `rollcall.html?class=${encodeURIComponent(p.className)}&tab=mass` },
    { label: '上堂日曆', desc: '睇全年日曆', href: 'calendar.html' },
    { label: '學生名單', desc: `${p.rosterCount} 人`, href: '#details' }
  ];

  grid.innerHTML = '';
  buttons.forEach(b => {
    const a = document.createElement('a');
    a.href = b.href;
    a.className = 'bg-white rounded-xl shadow-md p-4 border border-gray-200 hover:border-blue-400 hover:shadow-lg transition block';
    a.innerHTML = `
      <div class="font-bold text-blue-700">${b.label}</div>
      <div class="text-xs text-gray-500 mt-0.5">${b.desc}</div>
    `;
    grid.appendChild(a);
  });
}

// ---------- 待辦事項 ----------

function isClassDay(s) {
  return !(s.event || '').startsWith('假期');
}

/** 自動計算待辦：未點名 / 彌撒未填 / 黎緊彌撒日 */
function computeAutoTodos(p, yearMarks, today) {
  const todos = [];
  const sessions = p.sessions || [];
  const className = p.className;

  const classDays = sessions
    .filter(s => isClassDay(s) && s.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const latest = classDays[0];
  if (latest) {
    const marks = yearMarks[latest.date] || {};
    const hasRollCall = Object.keys(marks).length > 0;
    if (!hasRollCall) {
      todos.push({
        key: 'auto-rollcall', type: 'rollcall', severity: 'high',
        title: '尚未點名',
        desc: `${shortDate(latest.date)} 未做點名`,
        date: latest.date,
        href: `rollcall.html?class=${encodeURIComponent(className)}&date=${latest.date}`
      });
    } else {
      const hasMass = Object.values(marks).some(m => m && m.mass === true);
      if (!hasMass) {
        todos.push({
          key: 'auto-mass', type: 'mass', severity: 'medium',
          title: '彌撒未填',
          desc: `${shortDate(latest.date)} 彌撒出席未填`,
          date: latest.date,
          href: `rollcall.html?class=${encodeURIComponent(className)}&date=${latest.date}`
        });
      }
    }
  }

  const maxDate = oneMonthLaterStr(today);
  sessions
    .filter(s => /彌撒/.test(s.event || '') && s.date >= today && s.date <= maxDate && massAppliesTo(s.event, className))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 3)
    .forEach(s => {
      todos.push({
        key: `auto-up-${s.date}`, type: 'upcoming', severity: 'info',
        title: '黎緊彌撒日',
        desc: `${shortDate(s.date)} ${s.event}`,
        date: s.date
      });
    });

  return todos;
}

function renderTodos(p, yearMarks, todos) {
  const card = $('todosCard');
  const body = $('todosBody');
  if (!card || !body) return;

  const today = todayStr();

  const auto = computeAutoTodos(p, yearMarks, today);
  const manual = (todos || []).map(t => ({
    key: t.id,
    type: 'manual',
    severity: t.done === true ? 'done' : (t.date && t.date < today ? 'due' : 'future'),
    title: t.title,
    desc: [t.date ? shortDate(t.date) : '', t.link ? '有連結' : ''].filter(Boolean).join(' · '),
    date: t.date,
    link: t.link || '',
    done: t.done === true,
    id: t.id
  }));

  const items = [...auto, ...manual];
  if (!items.length) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  body.innerHTML = '';
  items.forEach(t => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 rounded-lg px-3 py-2 ' + severityClass(t.severity);

    const text = document.createElement('div');
    text.className = 'flex-1 min-w-0';
    const title = document.createElement('div');
    title.className = `font-bold text-sm ${t.severity === 'done' ? 'line-through text-gray-400' : ''}`;
    title.textContent = t.title;
    const desc = document.createElement('div');
    desc.className = 'text-xs opacity-80';
    desc.textContent = t.desc;
    text.appendChild(title);
    if (desc.textContent) text.appendChild(desc);
    row.appendChild(text);

    if (t.type !== 'manual') {
      const badge = document.createElement('span');
      badge.className = 'shrink-0 text-xs font-bold ' + badgeClass(t.severity);
      badge.textContent = t.type === 'upcoming' ? '未來' : '⚠';
      row.appendChild(badge);
    } else if (t.done) {
      const badge = document.createElement('span');
      badge.className = 'shrink-0 text-xs font-bold text-green-600';
      badge.textContent = '✓';
      row.appendChild(badge);
    }

    if (t.link && t.type === 'manual') {
      const a = document.createElement('a');
      a.href = t.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'shrink-0 text-xs text-blue-700 font-bold';
      a.textContent = '連結 ↗';
      row.appendChild(a);
    }

    if (t.href && t.type !== 'manual') {
      const a = document.createElement('a');
      a.href = t.href;
      a.className = 'shrink-0 text-xs text-blue-700 font-bold';
      a.textContent = '去處理 →';
      row.appendChild(a);
    }

    body.appendChild(row);
  });
}

function severityClass(severity) {
  switch (severity) {
    case 'high': return 'bg-red-50 border border-red-200 text-red-700';
    case 'medium': return 'bg-orange-50 border border-orange-200 text-orange-700';
    case 'done': return 'bg-gray-50 border border-gray-100 text-gray-500';
    case 'due': return 'bg-orange-50 border border-orange-200 text-orange-700';
    default: return 'bg-blue-50 border border-blue-100 text-blue-700';
  }
}
function badgeClass(severity) {
  switch (severity) {
    case 'high': return 'text-red-600';
    case 'medium': return 'text-orange-600';
    default: return 'text-blue-600';
  }
}

function renderRoster(p) {
  const card = $('rosterCard');
  const body = $('rosterBody');
  body.innerHTML = '';
  if (!p.roster || !p.roster.length) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  $('rosterCount').textContent = `（${p.roster.length} 人）`;
  p.roster.forEach(s => {
    const span = document.createElement('span');
    span.className = 'inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1 text-sm bg-gray-50';
    span.innerHTML = `${escapeHtml(s.name)}<span class="text-xs text-gray-400">${escapeHtml(CATEGORY_LABEL[s.category] || s.category)}</span>`;
    body.appendChild(span);
  });
}

function renderLinks(p) {
  const card = $('linksCard');
  const body = $('linksBody');
  body.innerHTML = '';
  const items = [
    { label: '各班名單', href: p.links.studentList },
    { label: '收據', href: p.links.receipt },
    { label: '出席表（Sheet）', href: p.links.attendanceSheet },
    { label: '學生資料表單', href: p.formLink }
  ];
  const existing = items.filter(i => i.href);
  if (!existing.length) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  existing.forEach(i => {
    const a = document.createElement('a');
    a.href = i.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 hover:border-blue-400 transition';
    a.innerHTML = `<span class="font-medium">${i.label}</span><span class="text-blue-600 text-sm">開啟 ↗</span>`;
    body.appendChild(a);
  });
}

function renderDetails(p) {
  const card = $('detailsCard');
  const body = $('detailsBody');

  const rosterMap = new Map(p.roster.map(s => [s.name, s.category]));
  const rows = p.details.map(d => ({ ...d, category: rosterMap.get(d.name) || '學生' }));

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="border p-4 text-center text-gray-400">尚未收集補充資料</td></tr>';
    return;
  }

  card.classList.remove('hidden');
  body.innerHTML = '';
  rows.forEach(d => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-blue-50';
    tr.innerHTML = `
      <td class="border p-2">${escapeHtml(d.name)}</td>
      <td class="border p-2">${CATEGORY_LABEL[d.category] || escapeHtml(d.category)}</td>
      <td class="border p-2">${escapeHtml(d.gender)}</td>
      <td class="border p-2">${escapeHtml(d.school)}</td>
      <td class="border p-2">${escapeHtml(d.birthYear)}</td>
      <td class="border p-2">${escapeHtml(d.phone)}</td>
    `;
    body.appendChild(tr);
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

onRoleLoaded((role) => { init(role); });
