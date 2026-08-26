// js/main-portal.js — 每班 Portal 頁
import { getAllClasses, getClassPortal } from './api.js';
import { onRoleLoaded, logout } from './auth.js';

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

async function init() {
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
    const p = await getClassPortal(currentClass);
    renderToday(p);
    renderActions(p);
    renderLinks(p);
    renderDetails(p);
    setMessage(`${currentClass}：共 ${p.rosterCount} 人`);
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
  }
}

function renderToday(p) {
  const card = $('todayCard');
  if (p.todaySession) {
    $('todayInfo').textContent = `${p.todaySession.date}（${p.todaySession.type}${p.todaySession.note ? ' ' + p.todaySession.note : ''}）`;
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
    { label: '全年矩陣', desc: '睇全年出席', href: `rollcall.html?class=${encodeURIComponent(p.className)}` },
    { label: '列印點名紙', desc: 'A4 硬copies', href: `rollcall.html?class=${encodeURIComponent(p.className)}` },
    { label: '彌撒登記', desc: '彌撒出席 + 獎勵', href: 'form.html' },
    { label: '上堂日曆', desc: '管理員設定', href: 'admin_sessions.html' },
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

onRoleLoaded(() => { init(); });
