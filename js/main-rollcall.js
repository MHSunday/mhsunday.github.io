// js/main-rollcall.js — 課堂點名（精簡版：只揀日期，全螢幕學生表）
// 每日記兩種出席：上堂（present）+ 彌撒（mass）
import { getAllClasses, getSessions, getRollCall, saveRollCall, getClassRoster, getRollCallYear } from './data.js';
import { onRoleLoaded, logout } from './auth.js';

const CATEGORY_LABEL = { '學生': '學生', '小導師': '小導師', '老師': '導師' };

function isClassDay(s) {
  return !(s.event || '').startsWith('假期');
}

const $ = (id) => document.getElementById(id);

let classes = [];
let sessions = [];
let currentClass = '';
let currentDate = '';
let roster = [];
let yearMarks = {};
let currentTab = 'day';

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayStr() { return fmtDate(new Date()); }
function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function setMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text || '';
  el.className = `text-center text-sm font-medium min-h-[1.25rem] ${isError ? 'text-red-600' : 'text-green-600'}`;
}

function urlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function resolveClass(role) {
  const urlClass = urlParam('class');
  if (urlClass && classes.includes(urlClass)) return urlClass;
  if (role && role.role === 'teacher' && role.classes && role.classes[0] && classes.includes(role.classes[0])) {
    return role.classes[0];
  }
  return classes[0] || '';
}

// ---------- 初始化 ----------

async function init(role) {
  $('logoutBtn').addEventListener('click', () => logout());
  $('tabDayBtn').addEventListener('click', () => switchTab('day'));
  $('tabMatrixBtn').addEventListener('click', () => switchTab('matrix'));
  $('allPresentBtn').addEventListener('click', () => setByKind('present', true));
  $('clearAllBtn').addEventListener('click', () => renderDay());
  $('saveDayBtn').addEventListener('click', saveDay);
  $('dateSelect').addEventListener('change', (e) => { currentDate = e.target.value; renderDay(); });

  try {
    [classes, sessions] = await Promise.all([getAllClasses(), getSessions()]);
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
    return;
  }

  currentClass = resolveClass(role);
  $('classNameLabel').textContent = currentClass || '';

  fillDateSelect();

  const urlDate = urlParam('date');
  currentDate = urlDate && sessions.some(s => s.date === urlDate)
    ? urlDate
    : defaultSessionDate();

  $('dateSelect').value = currentDate;

  switchTab('day');
}

function fillDateSelect() {
  const sel = $('dateSelect');
  sel.innerHTML = '';
  sessions.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.date;
    opt.textContent = s.date;
    sel.appendChild(opt);
  });
}

function defaultSessionDate() {
  const today = todayStr();
  let best = null;
  for (const s of sessions) {
    if (s.date <= today) best = s.date;
  }
  return best || (sessions[0] ? sessions[0].date : '');
}

function switchTab(tab) {
  currentTab = tab;
  const isDay = tab === 'day';
  $('dayView').classList.toggle('hidden', !isDay);
  $('matrixView').classList.toggle('hidden', tab !== 'matrix');

  $('tabDayBtn').className = `px-3 py-1.5 rounded-md text-sm font-bold ${isDay ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`;
  $('tabMatrixBtn').className = `px-3 py-1.5 rounded-md text-sm font-bold ${tab === 'matrix' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`;

  if (tab === 'day') renderDay();
  else if (tab === 'matrix') renderMatrix();
}

// ---------- 當日點名 ----------

async function renderDay() {
  if (!currentClass || !currentDate) return;
  $('backfillBadge').classList.toggle('hidden', currentDate >= todayStr());

  const daySession = sessions.find(s => s.date === currentDate);
  const dayIsHoliday = daySession ? !isClassDay(daySession) : false;

  setMessage('載入中...');
  const body = $('dayBody');
  body.innerHTML = '<tr><td colspan="4" class="border p-4 text-center text-gray-400">載入中...</td></tr>';

  try {
    roster = await getRollCall(currentClass, currentDate);
    renderDayRows(dayIsHoliday);
    const n = roster.length;
    const attended = roster.filter(r => r.present === true).length;
    const mass = roster.filter(r => r.mass === true).length;
    const pct = n ? Math.round((attended / n) * 100) : 0;
    const mpct = n ? Math.round((mass / n) * 100) : 0;
    setMessage(`共 ${n} 人，上堂 ${attended}（${pct}%）、彌撒 ${mass}（${mpct}%）`);
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
    body.innerHTML = '';
  }
}

