// js/main-staff.js — 校務看板（唯讀）：通告 + 跨班出席統計
// 只顯示「學生」；分母定義同 rollcall.html?tab=mass 一致（31 堂 / 39 主日）。
import { getAllClasses, getRoster, getRollCallYear, getSessions, getNotices } from './data.js';
import { onRoleLoaded, logout } from './auth.js';

const CLASS_START = '2026-09-20';
const CLASS_END = '2027-05-23';
const MASS_START = '2026-09-01';
const MASS_END = '2027-05-31';

const $ = (id) => document.getElementById(id);

const TAB_IDS = { notices: 'tabNoticesBtn', stats: 'tabStatsBtn' };

function switchTab(name) {
  $('panelNotices').classList.toggle('hidden', name !== 'notices');
  $('panelStats').classList.toggle('hidden', name !== 'stats');
  Object.entries(TAB_IDS).forEach(([tab, btnId]) => {
    const btn = $(btnId);
    if (!btn) return;
    const active = tab === name;
    btn.classList.toggle('border-blue-600', active);
    btn.classList.toggle('text-blue-700', active);
    btn.classList.toggle('border-transparent', !active);
    btn.classList.toggle('text-gray-500', !active);
  });
}

function isClassDay(s) {
  return !(s.event || '').startsWith('假期');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function shortDate(dateStr) {
  const [, m, d] = String(dateStr || '').split('-');
  return m && d ? `${Number(m)}/${Number(d)}` : dateStr || '';
}

function setMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text || '';
  el.className = `text-center text-sm font-medium min-h-[1.25rem] ${isError ? 'text-red-600' : 'text-green-600'}`;
}

// ---------- 通告（最近 5 條） ----------

const CATEGORY_STYLE = {
  '公告': 'bg-blue-50 text-blue-700',
  '檔案': 'bg-green-50 text-green-700',
  '活動': 'bg-purple-50 text-purple-700'
};

function renderNotices(notices) {
  const body = $('noticesBody');
  body.innerHTML = '';
  const top = notices.slice(0, 5);
  if (!top.length) {
    body.innerHTML = '<div class="text-sm text-gray-400 text-center py-3">未有任何公告／檔案</div>';
    return;
  }
  top.forEach(n => {
    const item = document.createElement('div');
    item.className = 'border border-gray-100 rounded-lg px-3 py-2';

    const head = document.createElement('div');
    head.className = 'flex items-center gap-2';
    if (n.pinned) {
      const pin = document.createElement('span');
      pin.className = 'text-xs font-bold text-orange-600';
      pin.textContent = '📌';
      head.appendChild(pin);
    }
    const cat = document.createElement('span');
    cat.className = 'text-xs font-bold px-1.5 py-0.5 rounded ' + (CATEGORY_STYLE[n.category] || 'bg-gray-100 text-gray-600');
    cat.textContent = n.category || '公告';
    head.appendChild(cat);
    const title = document.createElement('span');
    title.className = 'font-bold text-sm truncate';
    title.textContent = n.title;
    head.appendChild(title);
    const spacer = document.createElement('div');
    spacer.className = 'flex-1';
    head.appendChild(spacer);
    const date = document.createElement('span');
    date.className = 'text-xs text-gray-400 whitespace-nowrap';
    date.textContent = shortDate(n.date);
    head.appendChild(date);
    item.appendChild(head);

    if (n.link) {
      const a = document.createElement('a');
      a.href = n.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'mt-1 inline-block text-xs text-blue-700 font-bold';
      a.textContent = (n.fileName ? n.fileName : '開啟') + ' ↗';
      item.appendChild(a);
    }
    body.appendChild(item);
  });
}

// ---------- 出席統計（跨班、唯讀、只計學生） ----------

let classStats = {};

function renderStats() {
  const body = $('statsBody');
  const stats = classStats[$('classSelect').value];
  body.innerHTML = '';
  if (!stats) {
    body.innerHTML = '<tr><td colspan="4" class="border p-4 text-center text-gray-400">未有資料</td></tr>';
    return;
  }
  if (!stats.rows.length) {
    body.innerHTML = '<tr><td colspan="4" class="border p-4 text-center text-gray-400">此班暫無學生資料</td></tr>';
    setMessage(`${stats.className}：無學生資料`);
    return;
  }
  setMessage(`${stats.className}：共 ${stats.count} 人 · 已記彌撒 ${stats.totalMass} 人次 · 已記出席 ${stats.totalPresent} 人次`);
  stats.rows.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-blue-50';
    tr.innerHTML = `
      <td class="border px-3 py-2.5 text-lg font-medium">${escapeHtml(s.name)}</td>
      <td class="border px-2 py-2.5 text-center text-xl font-bold text-orange-600">${s.mass} 次</td>
      <td class="border px-2 py-2.5 text-center text-gray-700">${s.present} 次</td>
      <td class="border px-2 py-2.5 text-center font-bold text-blue-700">${s.rate}%</td>
    `;
    body.appendChild(tr);
  });
}

async function loadAllStats(sessions) {
  const classes = await getAllClasses();
  const sel = $('classSelect');
  sel.innerHTML = '';
  classes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
  if (!classes.length) {
    setMessage('未有班級資料', true);
    return;
  }

  const classPeriod = sessions.filter(s => s.date >= CLASS_START && s.date <= CLASS_END);
  const massPeriod = sessions.filter(s => s.date >= MASS_START && s.date <= MASS_END);
  const classPotential = classPeriod.filter(isClassDay).length;

  setMessage('載入統計中...');
  classStats = {};
  await Promise.all(classes.map(async (cls) => {
    const [roster, yearMarks] = await Promise.all([getRoster(cls), getRollCallYear(cls)]);
    const rows = roster
      .filter(m => m.category === '學生')
      .map(m => {
        let mass = 0;
        let present = 0;
        for (const sess of massPeriod) {
          const mm = yearMarks[sess.date] && yearMarks[sess.date][m.name];
          if (!mm) continue;
          if (mm.mass === true) mass++;
          if (isClassDay(sess)
              && sess.date >= CLASS_START
              && sess.date <= CLASS_END
              && mm.present === true) present++;
        }
        return {
          name: m.name,
          category: m.category,
          mass,
          present,
          rate: classPotential ? Math.round((present / classPotential) * 100) : 0
        };
      })
      .sort((a, b) => b.mass - a.mass || b.present - a.present);
    classStats[cls] = {
      className: cls,
      rows,
      count: rows.length,
      totalMass: rows.reduce((sum, r) => sum + r.mass, 0),
      totalPresent: rows.reduce((sum, r) => sum + r.present, 0)
    };
  }));

  renderStats();
}

function init() {
  $('logoutBtn').addEventListener('click', () => logout());
  $('tabNoticesBtn').addEventListener('click', () => switchTab('notices'));
  $('tabStatsBtn').addEventListener('click', () => switchTab('stats'));
  $('classSelect').addEventListener('change', renderStats);

  Promise.all([getNotices(), getSessions()])
    .then(([notices, sessions]) => {
      renderNotices(notices);
      return loadAllStats(sessions);
    })
    .catch(err => setMessage(`載入失敗：${err.message}`, true));
}

onRoleLoaded((role) => {
  if (role && (role.role === 'staff' || role.role === 'admin')) {
    init();
  } else {
    setMessage('此頁僅限校務團／管理員使用', true);
    setTimeout(() => window.location.replace('./class_portal.html'), 1500);
  }
});
