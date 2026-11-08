// js/main-rewards.js — 彌撒／祈禱獎勵統計
// 版面：① 本班獎勵狀況（所有角色） ② 輸入領取（admin） ③ 點名核對（admin）

import {
  getAllClasses, getSessions, getRoster, getRollCallYear,
  getRewardConfig, getRewardClaims, saveRewardClaims, voidRewardClaim,
  invalidateRollcallYearCache
} from './data.js';
import { onRoleLoaded, logout } from './auth.js';
import { sortClasses } from './classOrder.js';
import {
  getCurrentSchoolYear, listSchoolYears, buildClassRewardRows, summarizeRewardRows,
  getNextClaimNos, formatClaimNos, claimWarning, getDefaultRewardConfig
} from './reward-calc.js';

const $ = (id) => document.getElementById(id);
const CATEGORY_LABEL = { '學生': '學生', '小導師': '小導師', '老師': '導師' };
const ALLOWED_ROLES = ['admin', 'teacher', 'staff'];

let role = null;
let schoolYear = '';
let config = null;
let sessions = [];
let classes = [];
let allClaims = [];
let classData = new Map();
let inputClass = '';
let quickSelected = null; // { className, studentName }
let claimContext = null;
let saving = false;

// ---------- helpers ----------

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function setMessage(text, type = 'info', action = null) {
  const el = $('message');
  if (!el) return;
  const color = type === 'error' ? 'text-red-600' : type === 'success' ? 'text-green-600' : 'text-gray-500';
  el.className = `no-print max-w-7xl mx-auto px-3 pt-2 text-sm font-medium min-h-[1.5rem] flex flex-wrap items-center gap-2 ${color}`;
  el.textContent = '';

  const span = document.createElement('span');
  span.textContent = text || '';
  el.appendChild(span);

  if (action && typeof action.onClick === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-100';
    btn.textContent = action.label || '撤銷';
    btn.addEventListener('click', action.onClick);
    el.appendChild(btn);
  }
}

let undoing = false;

/** 即時撤銷剛登記的紀錄（作廢，保留審計） */
async function undoClaims(claims, doneText = '已撤銷登記') {
  const list = (claims || []).filter(c => c && c.id);
  if (!list.length || undoing) return;

  undoing = true;
  try {
    for (const c of list) {
      await voidRewardClaim(schoolYear, c.id, '即時撤銷');
    }
    setMessage(doneText, 'success');
    await reloadClaims();
  } catch (err) {
    console.error(err);
    setMessage(`撤銷失敗：${err.message}`, 'error');
    try { await reloadClaims(); } catch (_) { /* ignore */ }
  } finally {
    undoing = false;
  }
}

function urlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
const escapeAttr = escapeHtml;

function lastMarkedDate(yearMarks) {
  const dates = Object.keys(yearMarks || {}).filter(date => {
    const marks = yearMarks[date] || {};
    return Object.keys(marks).length > 0;
  });
  return dates.sort().pop() || '';
}

function isAdmin() {
  return !!role && role.role === 'admin';
}

function currentClassData() {
  return classData.get(inputClass) || null;
}

function findRow(className, studentName) {
  const data = classData.get(className);
  if (!data) return null;
  return (data.rows || []).find(r => r.studentName === studentName) || null;
}

// ---------- init ----------

onRoleLoaded((loadedRole) => {
  if (!loadedRole || !ALLOWED_ROLES.includes(loadedRole.role)) {
    setMessage('您沒有使用此頁的權限', 'error');
    setTimeout(() => window.location.replace('./class_portal.html'), 1500);
    return;
  }
  init(loadedRole);
});

async function init(loadedRole) {
  role = loadedRole;
  $('homeLink').href = role.role === 'staff' ? './staff.html' : './class_portal.html';
  $('logoutBtn').addEventListener('click', logout);

  setupYearSelect();
  setupClassSelect();
  setupClaimDialog();
  setupActionDelegation();
  setupQuickStudentSearch();

  if ($('refreshBtn')) $('refreshBtn').addEventListener('click', refreshData);
  if ($('printBtn')) $('printBtn').addEventListener('click', () => window.print());
  if ($('checkRefresh')) $('checkRefresh').addEventListener('click', () => renderCheck());

  const dateEl = $('claimDateInput');
  if (dateEl) dateEl.value = todayStr();

  await loadAll();

  // 支援 ?student=姓名：自動選中該學生（跨班亦可）
  const urlStudent = urlParam('student');
  if (urlStudent) {
    const index = buildStudentIndex();
    const target = index.find(m => m.studentName === urlStudent && m.className === inputClass)
      || index.find(m => m.studentName === urlStudent);
    if (target) selectStudent(target.className, target.studentName);
  }

  if (urlParam('print') === '1') {
    setTimeout(() => window.print(), 400);
  }
}

function setupYearSelect() {
  const urlYear = urlParam('year');
  const years = listSchoolYears(3);
  schoolYear = urlYear || getCurrentSchoolYear();
  if (!years.includes(schoolYear)) years.unshift(schoolYear);

  const sel = $('yearSelect');
  if (sel) {
    sel.innerHTML = '';
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      sel.appendChild(opt);
    });
    sel.value = schoolYear;
    sel.addEventListener('change', async (e) => {
      schoolYear = e.target.value;
      config = getDefaultRewardConfig(schoolYear);
      quickSelected = null;
      await loadAll();
    });
  }
  config = getDefaultRewardConfig(schoolYear);
}