function renderDayRows(dayIsHoliday) {
  const body = $('dayBody');
  body.innerHTML = '';

  let lastCat = '';
  roster.forEach((s, idx) => {
    if (s.category !== lastCat) {
      lastCat = s.category;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="4" class="bg-gray-100 border px-3 py-1.5 text-sm font-bold text-gray-600">${CATEGORY_LABEL[s.category] || s.category}</td>`;
      body.appendChild(tr);
    }

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-blue-50';

    const numTd = document.createElement('td');
    numTd.className = 'border px-2 py-2.5 text-center text-gray-500';
    numTd.textContent = s.serial || (idx + 1);

    const nameTd = document.createElement('td');
    nameTd.className = 'border px-3 py-2.5';
    nameTd.textContent = s.name;

    const mkChk = (kind, checked, tdClass, disabled) => {
      const td = document.createElement('td');
      td.className = tdClass;
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'h-6 w-6';
      chk.dataset.name = s.name;
      chk.dataset.category = s.category;
      chk.dataset.className = s.className || '';
      chk.dataset.kind = kind;
      chk.checked = checked === true;
      if (disabled) {
        chk.disabled = true;
        chk.checked = false;
      }
      td.appendChild(chk);
      return td;
    };

    tr.appendChild(numTd);
    tr.appendChild(nameTd);
    tr.appendChild(mkChk('present', s.present, `border px-2 py-2.5 text-center ${dayIsHoliday ? 'bg-gray-100' : ''}`, dayIsHoliday));
    tr.appendChild(mkChk('mass', s.mass, 'border px-2 py-2.5 text-center bg-orange-50', false));
    body.appendChild(tr);
  });
}

function setByKind(kind, checked) {
  document.querySelectorAll('#dayBody input[type=checkbox]').forEach(c => {
    if (c.disabled) return;
    if (!kind || c.dataset.kind === kind) c.checked = checked;
  });
}

async function saveDay() {
  if (!currentClass || !currentDate) return;
  const map = new Map();
  document.querySelectorAll('#dayBody input[type=checkbox]').forEach(c => {
    const name = c.dataset.name;
    if (!map.has(name)) map.set(name, { name, category: c.dataset.category, className: c.dataset.className });
    map.get(name)[c.dataset.kind] = c.checked;
  });
  const records = Array.from(map.values());
  if (!records.length) return;

  setMessage('儲存中...');
  try {
    const out = await saveRollCall(currentClass, currentDate, records);
    setMessage(`已儲存：更新 ${out.updated} 筆、新增 ${out.added} 筆${currentDate < todayStr() ? '（補填）' : ''}`);
    renderDay();
  } catch (err) {
    setMessage(`儲存失敗：${err.message}`, true);
  }
}

// ---------- 全年矩陣 ----------

async function renderMatrix() {
  if (!currentClass) return;
  setMessage('載入中...');
  try {
    const [r, ym] = await Promise.all([
      getClassRoster(currentClass),
      getRollCallYear(currentClass)
    ]);
    roster = r;
    yearMarks = ym;
    buildMatrixTable();
    setMessage(`全年 ${roster.length} 人 × ${sessions.length} 日（上堂 + 彌撒）`);
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
  }
}

function buildMatrixTable() {
  const body = $('matrixBody');
  body.innerHTML = '';

  const headTr = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'sticky-name sticky-head border p-1.5 text-left whitespace-nowrap bg-gray-100';
  corner.textContent = '姓名';
  headTr.appendChild(corner);

  const pctHead = document.createElement('th');
  pctHead.className = 'sticky-head border p-1.5 text-center whitespace-nowrap bg-gray-100';
  pctHead.textContent = '出席%';
  headTr.appendChild(pctHead);

  sessions.forEach(s => {
    const isDay = isClassDay(s);
    const th = document.createElement('th');
    th.colSpan = 2;
    th.className = `sticky-head border p-1 text-center whitespace-nowrap ${isDay ? 'bg-gray-100' : 'bg-gray-200 text-gray-400'}`;
    th.textContent = `${shortDate(s.date)}${s.event ? '·' + (s.event.startsWith('假期') ? '假' : '活') : ''}`;
    headTr.appendChild(th);
  });

  const typeTr = document.createElement('tr');
  const c2 = document.createElement('th');
  c2.className = 'sticky-name border p-1 bg-gray-50';
  typeTr.appendChild(c2);
  const c3 = document.createElement('th');
  c3.className = 'border p-0.5 bg-gray-50';
  typeTr.appendChild(c3);
  sessions.forEach(s => {
    const isDay = isClassDay(s);
    const th1 = document.createElement('th');
    th1.className = `border p-0.5 text-center text-[10px] ${isDay ? 'bg-gray-50 text-gray-600' : 'bg-gray-200 text-gray-400'}`;
    th1.textContent = '上';
    const th2 = document.createElement('th');
    th2.className = 'border p-0.5 text-center text-[10px] bg-orange-50 text-orange-600';
    th2.textContent = '彌';
    typeTr.appendChild(th1);
    typeTr.appendChild(th2);
  });

  body.appendChild(headTr);
  body.appendChild(typeTr);

  const today = todayStr();
  const eligibleDays = sessions.filter(s => isClassDay(s) && s.date <= today);
  let lastCat = '';
  roster.forEach((s) => {
    if (s.category !== lastCat) {
      lastCat = s.category;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="${sessions.length * 2 + 2}" class="bg-gray-100 border p-1.5 text-xs font-bold text-gray-600">${CATEGORY_LABEL[s.category] || s.category}</td>`;
      body.appendChild(tr);
    }

    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.className = 'sticky-name border p-1.5 whitespace-nowrap';
    nameTd.textContent = s.name;
    tr.appendChild(nameTd);

    let attended = 0;
    eligibleDays.forEach(sess => {
      const m = yearMarks[sess.date] && yearMarks[sess.date][s.name];
      if (m && m.present === true) attended++;
    });
    const pctTd = document.createElement('td');
    const pct = eligibleDays.length ? Math.round((attended / eligibleDays.length) * 100) : null;
    pctTd.className = 'border p-1.5 text-center whitespace-nowrap font-bold text-blue-700';
    pctTd.textContent = pct === null ? '—' : `${pct}%`;
    tr.appendChild(pctTd);

    sessions.forEach(sess => {
      const isDay = isClassDay(sess);
      const m = yearMarks[sess.date] && yearMarks[sess.date][s.name];

      const td1 = document.createElement('td');
      td1.className = `border cell ${isDay ? 'bg-white' : 'bg-gray-100'}`;
      if (isDay && m && m.present === true) td1.textContent = '✓';
      tr.appendChild(td1);

      const td2 = document.createElement('td');
      td2.className = 'border cell bg-orange-50';
      if (m && m.mass === true) td2.textContent = '✓';
      tr.appendChild(td2);
    });
    body.appendChild(tr);
  });
}

onRoleLoaded((role) => { init(role); });
