// js/main-admin-todos.js — 管理員待辦設定頁
// 揀班級 → 管理/新增待辦；可「套用到全部班級」一次過加。
import {
  getAllClasses, getClassPortal, getRollCallYear,
  getClassTodos, saveClassTodo, deleteClassTodo, setClassTodoDone
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

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayStr() { return fmt(new Date()); }
function shortDate(dateStr) {
  const [, m, d] = String(dateStr || '').split('-');
  return m && d ? `${Number(m)}/${Number(d)}` : dateStr;
}
function isClassDay(s) {
  return !(s.event || '').startsWith('假期');
}

function computeAutoTodos(sessions, yearMarks, today, className) {
  const todos = [];
  const classDays = sessions
    .filter(s => isClassDay(s) && s.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const latest = classDays[0];
  if (latest) {
    const marks = yearMarks[latest.date] || {};
    const hasRollCall = Object.keys(marks).length > 0;
    if (!hasRollCall) {
      todos.push({
        type: 'rollcall', severity: 'high',
        title: '尚未點名',
        desc: `${shortDate(latest.date)} 未做點名`,
        href: `rollcall.html?class=${encodeURIComponent(className)}&date=${latest.date}`
      });
    } else {
      const hasMass = Object.values(marks).some(m => m && m.mass === true);
      if (!hasMass) {
        todos.push({
          type: 'mass', severity: 'medium',
          title: '彌撒未填',
          desc: `${shortDate(latest.date)} 彌撒出席未填`,
          href: `rollcall.html?class=${encodeURIComponent(className)}&date=${latest.date}`
        });
      }
    }
  }

  const maxDate = oneMonthLaterStr(today);
  sessions
    .filter(s => /彌撒/.test(s.event || '') && s.date >= today && s.date <= maxDate && massAppliesTo(s.event, String(className || '')))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 3)
    .forEach(s => {
      todos.push({
        type: 'upcoming', severity: 'info',
        title: '黎緊彌撒日',
        desc: `${shortDate(s.date)} ${s.event}`
      });
    });

  return todos;
}

async function init(role) {
  if (!role || role.role !== 'admin') {
    setMessage('此頁僅限管理員使用', true);
    setTimeout(() => window.location.replace('./hub.html'), 1500);
    return;
  }

  $('logoutBtn').addEventListener('click', () => logout());
  $('addTodoBtn').addEventListener('click', addTodo);
  $('classSelect').addEventListener('change', async (e) => {
    currentClass = e.target.value;
    await load();
  });

  try {
    classes = await getAllClasses();
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
    return;
  }
  if (!classes.length) {
    setMessage('沒有可用班級', true);
    return;
  }
  classes = sortClasses(classes);

  const sel = $('classSelect');
  sel.innerHTML = '';
  classes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
  currentClass = classes[0];
  sel.value = currentClass;

  await load();
}

async function load() {
  if (!currentClass) return;
  setMessage('載入中...');
  try {
    const [p, yearMarks, todos] = await Promise.all([
      getClassPortal(currentClass),
      getRollCallYear(currentClass),
      getClassTodos(currentClass)
    ]);
    renderAuto(p, yearMarks);
    renderTodos(todos);
    setMessage(`${currentClass}：共 ${p.rosterCount} 人`);
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
  }
}

function renderAuto(p, yearMarks) {
  const body = $('autoBody');
  const auto = computeAutoTodos(p.sessions, yearMarks, todayStr(), p.className);
  body.innerHTML = '';
  if (!auto.length) {
    body.innerHTML = '<div class="text-sm text-green-600 font-medium">✓ 無未做事項</div>';
    return;
  }
  auto.forEach(t => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 rounded-lg px-3 py-2 ' + severityClass(t.severity);

    const text = document.createElement('div');
    text.className = 'flex-1 min-w-0';
    const title = document.createElement('div');
    title.className = 'font-bold text-sm';
    title.textContent = t.title;
    const desc = document.createElement('div');
    desc.className = 'text-xs opacity-80';
    desc.textContent = t.desc;
    text.appendChild(title);
    if (desc.textContent) text.appendChild(desc);
    row.appendChild(text);

    const badge = document.createElement('span');
    badge.className = 'shrink-0 text-xs font-bold ' + badgeClass(t.severity);
    badge.textContent = t.type === 'upcoming' ? '未來' : '⚠';
    row.appendChild(badge);

    if (t.href) {
      const a = document.createElement('a');
      a.href = t.href;
      a.className = 'shrink-0 text-xs text-blue-700 font-bold';
      a.textContent = '去處理 →';
      row.appendChild(a);
    }

    body.appendChild(row);
  });
}

function renderTodos(todos) {
  const body = $('todoBody');
  body.innerHTML = '';
  if (!todos.length) {
    body.innerHTML = '<div class="text-sm text-gray-400">未有待辦</div>';
    return;
  }

  const today = todayStr();
  todos.forEach(t => {
    const done = t.done === true;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 rounded-lg px-3 py-2 ' + severityClass(done ? 'done' : (t.date && t.date < today ? 'due' : 'future'));

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'h-5 w-5 shrink-0';
    chk.checked = done;
    chk.addEventListener('change', async () => {
      try {
        await setClassTodoDone(currentClass, t.id, chk.checked);
        await load();
      } catch (err) {
        setMessage(`更新失敗：${err.message}`, true);
      }
    });
    row.appendChild(chk);

    const text = document.createElement('div');
    text.className = 'flex-1 min-w-0';
    const title = document.createElement('div');
    title.className = `font-bold text-sm ${done ? 'line-through text-gray-400' : ''}`;
    title.textContent = t.title;
    const desc = document.createElement('div');
    desc.className = 'text-xs opacity-80';
    desc.textContent = [t.date ? shortDate(t.date) : '', t.note || ''].filter(Boolean).join(' · ');
    text.appendChild(title);
    if (desc.textContent) text.appendChild(desc);
    row.appendChild(text);

    if (t.link) {
      const a = document.createElement('a');
      a.href = t.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'shrink-0 text-xs text-blue-700 font-bold';
      a.textContent = '連結 ↗';
      row.appendChild(a);
    }

    const del = document.createElement('button');
    del.className = 'shrink-0 text-xs text-red-500 font-bold';
    del.textContent = '刪除';
    del.addEventListener('click', async () => {
      try {
        await deleteClassTodo(currentClass, t.id);
        await load();
      } catch (err) {
        setMessage(`刪除失敗：${err.message}`, true);
      }
    });
    row.appendChild(del);

    body.appendChild(row);
  });
}

async function addTodo() {
  const title = $('todoTitle').value.trim();
  if (!title) { setMessage('請輸入待辦內容', true); return; }
  const date = $('todoDate').value;
  const link = $('todoLink').value.trim();
  const applyAll = $('applyAll').checked;
  const targets = applyAll ? classes : [currentClass];

  try {
    for (const cls of targets) {
      await saveClassTodo(cls, { title, date, link });
    }
    $('todoTitle').value = '';
    $('todoDate').value = '';
    $('todoLink').value = '';
    $('applyAll').checked = false;
    setMessage(applyAll ? `已加到 ${targets.length} 班` : '已新增');
    await load();
  } catch (err) {
    setMessage(`新增失敗：${err.message}`, true);
  }
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

onRoleLoaded((role) => { init(role); });