function setupClassSelect() {
  const sel = $('classSelect');
  if (!sel) return;
  sel.addEventListener('change', (e) => {
    inputClass = e.target.value;
    quickSelected = null;
    syncUrlClass();
    renderAll();
  });
}

function syncUrlClass(studentName) {
  try {
    const params = new URLSearchParams(window.location.search);
    if (inputClass) params.set('class', inputClass);
    else params.delete('class');
    if (studentName) params.set('student', studentName);
    else params.delete('student');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  } catch (_) { /* history API 不可用時忽略 */ }
}

function fillClassSelect() {
  const sel = $('classSelect');
  if (!sel) return;
  sel.innerHTML = '';
  classes.forEach(cls => {
    const opt = document.createElement('option');
    opt.value = cls;
    opt.textContent = cls;
    sel.appendChild(opt);
  });
  sel.value = inputClass;
}

async function loadAll() {
  setMessage(`載入 ${schoolYear} 資料中…`);
  try {
    let rewardAccessError = null;
    const configPromise = getRewardConfig(schoolYear).catch(err => {
      rewardAccessError = err;
      return getDefaultRewardConfig(schoolYear);
    });
    const claimsPromise = getRewardClaims(schoolYear).catch(err => {
      rewardAccessError = rewardAccessError || err;
      return [];
    });

    const [loadedConfig, loadedSessions, loadedClasses, loadedClaims] = await Promise.all([
      configPromise, getSessions(), getAllClasses(), claimsPromise
    ]);

    config = loadedConfig;
    sessions = Array.isArray(loadedSessions) ? loadedSessions : [];
    allClaims = Array.isArray(loadedClaims) ? loadedClaims : [];

    let available = Array.isArray(loadedClasses) ? loadedClasses : [];
    if (role.role === 'teacher') {
      const own = Array.isArray(role.classes) ? role.classes : [];
      available = available.filter(c => own.includes(c));
    }
    classes = sortClasses(available);

    if (!classes.length) {
      setMessage('您沒有可用的班級權限', 'error');
      return;
    }

    const urlClass = urlParam('class');
    if (urlClass && classes.includes(urlClass)) inputClass = urlClass;
    else if (!inputClass || !classes.includes(inputClass)) inputClass = classes[0];

    fillClassSelect();
    await loadClassData();
    renderAll();

    if (rewardAccessError) {
      setMessage(`獎勵資料讀取失敗：${rewardAccessError.message}。請確認 Firestore rules 已發布。`, 'error');
    } else {
      setMessage(`已載入 ${classes.length} 班 · ${sessions.length} 個主日 · 資料截至 ${maxDataDate() || '—'}`);
    }
  } catch (err) {
    console.error(err);
    setMessage(`載入失敗：${err.message}`, 'error');
  }
}

function maxDataDate() {
  const dates = classes.map(cls => (classData.get(cls) || {}).lastRollcallDate || '');
  return dates.sort().pop() || '';
}

async function loadClassData() {
  const entries = await Promise.all(classes.map(async (cls) => {
    const [roster, yearMarks] = await Promise.all([getRoster(cls), getRollCallYear(cls)]);
    return [cls, { roster, yearMarks }];
  }));
  classData = new Map(entries);
  rebuildRows();
}

function rebuildRows() {
  for (const [cls, data] of classData.entries()) {
    data.rows = buildClassRewardRows({
      className: cls,
      roster: data.roster,
      sessions,
      yearMarks: data.yearMarks,
      claims: allClaims,
      config
    });
    data.summary = summarizeRewardRows(data.rows, config.threshold);
    data.lastRollcallDate = lastMarkedDate(data.yearMarks);
  }
}

async function reloadClaims() {
  try {
    allClaims = await getRewardClaims(schoolYear);
  } catch (err) {
    console.error(err);
    setMessage(`重新載入獎勵紀錄失敗：${err.message}`, 'error');
  }
  rebuildRows();
  renderAll();
}

async function refreshData() {
  if (typeof invalidateRollcallYearCache === 'function') {
    classes.forEach(cls => {
      try { invalidateRollcallYearCache(cls); } catch (_) { /* ignore */ }
    });
  }
  await loadAll();
}

// ---------- renderAll ----------

function renderAll() {
  renderReport();
  renderInput();
  renderCheck();
}

// ---------- ① 本班獎勵狀況 ----------

