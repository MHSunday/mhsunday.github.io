// js/main-rollcall.js — 課堂點名（當日點名 / 全年矩陣 / 列印點名紙）
import { getAllClasses, getSessions, getClassRoster, getRollCall, saveRollCall, getRollCallYear } from './api.js';
import { getUserRole, onRoleLoaded, logout } from './auth.js';

const CATEGORY_LABEL = { '學生': '學生', '小導師': '小導師', '老師': '導師' };

function isClassDay(s) {
  // 假期：xxx → 非上堂日；其他一律當上堂日
  return !(s.event || '').startsWith('假期');
}

function shortType(s) {
  // 顯示一隻字嘅類型標記
  if (!s.event) return '課';
  if (s.event.startsWith('假期')) return '假';
  return '活';
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
  const [y, m, d] = dateStr.split('-');
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

// ---------- 初始化 ----------

async function init() {
  $('logoutBtn').addEventListener('click', () => logout());
  $('tabDayBtn').addEventListener('click', () => switchTab('day'));
  $('tabMatrixBtn').addEventListener('click', () => switchTab('matrix'));
  $('tabPrintBtn').addEventListener('click', () => switchTab('print'));
  $('allPresentBtn').addEventListener('click', () => setAll(true));
  $('allAbsentBtn').addEventListener('click', () => setAll(false));
  $('saveDayBtn').addEventListener('click', saveDay);
  $('printBtn').addEventListener('click', () => window.print());
  $('classSelect').addEventListener('change', (e) => { currentClass = e.target.value; onClassOrDateChanged(); });
  $('dateSelect').addEventListener('change', (e) => { currentDate = e.target.value; renderDay(); });

  try {
    [classes, sessions] = await Promise.all([getAllClasses(), getSessions()]);
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
    return;
  }

  fillClassSelect();
  fillDateSelect();

  const urlClass = urlParam('class');
  const urlDate = urlParam('date');
  currentClass = classes.includes(urlClass) ? urlClass : (classes[0] || '');
  currentDate = urlDate && sessions.some(s => s.date === urlDate)
    ? urlDate
    : defaultSessionDate();

  $('classSelect').value = currentClass;
  $('dateSelect').value = currentDate;

  switchTab('day');
}

function fillClassSelect() {
  const sel = $('classSelect');
  sel.innerHTML = '';
  classes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

function fillDateSelect() {
  const sel = $('dateSelect');
  sel.innerHTML = '';
  sessions.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.date;
    opt.textContent = `${s.date}（${s.title ? s.title.split('　')[0] : ''}${s.event ? ' · ' + s.event : ''}）`;
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

function onClassOrDateChanged() {
  if (currentTab === 'day') renderDay();
  else if (currentTab === 'matrix') renderMatrix();
  else if (currentTab === 'print') renderPrint();
}

function switchTab(tab) {
  currentTab = tab;
  const isDay = tab === 'day';
  $('dayView').classList.toggle('hidden', !isDay);
  $('matrixView').classList.toggle('hidden', tab !== 'matrix');
  $('printView').classList.toggle('hidden', tab !== 'print');

  $('tabDayBtn').className = `px-4 py-2 rounded-md text-sm font-bold ${isDay ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`;
  $('tabMatrixBtn').className = `px-4 py-2 rounded-md text-sm font-bold ${tab === 'matrix' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`;
  $('tabPrintBtn').className = `px-4 py-2 rounded-md text-sm font-bold ${tab === 'print' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`;

  if (tab === 'day') renderDay();
  else if (tab === 'matrix') renderMatrix();
  else if (tab === 'print') renderPrint();
}

// ---------- 當日點名 ----------

async function renderDay() {
  if (!currentClass || !currentDate) return;
  $('backfillBadge').classList.toggle('hidden', currentDate >= todayStr());

  setMessage('載入中...');
  const body = $('dayBody');
  body.innerHTML = '<tr><td colspan="3" class="border p-4 text-center text-gray-400">載入中...</td></tr>';

  try {
    roster = await getRollCall(currentClass, currentDate);
    renderDayRows();
    const attended = roster.filter(r => r.present === true).length;
    setMessage(`共 ${roster.length} 人，出席 ${attended} 人`);
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
    body.innerHTML = '';
  }
}

function renderDayRows() {
  const body = $('dayBody');
  body.innerHTML = '';

  let lastCat = '';
  roster.forEach((s, idx) => {
    if (s.category !== lastCat) {
      lastCat = s.category;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3" class="bg-gray-100 border p-1.5 text-xs font-bold text-gray-600">${CATEGORY_LABEL[s.category] || s.category}</td>`;
      body.appendChild(tr);
    }

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-blue-50';

    const numTd = document.createElement('td');
    numTd.className = 'border p-2 text-center text-gray-500';
    numTd.textContent = s.serial || (idx + 1);

    const nameTd = document.createElement('td');
    nameTd.className = 'border p-2';
    nameTd.textContent = s.name;

    const presentTd = document.createElement('td');
    presentTd.className = 'border p-2 text-center';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'h-5 w-5';
    chk.dataset.name = s.name;
    chk.dataset.category = s.category;
    chk.dataset.className = s.className || '';
    chk.checked = s.present === true;
    presentTd.appendChild(chk);

    tr.appendChild(numTd);
    tr.appendChild(nameTd);
    tr.appendChild(presentTd);
    body.appendChild(tr);
  });
}

function setAll(present) {
  document.querySelectorAll('#dayBody input[type=checkbox]').forEach(c => { c.checked = present; });
}

async function saveDay() {
  if (!currentClass || !currentDate) return;
  const records = [];
  document.querySelectorAll('#dayBody input[type=checkbox]').forEach(c => {
    records.push({
      name: c.dataset.name,
      category: c.dataset.category,
      className: c.dataset.className,
      present: c.checked
    });
  });
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
    setMessage(`全年 ${roster.length} 人 × ${sessions.length} 日`);
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
  }
}

function buildMatrixTable() {
  const body = $('matrixBody');
  body.innerHTML = '';

  // 表頭
  const headTr = document.createElement('tr');
  const corner = document.createElement('th');
  corner.className = 'sticky-name sticky-head border p-1.5 text-left whitespace-nowrap bg-gray-100';
  corner.textContent = '姓名';
  headTr.appendChild(corner);

  const typeTr = document.createElement('tr');
  const corner2 = document.createElement('th');
  corner2.className = 'sticky-name border p-1.5 bg-gray-50';
  typeTr.appendChild(corner2);

  sessions.forEach(s => {
    const isDay = isClassDay(s);
    const th1 = document.createElement('th');
    th1.className = `sticky-head border p-1.5 text-center whitespace-nowrap ${isDay ? 'bg-gray-100' : 'bg-gray-200 text-gray-400'}`;
    th1.textContent = shortDate(s.date);

    const th2 = document.createElement('th');
    th2.className = `border p-0.5 text-center text-[10px] ${isDay ? 'text-gray-500' : 'text-gray-400'}`;
    th2.textContent = shortType(s);

    headTr.appendChild(th1);
    typeTr.appendChild(th2);
  });

  body.appendChild(headTr);
  body.appendChild(typeTr);
  // 資料列
  let lastCat = '';
  roster.forEach((s) => {
    if (s.category !== lastCat) {
      lastCat = s.category;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="${sessions.length + 1}" class="bg-gray-100 border p-1.5 text-xs font-bold text-gray-600">${CATEGORY_LABEL[s.category] || s.category}</td>`;
      body.appendChild(tr);
    }

    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.className = 'sticky-name border p-1.5 whitespace-nowrap';
    nameTd.textContent = s.name;
    tr.appendChild(nameTd);

    sessions.forEach(sess => {
      const td = document.createElement('td');
      const isDay = isClassDay(sess);
      td.className = `border cell ${isDay ? '' : 'bg-gray-100'}`;
      const present = yearMarks[sess.date] && yearMarks[sess.date][s.name] === true;
      if (present) td.textContent = '✓';
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

// ---------- 列印點名紙 ----------

async function renderPrint() {
  if (!currentClass) return;
  setMessage('載入中...');
  try {
    const [r, ym] = await Promise.all([
      getClassRoster(currentClass),
      getRollCallYear(currentClass)
    ]);
    roster = r;
    yearMarks = ym;
    buildPrintSheet();
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
  }
}

function buildPrintSheet() {
  const el = $('printSheet');
  const classLabel = CATEGORY_LABEL;

  let html = `
    <div class="text-center mb-3">
      <h1 class="text-lg font-bold">${currentClass} — 點名紙</h1>
      <p class="text-sm">${sessions.length} 個上堂日（${sessions[0] ? sessions[0].date : ''} ~ ${sessions[sessions.length - 1] ? sessions[sessions.length - 1].date : ''}）</p>
      <p class="text-xs text-gray-500">出席填 ✓，缺席留空</p>
    </div>
  `;

  let lastCat = '';
  let rows = '';
  roster.forEach((s) => {
    if (s.category !== lastCat) {
      lastCat = s.category;
      rows += `<tr><td colspan="${sessions.length + 1}" style="background:#f3f4f6;font-weight:bold;font-size:11px;padding:3px 6px;border:1px solid #000;">${classLabel[s.category] || s.category}</td></tr>`;
    }
    let cells = `<td style="border:1px solid #000;padding:2px 6px;white-space:nowrap;">${s.name}</td>`;
    sessions.forEach(sess => {
      const present = yearMarks[sess.date] && yearMarks[sess.date][s.name] === true;
      const isDay = isClassDay(sess);
      const style = `border:1px solid #000;width:26px;height:26px;text-align:center;font-size:13px;${isDay ? '' : 'background:#f3f4f6;'}`;
      cells += `<td style="${style}">${present ? '✓' : ''}</td>`;
    });
    rows += `<tr style="page-break-inside:avoid;">${cells}</tr>`;
  });

  let headers = '<td style="border:1px solid #000;padding:2px 6px;font-weight:bold;">姓名</td>';
  sessions.forEach(s => {
    const isDay = isClassDay(s);
    headers += `<td style="border:1px solid #000;width:26px;font-size:9px;text-align:center;${isDay ? '' : 'background:#f3f4f6;'}">${shortDate(s.date)}</td>`;
  });

  html += `
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr style="page-break-inside:avoid;">${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  el.innerHTML = html;
}