function renderReport() {
  if (!config) return;
  const data = currentClassData();
  const label = $('reportClassLabel');
  if (label) label.textContent = inputClass || '—';

  const printTitle = $('printTitle');
  if (printTitle) printTitle.textContent = `${inputClass || ''} 彌撒獎勵統計`;
  const printSubtitle = $('printSubtitle');
  if (printSubtitle) {
    printSubtitle.textContent = `${schoolYear} 學年 · 列印日期 ${todayStr()} · 彌撒每 ${config.threshold} 次可領 1 個`;
  }

  const summaryEl = $('reportSummary');
  const statusEl = $('reportStatusText');
  const body = $('reportBody');
  const noData = $('noDataAlert');

  if (!data) {
    if (summaryEl) summaryEl.innerHTML = '';
    if (statusEl) statusEl.textContent = '沒有班級資料';
    if (body) body.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">沒有班級資料</td></tr>';
    if (noData) noData.classList.add('hidden');
    return;
  }

  const rows = data.rows || [];
  const summary = data.summary || summarizeRewardRows(rows, config.threshold);
  const withMass = rows.filter(r => r.massCount > 0).length;

  if (statusEl) {
    statusEl.textContent = `${rows.length} 位學生 · ${withMass} 位有彌撒紀錄 · 資料截至 ${data.lastRollcallDate || '—'}`;
  }

  if (summaryEl) {
    summaryEl.innerHTML = [
      { label: '學生', value: summary.studentCount, unit: '人', color: 'text-gray-800' },
      { label: '彌撒', value: summary.massTotal, unit: '次', color: 'text-orange-600' },
      { label: '應得', value: summary.earnedTotal, unit: '個', color: 'text-blue-700' },
      { label: '已領', value: summary.claimedTotal, unit: '個', color: 'text-emerald-700' },
      { label: '待領', value: summary.pendingTotal, unit: '個', color: summary.pendingTotal ? 'text-red-600' : 'text-gray-500' },
      { label: '祈禱已領', value: summary.prayerTotal || 0, unit: '個', color: 'text-purple-700' }
    ].map(c => `
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 px-3 py-3">
        <div class="text-[11px] text-gray-500">${c.label}</div>
        <div class="kpi-number text-xl font-bold ${c.color} mt-0.5">${c.value}<span class="text-[11px] font-normal text-gray-400 ml-1">${c.unit}</span></div>
      </div>
    `).join('');
  }

  if (noData) {
    noData.classList.toggle('hidden', !(rows.length === 0 || rows.every(r => r.massCount === 0)));
  }

  if (!body) return;
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">沒有學生資料</td></tr>';
    return;
  }

  body.innerHTML = rows.map((r, i) => {
    const pendingColor = r.pending > 0 ? 'text-red-600' : 'text-gray-400';
    const lastLines = [];
    if (r.lastClaimedAt) lastLines.push(`<div><span class="text-orange-500">彌</span> ${escapeHtml(r.lastClaimedAt)}</div>`);
    if (r.lastPrayerClaimedAt) lastLines.push(`<div><span class="text-purple-500">祈</span> ${escapeHtml(r.lastPrayerClaimedAt)}</div>`);
    return `
      <tr class="border-t border-gray-100 hover:bg-blue-50">
        <td class="px-3 py-2 text-gray-400 text-[11px]">${i + 1}</td>
        <td class="px-4 py-2 font-medium">
          ${escapeHtml(r.studentName)}
          ${r.category && r.category !== '學生' ? `<span class="ml-1 text-[10px] text-gray-400">${escapeHtml(CATEGORY_LABEL[r.category] || r.category)}</span>` : ''}
        </td>
        <td class="px-3 py-2 text-right font-bold">${r.massCount}</td>
        <td class="px-3 py-2 text-right text-blue-700 font-bold">${r.earned}</td>
        <td class="px-3 py-2 text-right">${r.claimed}</td>
        <td class="px-3 py-2 text-right font-bold ${pendingColor}">${r.pending}</td>
        <td class="px-3 py-2 text-right text-purple-700">${r.prayerClaimed || 0}</td>
        <td class="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">${lastLines.join('') || '—'}</td>
      </tr>
    `;
  }).join('');
}

// ---------- ② 輸入領取 ----------

function renderInput() {
  const section = $('inputSection');
  if (!section) return;

  if (!isAdmin()) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  const data = currentClassData();
  const body = $('inputStudentBody');

  if (!data) {
    if (body) body.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-center text-gray-400">沒有班級資料</td></tr>';
    renderSelectedPanel();
    renderPrayerPanel();
    renderRecentClaims();
    return;
  }

  const rows = data.rows || [];

  if (body) {
    body.innerHTML = rows.map(r => {
      const selected = quickSelected
        && quickSelected.className === inputClass
        && quickSelected.studentName === r.studentName;
      const canClaim = r.pending > 0;
      return `
        <tr class="border-t border-gray-100 hover:bg-blue-50 ${selected ? 'row-selected' : ''}">
          <td class="px-3 py-2">
            <button type="button" data-action="select-student" data-class="${escapeAttr(inputClass)}" data-name="${escapeAttr(r.studentName)}"
              class="font-medium text-left hover:text-blue-700 hover:underline">${escapeHtml(r.studentName)}</button>
            ${r.category && r.category !== '學生' ? `<div class="text-[10px] text-gray-400">${escapeHtml(CATEGORY_LABEL[r.category] || r.category)}</div>` : ''}
          </td>
          <td class="px-3 py-2 text-right">${r.massCount}</td>
          <td class="px-3 py-2 text-right">${r.earned}</td>
          <td class="px-3 py-2 text-right">${r.claimed}</td>
          <td class="px-3 py-2 text-right font-bold ${r.pending ? 'text-red-600' : 'text-gray-400'}">${r.pending}</td>
          <td class="px-3 py-2 text-right text-purple-700">${r.prayerClaimed || 0}</td>
          <td class="px-3 py-2 text-center whitespace-nowrap">
            <button type="button" data-action="claim-mass" data-class="${escapeAttr(inputClass)}" data-name="${escapeAttr(r.studentName)}"
              class="text-xs px-2.5 py-1 rounded font-bold ${canClaim ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400'}"
              ${canClaim ? '' : 'disabled'}>領取</button>
            <button type="button" data-action="history" data-class="${escapeAttr(inputClass)}" data-name="${escapeAttr(r.studentName)}"
              class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">紀錄</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  const sumEl = $('inputClassSummary');
  if (sumEl) {
    const s = data.summary || {};
    sumEl.textContent = `${s.studentCount || 0} 人 · 待領 ${s.pendingTotal || 0} 個`;
  }

  renderSelectedPanel();
  renderPrayerPanel();
  renderRecentClaims();
}

function renderSelectedPanel() {
  const panel = $('claimPanel');
  if (!panel) return;

  if (!quickSelected) {
    panel.classList.add('hidden');
    const clearBtn = $('quickStudentClear');
    if (clearBtn) clearBtn.classList.add('hidden');
    return;
  }

  const cls = quickSelected.className;
  const name = quickSelected.studentName;
  const row = findRow(cls, name);

  panel.classList.remove('hidden');
  const clearBtn = $('quickStudentClear');
  if (clearBtn) clearBtn.classList.remove('hidden');

  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('claimPanelClass', cls);
  set('claimPanelName', name);

  if (!row) {
    set('panelMassCount', '—');
    set('panelEarned', '—');
    set('panelClaimed', '—');
    set('panelPending', '—');
    set('panelPrayer', '—');
    const hint = $('claimHint');
    if (hint) hint.textContent = '找不到這位學生的名單資料（可能已轉班）。';
    const massBtn = $('btnClaimMass');
    if (massBtn) massBtn.disabled = true;
    return;
  }

  set('panelMassCount', row.massCount);
  set('panelEarned', row.earned);
  set('panelClaimed', row.claimed);
  set('panelPending', row.pending);
  set('panelPrayer', row.prayerClaimed || 0);

  const massBtn = $('btnClaimMass');
  if (massBtn) massBtn.disabled = row.pending <= 0;

  const hint = $('claimHint');
  if (hint) {
    if (row.pending > 0) {
      hint.textContent = `可領 ${row.pending} 個彌撒獎勵（已完成 ${row.progress}/${row.threshold}，再多 ${row.toNext} 次可再領 1 個）。`;
    } else if (row.massCount === 0) {
      hint.textContent = '未有彌撒點名紀錄，不能登記彌撒獎勵。祈禱獎勵仍可手動登記。';
    } else {
      hint.textContent = `已領齊（${row.claimed}/${row.earned}）。再多 ${row.toNext} 次彌撒可再領 1 個。`;
    }
  }

  // 日期跟隨選取
  const dateEl = $('claimDateInput');
  if (dateEl && !dateEl.value) dateEl.value = todayStr();
}

function selectStudent(className, studentName) {
  quickSelected = { className, studentName };
  inputClass = className;
  const sel = $('classSelect');
  if (sel) sel.value = className;
  syncUrlClass(studentName);
  const input = $('quickStudentInput');
  if (input) input.value = studentName;
  const suggest = $('quickStudentSuggest');
  if (suggest) suggest.classList.add('hidden');
  renderAll();
}

function clearSelection() {
  quickSelected = null;
  const input = $('quickStudentInput');
  if (input) input.value = '';
  const suggest = $('quickStudentSuggest');
  if (suggest) suggest.classList.add('hidden');
  renderAll();
}

// ---------- 祈禱獎勵紀錄 ----------

function renderPrayerPanel() {
  const body = $('prayerPanelBody');
  const statusEl = $('prayerPanelStatus');
  if (!body) return;

  const list = allClaims
    .filter(c => c.className === inputClass && c.type === 'prayer')
    .sort((a, b) => String(b.claimedAt || '').localeCompare(String(a.claimedAt || '')));

  if (statusEl) {
    const people = new Set(list.map(c => c.studentName)).size;
    statusEl.textContent = list.length
      ? `${people} 人 · 共 ${list.length} 次`
      : '暫無紀錄';
  }

  if (!list.length) {
    body.innerHTML = '<tr><td colspan="3" class="px-4 py-6 text-center text-gray-400">暫無祈禱獎勵紀錄</td></tr>';
    return;
  }

  body.innerHTML = list.map(c => `
    <tr class="border-t border-gray-100 hover:bg-purple-50/40">
      <td class="px-3 py-2 font-medium">${escapeHtml(c.studentName)}</td>
      <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(c.claimedAt || '—')}</td>
      <td class="px-3 py-2 text-center whitespace-nowrap no-print">
        <button type="button" data-action="convert-claim" data-to="mass"
          data-id="${escapeAttr(c.id)}" data-class="${escapeAttr(c.className)}" data-name="${escapeAttr(c.studentName)}"
          data-date="${escapeAttr(c.claimedAt || '')}" data-no="${escapeAttr(c.claimNo)}"
          class="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100">更正為彌撒</button>
        <button type="button" data-action="void" data-id="${escapeAttr(c.id)}" data-class="${escapeAttr(c.className)}"
          data-name="${escapeAttr(c.studentName)}" data-no="${escapeAttr(c.claimNo)}"
          class="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 ml-1">作廢</button>
      </td>
    </tr>
  `).join('');
}

// ---------- 最近領取紀錄 ----------

function renderRecentClaims() {
  const body = $('inputRecentClaims');
  const statusEl = $('recentClaimsStatus');
  if (!body) return;

  const list = allClaims
    .filter(c => c.className === inputClass)
    .sort((a, b) => {
      const d = String(b.claimedAt || '').localeCompare(String(a.claimedAt || ''));
      if (d) return d;
      return String(a.type || '').localeCompare(String(b.type || ''));
    });

  if (statusEl) statusEl.textContent = `${list.length} 條 · 最新 20 條`;

  if (!list.length) {
    body.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">暫無紀錄</td></tr>';
    return;
  }

  body.innerHTML = list.slice(0, 20).map(c => {
    const isPrayer = c.type === 'prayer';
    const otherType = isPrayer ? 'mass' : 'prayer';
    const otherLabel = isPrayer ? '更正為彌撒' : '更正為祈禱';
    return `
      <tr class="border-t border-gray-100 hover:bg-gray-50">
        <td class="px-3 py-2 whitespace-nowrap text-xs">${escapeHtml(c.claimedAt || '—')}</td>
        <td class="px-3 py-2">${escapeHtml(c.studentName)}</td>
        <td class="px-2 py-2 text-center whitespace-nowrap">
          <span class="text-xs px-1.5 py-0.5 rounded ${isPrayer ? 'bg-purple-50 text-purple-700' : 'bg-orange-50 text-orange-700'}">${isPrayer ? '祈禱' : '彌撒'}</span>
        </td>
        <td class="px-2 py-2 text-center whitespace-nowrap text-xs">${isPrayer ? '—' : `第 ${escapeHtml(c.claimNo)} 個`}</td>
        <td class="px-3 py-2 text-gray-500 text-xs">${escapeHtml(c.note || '')}</td>
        <td class="px-3 py-2 text-center whitespace-nowrap no-print">
          <button type="button" data-action="convert-claim" data-to="${otherType}"
            data-id="${escapeAttr(c.id)}" data-class="${escapeAttr(c.className)}" data-name="${escapeAttr(c.studentName)}"
            data-date="${escapeAttr(c.claimedAt || '')}" data-no="${escapeAttr(c.claimNo)}"
            class="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100">${otherLabel}</button>
          <button type="button" data-action="void" data-id="${escapeAttr(c.id)}" data-class="${escapeAttr(c.className)}"
            data-name="${escapeAttr(c.studentName)}" data-no="${escapeAttr(c.claimNo)}"
            class="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 ml-1">作廢</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ---------- 快速搜尋（跨班） ----------

function buildStudentIndex() {
  const out = [];
  const seen = new Set();
  for (const cls of classes) {
    const data = classData.get(cls);
    if (!data) continue;
    for (const s of (data.roster || [])) {
      if (!s || !s.name) continue;
      if ((s.category || '學生') !== '學生') continue;
      const key = `${cls}~${s.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ className: cls, studentName: s.name });
    }
  }
  return out;
}

let _quickBound = false;

function setupQuickStudentSearch() {
  const input = $('quickStudentInput');
  const suggest = $('quickStudentSuggest');
  if (!input || !suggest) return;

  if (_quickBound) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    suggest.innerHTML = '';
    if (!q) {
      suggest.classList.add('hidden');
      return;
    }

    const matches = buildStudentIndex()
      .filter(m => {
        const n = m.studentName.toLowerCase();
        return n.includes(q);
      })
      .sort((a, b) => {
        const ai = a.studentName.toLowerCase().indexOf(q);
        const bi = b.studentName.toLowerCase().indexOf(q);
        if (ai !== bi) return ai - bi;
        if (a.studentName.length !== b.studentName.length) return a.studentName.length - b.studentName.length;
        return a.className.localeCompare(b.className, 'zh-Hant');
      })
      .slice(0, 12);

    if (!matches.length) {
      suggest.innerHTML = '<div class="px-3 py-2 text-sm text-gray-400">找不到學生</div>';
      suggest.classList.remove('hidden');
      return;
    }

    for (const m of matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between gap-2';
      btn.innerHTML = `<span class="font-medium">${escapeHtml(m.studentName)}</span><span class="text-xs text-gray-500">${escapeHtml(m.className)}</span>`;
      btn.addEventListener('click', () => selectStudent(m.className, m.studentName));
      suggest.appendChild(btn);
    }
    suggest.classList.remove('hidden');
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') suggest.classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!suggest.contains(e.target) && e.target !== input) {
      suggest.classList.add('hidden');
    }
  });

  const clearBtn = $('quickStudentClear');
  if (clearBtn) clearBtn.addEventListener('click', clearSelection);

  _quickBound = true;
}

// ---------- ③ 點名核對 ----------

function renderCheck() {
  const section = $('checkSection');
  if (!section) return;

  if (!isAdmin()) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  const body = $('checkBody');
  const sumEl = $('checkSummary');
  const rows = [];

  for (const cls of classes) {
    const data = classData.get(cls);
    if (!data) continue;
    for (const r of (data.rows || [])) {
      const massTicks = r.massCount;
      const massEarned = r.earned;
      const massClaimed = r.claimed;
      const diff = massClaimed - massEarned;

      if (diff !== 0) {
        rows.push({
          className: cls,
          studentName: r.studentName,
          massTicks,
          massEarned,
          massClaimed,
          diff,
          prayerClaimed: r.prayerClaimed || 0
        });
      }
    }
  }

  rows.sort((a, b) => {
    const d = Math.abs(b.diff) - Math.abs(a.diff);
    if (d) return d;
    return a.className.localeCompare(b.className, 'zh-Hant')
      || a.studentName.localeCompare(b.studentName, 'zh-Hant');
  });

  if (sumEl) sumEl.textContent = rows.length ? `${rows.length} 筆不符` : '全部吻合';

  if (!body) return;
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7" class="px-4 py-6 text-center text-gray-400">沒有異常，全部吻合</td></tr>';
    return;
  }

  body.innerHTML = rows.map(r => `
    <tr class="border-t border-gray-100 hover:bg-gray-50">
      <td class="px-3 py-2">${escapeHtml(r.className)}</td>
      <td class="px-3 py-2 font-medium">${escapeHtml(r.studentName)}</td>
      <td class="px-3 py-2 text-right">${r.massTicks}</td>
      <td class="px-3 py-2 text-right">${r.massClaimed}</td>
      <td class="px-3 py-2 text-right font-bold ${r.diff > 0 ? 'text-red-600' : 'text-orange-600'}">${r.diff > 0 ? `+${r.diff}` : r.diff}</td>
      <td class="px-3 py-2 text-right text-purple-700">${r.prayerClaimed}</td>
      <td class="px-3 py-2 text-center">
        <button type="button" data-action="goto-input" data-class="${escapeAttr(r.className)}" data-name="${escapeAttr(r.studentName)}"
          class="text-xs px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">查看</button>
      </td>
    </tr>
  `).join('');
}

// ---------- 登記領取 ----------

async function claimMass(className, studentName) {
  if (!isAdmin() || saving) return;
  const row = findRow(className, studentName);
  if (!row) {
    setMessage('找不到學生資料，請重新整理', 'error');
    return;
  }

  const claimedAt = ($('claimDateInput') && $('claimDateInput').value) || todayStr();
  const claimNos = getNextClaimNos(row.claims.map(c => c.claimNo), 1);
  const warning = claimWarning(row, claimNos);
  if (warning && !window.confirm(`${warning}\n\n仍然要登記嗎？`)) return;

  saving = true;
  try {
    const saved = await saveRewardClaims(schoolYear, claimNos.map(claimNo => ({
      className,
      studentName,
      claimNo,
      claimedAt,
      type: 'mass',
      massCountAtClaim: row.massCount,
      note: '',
      source: 'app'
    })));
    await reloadClaims();
    setMessage(`已登記彌撒獎勵：${className} ${studentName} ${formatClaimNos(claimNos)}（${claimedAt}）`, 'success', {
      label: '撤銷',
      onClick: () => undoClaims(saved, `已撤銷：${className} ${studentName} ${formatClaimNos(claimNos)}`)
    });
  } catch (err) {
    console.error(err);
    setMessage(`登記失敗：${err.message}`, 'error');
  } finally {
    saving = false;
  }
}

async function claimPrayer(className, studentName) {
  if (!isAdmin() || saving) return;
  const row = findRow(className, studentName);
  if (!row) {
    setMessage('找不到學生資料，請重新整理', 'error');
    return;
  }

  const claimedAt = ($('claimDateInput') && $('claimDateInput').value) || todayStr();
  const usedNos = (row.prayerClaims || []).map(c => c.claimNo);
  const claimNos = getNextClaimNos(usedNos, 1);

  if (!window.confirm(`確定登記祈禱獎勵？\n\n${className} ${studentName}\n第 ${claimNos[0]} 個 · ${claimedAt}`)) return;

  saving = true;
  try {
    const saved = await saveRewardClaims(schoolYear, claimNos.map(claimNo => ({
      className,
      studentName,
      claimNo,
      claimedAt,
      type: 'prayer',
      prayerCountAtClaim: 0,
      note: '',
      source: 'app'
    })));
    await reloadClaims();
    setMessage(`已登記祈禱獎勵：${className} ${studentName} ${formatClaimNos(claimNos)}（${claimedAt}）`, 'success', {
      label: '撤銷',
      onClick: () => undoClaims(saved, `已撤銷：${className} ${studentName} ${formatClaimNos(claimNos)}`)
    });
  } catch (err) {
    console.error(err);
    setMessage(`登記失敗：${err.message}`, 'error');
  } finally {
    saving = false;
  }
}

// ---------- 補錄 dialog ----------

function setupClaimDialog() {
  const cancel = $('claimCancel');
  const cancelTop = $('claimCancelTop');
  const confirm = $('claimConfirm');
  const count = $('claimCount');
  if (cancel) cancel.addEventListener('click', closeClaimDialog);
  if (cancelTop) cancelTop.addEventListener('click', closeClaimDialog);
  if (confirm) confirm.addEventListener('click', confirmClaim);
  if (count) count.addEventListener('input', updateClaimPreview);

  const hc = $('historyClose');
  const hct = $('historyCloseTop');
  if (hc) hc.addEventListener('click', closeHistoryDialog);
  if (hct) hct.addEventListener('click', closeHistoryDialog);
}

function openClaimDialog(className, studentName) {
  if (!isAdmin()) return;
  const row = findRow(className, studentName);
  if (!row) {
    setMessage('找不到學生資料，請重新整理', 'error');
    return;
  }

  claimContext = { className, studentName, row };
  const title = $('claimDialogTitle');
  if (title) title.textContent = '補錄彌撒獎勵';
  const info = $('claimStudentInfo');
  if (info) info.textContent = `${className} · ${studentName} · 彌撒 ${row.massCount} 次 · 應得 ${row.earned} · 已領 ${row.claimed} · 待領 ${row.pending}`;

  const cnt = $('claimCount');
  if (cnt) cnt.value = Math.max(1, Math.min(20, row.pending || 1));
  const d = $('claimDate');
  if (d) d.value = ($('claimDateInput') && $('claimDateInput').value) || todayStr();
  const note = $('claimNote');
  if (note) note.value = '';

  updateClaimPreview();
  const dialog = $('claimDialog');
  if (dialog) {
    if (dialog.open) dialog.close();
    dialog.showModal();
  }
}

function updateClaimPreview() {
  if (!claimContext) return;
  const { row } = claimContext;
  const countEl = $('claimCount');
  const count = Math.max(1, Math.min(20, Number(countEl && countEl.value) || 1));
  const claimNos = getNextClaimNos(row.claims.map(c => c.claimNo), count);
  claimContext.claimNos = claimNos;

  const preview = $('claimNosPreview');
  if (preview) preview.textContent = formatClaimNos(claimNos);

  const confirmBtn = $('claimConfirm');
  if (confirmBtn) confirmBtn.textContent = claimNos.length > 1 ? `確認登記 ${claimNos.length} 個` : '確認';

  const warning = claimWarning(row, claimNos);
  const el = $('claimWarning');
  if (el) {
    if (warning) {
      el.textContent = `⚠️ ${warning}`;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }
}

function closeClaimDialog() {
  claimContext = null;
  const dialog = $('claimDialog');
  if (dialog && dialog.open) dialog.close();
}

async function confirmClaim() {
  if (!claimContext || saving) return;
  const { className, studentName, row } = claimContext;
  const countEl = $('claimCount');
  const count = Math.max(1, Math.min(20, Number(countEl && countEl.value) || 1));
  const claimNos = claimContext.claimNos || getNextClaimNos(row.claims.map(c => c.claimNo), count);
  const claimedAt = ($('claimDate') && $('claimDate').value) || todayStr();
  const note = ($('claimNote') && $('claimNote').value.trim()) || '';

  const warning = claimWarning(row, claimNos);
  if (warning && !window.confirm(`${warning}\n\n仍然要登記嗎？`)) return;

  const btn = $('claimConfirm');
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '儲存中…'; }

  saving = true;
  try {
    const saved = await saveRewardClaims(schoolYear, claimNos.map(claimNo => ({
      className,
      studentName,
      claimNo,
      claimedAt,
      type: 'mass',
      massCountAtClaim: row.massCount,
      note,
      source: 'app'
    })));
    closeClaimDialog();
    await reloadClaims();
    setMessage(`已補錄：${className} ${studentName} ${formatClaimNos(claimNos)}`, 'success', {
      label: '撤銷',
      onClick: () => undoClaims(saved, `已撤銷：${className} ${studentName} ${formatClaimNos(claimNos)}`)
    });
  } catch (err) {
    console.error(err);
    setMessage(`補錄失敗：${err.message}`, 'error');
  } finally {
    saving = false;
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

// ---------- 動作委派 ----------

function setupActionDelegation() {
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const cls = el.dataset.class;
    const name = el.dataset.name;

    if (action === 'select-student') {
      e.preventDefault();
      selectStudent(cls, name);
      return;
    }
    if (action === 'claim-mass') {
      e.preventDefault();
      await claimMass(cls, name);
      return;
    }
    if (action === 'history') {
      e.preventDefault();
      openHistoryDialog(cls, name);
      return;
    }
    if (action === 'void') {
      e.preventDefault();
      await handleVoidClaim(el);
      return;
    }
    if (action === 'convert-claim') {
      e.preventDefault();
      await convertClaimType(el);
      return;
    }
    if (action === 'goto-input') {
      e.preventDefault();
      selectStudent(cls, name);
      const section = $('inputSection');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  });

  // 已選學生卡的按鈕
  const massBtn = $('btnClaimMass');
  if (massBtn) {
    massBtn.addEventListener('click', () => {
      if (!quickSelected) return;
      claimMass(quickSelected.className, quickSelected.studentName);
    });
  }
  const prayerBtn = $('btnClaimPrayer');
  if (prayerBtn) {
    prayerBtn.addEventListener('click', () => {
      if (!quickSelected) return;
      claimPrayer(quickSelected.className, quickSelected.studentName);
    });
  }
  const batchBtn = $('btnBatch');
  if (batchBtn) {
    batchBtn.addEventListener('click', () => {
      if (!quickSelected) return;
      openClaimDialog(quickSelected.className, quickSelected.studentName);
    });
  }
  const historyBtn = $('btnHistory');
  if (historyBtn) {
    historyBtn.addEventListener('click', () => {
      if (!quickSelected) return;
      openHistoryDialog(quickSelected.className, quickSelected.studentName);
    });
  }
}

async function handleVoidClaim(el) {
  const id = el.dataset.id;
  const className = el.dataset.class;
  const studentName = el.dataset.name;
  const claimNo = el.dataset.no;
  if (!id || saving) return;
  if (!window.confirm(`確定作廢 ${className} ${studentName} 第 ${claimNo} 個獎勵？\n作廢後可以重新登記。`)) return;

  saving = true;
  try {
    await voidRewardClaim(schoolYear, id, '介面作廢');
    setMessage(`已作廢：${className} ${studentName} 第 ${claimNo} 個`, 'success');
    await reloadClaims();
  } catch (err) {
    console.error(err);
    setMessage(`作廢失敗：${err.message}`, 'error');
  } finally {
    saving = false;
  }
}

async function convertClaimType(el) {
  if (!isAdmin() || saving) return;
  const id = el.dataset.id;
  const toType = el.dataset.to === 'prayer' ? 'prayer' : 'mass';
  const className = el.dataset.class;
  const studentName = el.dataset.name;
  const claimedAt = el.dataset.date || todayStr();
  if (!id || !className || !studentName) return;

  const toLabel = toType === 'prayer' ? '祈禱' : '彌撒';
  if (!window.confirm(
    `確定將 ${className} ${studentName} 這筆紀錄更正為「${toLabel}」？\n\n`
    + `系統會先作廢原本紀錄，再按 ${claimedAt} 新增一筆${toLabel}獎勵。`
  )) return;

  saving = true;
  try {
    await voidRewardClaim(schoolYear, id, `更正為${toLabel}（轉換）`);

    const sameType = allClaims.filter(c =>
      c.className === className
      && c.studentName === studentName
      && (c.type === 'prayer' ? 'prayer' : 'mass') === toType
    );
    const claimNos = getNextClaimNos(sameType.map(c => c.claimNo), 1);
    const row = findRow(className, studentName);

    await saveRewardClaims(schoolYear, claimNos.map(claimNo => ({
      className,
      studentName,
      claimNo,
      claimedAt,
      type: toType,
      massCountAtClaim: row ? row.massCount : 0,
      prayerCountAtClaim: 0,
      note: `由${toType === 'prayer' ? '彌撒' : '祈禱'}更正`,
      source: 'app'
    })));

    setMessage(`已將 ${className} ${studentName} 更正為${toLabel}獎勵（${claimedAt}）`, 'success');
    await reloadClaims();
  } catch (err) {
    console.error(err);
    setMessage(`更正失敗：${err.message}`, 'error');
    try { await reloadClaims(); } catch (_) { /* ignore */ }
  } finally {
    saving = false;
  }
}

// ---------- 紀錄 dialog ----------

function openHistoryDialog(className, studentName) {
  const row = findRow(className, studentName);
  if (!row) return;

  const title = $('historyTitle');
  if (title) title.textContent = '領取紀錄';
  const sub = $('historySubtitle');
  if (sub) {
    sub.textContent = `${className} · ${studentName} · 彌撒 ${row.massCount} 次 · 應得 ${row.earned} · 已領 ${row.claimed} · 祈禱已領 ${row.prayerClaimed || 0}`;
  }

  const all = [
    ...(row.claims || []).map(c => ({ ...c, type: 'mass' })),
    ...(row.prayerClaims || []).map(c => ({ ...c, type: 'prayer' }))
  ].sort((a, b) => String(b.claimedAt || '').localeCompare(String(a.claimedAt || '')));

  const bodyEl = $('historyBody');
  if (!bodyEl) return;

  if (!all.length) {
    bodyEl.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">暫無領取紀錄</p>';
  } else {
    bodyEl.innerHTML = `
      <table class="w-full text-sm border-collapse">
        <thead class="bg-gray-100 text-gray-600">
          <tr>
            <th class="px-3 py-2 text-left whitespace-nowrap">日期</th>
            <th class="px-2 py-2 text-center">類型</th>
            <th class="px-2 py-2 text-center whitespace-nowrap">第幾個</th>
            <th class="px-3 py-2 text-left">備註</th>
          </tr>
        </thead>
        <tbody>
          ${all.map(c => `
            <tr class="border-t border-gray-100">
              <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(c.claimedAt || '—')}</td>
              <td class="px-2 py-2 text-center whitespace-nowrap">
                <span class="text-xs px-1.5 py-0.5 rounded ${c.type === 'prayer' ? 'bg-purple-50 text-purple-700' : 'bg-orange-50 text-orange-700'}">${c.type === 'prayer' ? '祈禱' : '彌撒'}</span>
              </td>
              <td class="px-2 py-2 text-center whitespace-nowrap">第 ${escapeHtml(c.claimNo)} 個</td>
              <td class="px-3 py-2 text-gray-500">${escapeHtml(c.note || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  const dialog = $('historyDialog');
  if (dialog) {
    if (dialog.open) dialog.close();
    dialog.showModal();
  }
}

function closeHistoryDialog() {
  const dialog = $('historyDialog');
  if (dialog && dialog.open) dialog.close();
}
