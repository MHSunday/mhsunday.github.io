// js/main-rewards.js — 彌撒獎勵（每 5 次）統計頁
// Global View / Input View / Report
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
let currentTab = 'global';
let inputClass = '';
let reportClass = '*';
let claimContext = null;

// ---------- helpers ----------

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function setMessage(text, type = 'info') {
  const el = $('message');
  if (!el) return;
  el.textContent = text || '';
  const color = type === 'error' ? 'text-red-600' : type === 'success' ? 'text-green-600' : 'text-gray-500';
  el.className = `max-w-7xl mx-auto px-3 pt-2 text-sm font-medium min-h-[1.5rem] ${color}`;
}

function urlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function lastMarkedDate(yearMarks) {
  const dates = Object.keys(yearMarks || {}).filter(date => {
    const marks = yearMarks[date] || {};
    return Object.keys(marks).length > 0;
  });
  return dates.sort().pop() || '';
}

function rowsForClass(className) {
  const data = classData.get(className);
  return data ? data.rows : [];
}

function rowFor(className, studentName) {
  return rowsForClass(className).find(r => r.studentName === studentName) || null;
}

function filterRows(rows, { status = 'all', search = '' } = {}) {
  const q = String(search || '').trim().toLowerCase();
  return (rows || []).filter(r => {
    if (q && !String(r.studentName || '').toLowerCase().includes(q)) return false;
    if (status === 'pending') return r.pending > 0;
    if (status === 'claimed') return r.earned > 0 && r.pending === 0 && r.overClaimed === 0;
    if (status === 'over') return r.overClaimed > 0;
    if (status === 'nomass') return r.massCount === 0;
    return true;
  });
}

function allRows() {
  return classes.flatMap(cls => rowsForClass(cls));
}

function maxDataDate() {
  const dates = classes.map(cls => (classData.get(cls) || {}).lastRollcallDate || '');
  return dates.sort().pop() || '';
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

  if (role.role !== 'admin') {
    $('tabInputBtn').classList.add('hidden');
  }

  setupYearSelect();
  setupTabs();
  setupFilters();
  setupDialogs();
  setupActionDelegation();

  $('yearSelect').addEventListener('change', async (e) => {
    schoolYear = e.target.value;
    config = getDefaultRewardConfig(schoolYear);
    await loadAll();
  });
  $('refreshBtn').addEventListener('click', refreshData);

  const urlTab = urlParam('tab');
  if (urlTab && ['global', 'input', 'report'].includes(urlTab)) currentTab = urlTab;
  if (currentTab === 'input' && role.role !== 'admin') currentTab = 'global';

  const urlStatus = urlParam('status');
  if (urlStatus && ['pending', 'all', 'claimed', 'over', 'nomass'].includes(urlStatus)) {
    $('inputStatusFilter').value = urlStatus;
    $('reportStatusFilter').value = urlStatus;
  }

  await loadAll();

  if (urlParam('print') === '1') {
    switchTab('report');
    setTimeout(() => window.print(), 400);
  }
}

function setupYearSelect() {
  const urlYear = urlParam('year');
  const years = listSchoolYears(3);
  schoolYear = urlYear || getCurrentSchoolYear();
  if (!years.includes(schoolYear)) years.unshift(schoolYear);

  const sel = $('yearSelect');
  sel.innerHTML = '';
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  });
  sel.value = schoolYear;
  // 未有 Firestore 設定前先用預設值，避免載入期間切換 tab 讀到 null
  config = getDefaultRewardConfig(schoolYear);
}

function setupTabs() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function setupFilters() {
  $('inputClassSelect').addEventListener('change', (e) => {
    inputClass = e.target.value;
    renderInput();
  });
  $('inputSearch').addEventListener('input', renderInput);
  $('inputStatusFilter').addEventListener('change', renderInput);

  $('reportClassSelect').addEventListener('change', (e) => {
    reportClass = e.target.value;
    renderReport();
  });
  $('reportStatusFilter').addEventListener('change', renderReport);
  $('reportSearch').addEventListener('input', renderReport);
  $('reportFrom').addEventListener('change', renderReport);
  $('reportTo').addEventListener('change', renderReport);

  $('printBtn').addEventListener('click', printReport);
  $('exportCsvBtn').addEventListener('click', exportStudentCsv);
  $('exportClaimsCsvBtn').addEventListener('click', exportClaimsCsv);
}

function setupDialogs() {
  $('claimCancel').addEventListener('click', closeClaimDialog);
  $('claimCancelTop').addEventListener('click', closeClaimDialog);
  $('claimConfirm').addEventListener('click', confirmClaim);
  $('claimCount').addEventListener('input', updateClaimPreview);
  $('historyClose').addEventListener('click', () => $('historyDialog').close());
  $('historyCloseTop').addEventListener('click', () => $('historyDialog').close());
}

function setupActionDelegation() {
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    if (action === 'goto-report') {
      e.preventDefault();
      const cls = el.dataset.class;
      if (cls) {
        reportClass = cls;
        $('reportClassSelect').value = cls;
      }
      switchTab('report');
      return;
    }

    if (action === 'claim') {
      openClaimDialog('single', el.dataset.class, el.dataset.name);
    } else if (action === 'batch') {
      openClaimDialog('batch', el.dataset.class, el.dataset.name);
    } else if (action === 'history') {
      openHistoryDialog(el.dataset.class, el.dataset.name);
    } else if (action === 'void') {
      await handleVoidClaim(el);
    }
  });
}

// ---------- load ----------

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
      configPromise,
      getSessions(),
      getAllClasses(),
      claimsPromise
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
      renderAll();
      return;
    }

    fillClassSelects();
    await loadClassData();
    renderAll();
    switchTab(currentTab);
    if (rewardAccessError) {
      setMessage(`已載入班級資料，但獎勵資料讀取失敗：${rewardAccessError.message}。請確認 Firestore rules 已發布。`, 'error');
    } else {
      setMessage(`已載入 ${classes.length} 班 · ${sessions.length} 個主日 · 資料截至 ${maxDataDate() || '—'}`);
    }
  } catch (err) {
    console.error(err);
    setMessage(`載入失敗：${err.message}`, 'error');
  }
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
  allClaims = await getRewardClaims(schoolYear);
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

function fillClassSelects() {
  const requested = urlParam('class');

  const inputSel = $('inputClassSelect');
  inputSel.innerHTML = '';
  classes.forEach(cls => {
    const opt = document.createElement('option');
    opt.value = cls;
    opt.textContent = cls;
    inputSel.appendChild(opt);
  });
  if (requested && classes.includes(requested)) inputClass = requested;
  if (!classes.includes(inputClass)) inputClass = classes[0] || '';
  inputSel.value = inputClass;

  const reportSel = $('reportClassSelect');
  reportSel.innerHTML = '';
  const allowAll = role.role !== 'teacher' || classes.length > 1;
  if (allowAll) {
    const opt = document.createElement('option');
    opt.value = '*';
    opt.textContent = role.role === 'teacher' ? '全部（我的班）' : '全部班別';
    reportSel.appendChild(opt);
  }
  classes.forEach(cls => {
    const opt = document.createElement('option');
    opt.value = cls;
    opt.textContent = cls;
    reportSel.appendChild(opt);
  });

  if (requested && classes.includes(requested)) reportClass = requested;
  if (!allowAll) reportClass = classes[0] || '';
  if (reportClass !== '*' && !classes.includes(reportClass)) {
    reportClass = allowAll ? '*' : (classes[0] || '');
  }
  if (reportClass === '*' && !allowAll) reportClass = classes[0] || '';
  reportSel.value = reportClass;
}

function switchTab(name) {
  if (name === 'input' && role.role !== 'admin') name = 'global';
  currentTab = name;

  $('globalView').classList.toggle('hidden', name !== 'global');
  $('inputView').classList.toggle('hidden', name !== 'input');
  $('reportView').classList.toggle('hidden', name !== 'report');

  document.querySelectorAll('[data-tab]').forEach(btn => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('border-blue-600', active);
    btn.classList.toggle('text-blue-700', active);
    btn.classList.toggle('border-transparent', !active);
    btn.classList.toggle('text-gray-500', !active);
  });

  if (name === 'global') renderGlobal();
  else if (name === 'input') renderInput();
  else renderReport();
}

function renderAll() {
  if (!classes.length) {
    renderEmptyState();
    return;
  }
  renderGlobal();
  renderInput();
  renderReport();
}

function renderEmptyState() {
  $('globalStatus').textContent = '沒有可用班級';
  $('globalKpis').innerHTML = '';
  $('globalClassBody').innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">沒有可用班級</td></tr>';
  $('globalClassFoot').innerHTML = '';
  $('progressBars').innerHTML = '<p class="text-gray-400">沒有資料</p>';
  $('topPendingList').innerHTML = '<p class="text-gray-400">沒有資料</p>';
  $('globalRecentClaims').innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">暫無紀錄</td></tr>';
  $('inputStudentBody').innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">沒有可用班級</td></tr>';
  $('inputRecentClaims').innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">暫無紀錄</td></tr>';
  $('reportSummary').innerHTML = '';
  $('reportContent').innerHTML = '<div class="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400">沒有可用班級</div>';
  $('reportClaimsBody').innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">暫無紀錄</td></tr>';
}

// ---------- Global View ----------

function renderGlobal() {
  if (!config) return;
  const rows = allRows();
  const summary = summarizeRewardRows(rows, config.threshold);
  const threshold = config.threshold;

  $('globalStatus').textContent = `${schoolYear} · 每 ${threshold} 次彌撒 1 個獎勵 · 只計學生 · 資料截至 ${maxDataDate() || '—'}`;

  $('globalKpis').innerHTML = [
    { label: '學生', value: summary.studentCount, unit: '人', color: 'text-gray-800' },
    { label: '彌撒人次', value: summary.massTotal, unit: '次', color: 'text-orange-600' },
    { label: '應得獎勵', value: summary.earnedTotal, unit: '個', color: 'text-blue-700' },
    { label: '已領取', value: summary.claimedTotal, unit: '個', color: 'text-emerald-700' },
    { label: '待領取', value: summary.pendingTotal, unit: '個', color: summary.pendingTotal ? 'text-red-600' : 'text-gray-500' },
    { label: '領取率', value: `${summary.rate}%`, unit: '', color: 'text-purple-700' }
  ].map(c => `
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 px-3 py-3">
      <div class="text-xs text-gray-500">${c.label}</div>
      <div class="kpi-number text-2xl font-bold ${c.color} mt-1">${c.value}<span class="text-xs font-normal text-gray-400 ml-1">${c.unit}</span></div>
    </div>
  `).join('');

  renderGlobalWarnings(rows, summary);
  renderGlobalClassTable(rows);
  renderProgressBars(summary.progressCounts, threshold);
  renderTopPending(rows);
  renderRecentClaims($('globalRecentClaims'), allClaims.slice(0, 10), { showClass: true, showVoid: false });
}

function renderGlobalWarnings(rows, summary) {
  const warnings = [];
  const noMassClasses = classes.filter(cls => {
    const data = classData.get(cls);
    return data && data.rows.length > 0 && data.summary.massTotal === 0;
  });
  if (noMassClasses.length) {
    warnings.push(`以下班級未有彌撒點名資料：${noMassClasses.map(escapeHtml).join('、')}`);
  }
  const overRows = rows.filter(r => r.overClaimed > 0);
  if (overRows.length) {
    warnings.push(`有 ${overRows.length} 位學生已領取多過目前點名應得數，請檢查：${overRows.slice(0, 5).map(r => `${escapeHtml(r.className)} ${escapeHtml(r.studentName)}`).join('、')}${overRows.length > 5 ? '…' : ''}`);
  }
  if (summary.studentCount === 0) {
    warnings.push('目前沒有學生資料。');
  }

  const el = $('globalWarnings');
  if (!warnings.length) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = warnings.map(w => `<div class="flex gap-2"><span>⚠️</span><span>${w}</span></div>`).join('');
}

function renderGlobalClassTable(rows) {
  const body = $('globalClassBody');
  const foot = $('globalClassFoot');

  if (!classes.length) {
    body.innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">沒有班級</td></tr>';
    foot.innerHTML = '';
    return;
  }

  body.innerHTML = classes.map(cls => {
    const data = classData.get(cls);
    if (!data) return '';
    const s = data.summary;
    const massCell = s.massTotal === 0
      ? '<span class="text-red-600 font-bold">無資料</span>'
      : String(s.massTotal);
    return `
      <tr class="border-t border-gray-100 hover:bg-blue-50">
        <td class="px-3 py-2">
          <a href="#" data-action="goto-report" data-class="${escapeAttr(cls)}" class="font-medium text-blue-700 hover:underline">${escapeHtml(cls)}</a>
        </td>
        <td class="px-2 py-2 text-right">${s.studentCount}</td>
        <td class="px-2 py-2 text-right">${massCell}</td>
        <td class="px-2 py-2 text-right">${s.earnedTotal}</td>
        <td class="px-2 py-2 text-right">${s.claimedTotal}</td>
        <td class="px-2 py-2 text-right font-bold ${s.pendingTotal ? 'text-red-600' : 'text-gray-400'}">${s.pendingTotal}</td>
        <td class="px-2 py-2 text-right">${s.rate}%</td>
        <td class="px-2 py-2 whitespace-nowrap text-gray-500">${data.lastRollcallDate || '—'}</td>
      </tr>
    `;
  }).join('');

  const summary = summarizeRewardRows(rows, config.threshold);
  foot.innerHTML = `
    <tr class="border-t-2 border-gray-200">
      <td class="px-3 py-2">合計</td>
      <td class="px-2 py-2 text-right">${summary.studentCount}</td>
      <td class="px-2 py-2 text-right">${summary.massTotal}</td>
      <td class="px-2 py-2 text-right">${summary.earnedTotal}</td>
      <td class="px-2 py-2 text-right">${summary.claimedTotal}</td>
      <td class="px-2 py-2 text-right ${summary.pendingTotal ? 'text-red-600' : 'text-gray-500'}">${summary.pendingTotal}</td>
      <td class="px-2 py-2 text-right">${summary.rate}%</td>
      <td class="px-2 py-2"></td>
    </tr>
  `;
}

function renderProgressBars(counts, threshold) {
  const el = $('progressBars');
  const max = Math.max(1, ...counts);
  el.innerHTML = counts.map((count, idx) => {
    const width = Math.round((count / max) * 100);
    return `
      <div class="flex items-center gap-2">
        <span class="w-12 text-gray-500 text-xs">${idx}/${threshold}</span>
        <div class="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
          <div class="h-4 bg-blue-500 rounded" style="width:${width}%"></div>
        </div>
        <span class="w-10 text-right font-bold">${count}</span>
      </div>
    `;
  }).join('');
}

function renderTopPending(rows) {
  const el = $('topPendingList');
  const list = rows
    .filter(r => r.pending > 0)
    .sort((a, b) => b.pending - a.pending || b.massCount - a.massCount || a.studentName.localeCompare(b.studentName, 'zh-Hant'))
    .slice(0, 10);

  if (!list.length) {
    el.innerHTML = '<p class="text-gray-400">沒有待領取學生</p>';
    return;
  }

  el.innerHTML = list.map(r => `
    <div class="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2">
      <div class="min-w-0">
        <div class="font-medium truncate">${escapeHtml(r.studentName)}</div>
        <div class="text-xs text-gray-400 truncate">${escapeHtml(r.className)} · 彌撒 ${r.massCount} 次 · 進度 ${r.progress}/${r.threshold}</div>
      </div>
      <div class="text-right shrink-0">
        <div class="font-bold text-red-600">${r.pending} 個</div>
        <div class="text-xs text-gray-400">待領</div>
      </div>
    </div>
  `).join('');
}

function renderRecentClaims(tbody, claims, { showClass = true, showVoid = false } = {}) {
  const list = (claims || []).slice().sort((a, b) => String(b.claimedAt || '').localeCompare(String(a.claimedAt || '')));
  if (!list.length) {
    const cols = showVoid ? 6 : 5;
    tbody.innerHTML = `<tr><td colspan="${cols}" class="px-4 py-6 text-center text-gray-400">暫無紀錄</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const cls = showClass ? `<td class="px-3 py-2">${escapeHtml(c.className)}</td>` : '';
    const voidCell = showVoid
      ? `<td class="px-2 py-2 text-center">
           <button data-action="void" data-id="${escapeAttr(c.id)}" data-class="${escapeAttr(c.className)}" data-name="${escapeAttr(c.studentName)}" data-no="${escapeAttr(c.claimNo)}" class="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100">作廢</button>
         </td>`
      : '';
    return `
      <tr class="border-t border-gray-100 hover:bg-gray-50">
        <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(c.claimedAt || '—')}</td>
        ${cls}
        <td class="px-3 py-2">${escapeHtml(c.studentName)}</td>
        <td class="px-2 py-2 text-center whitespace-nowrap">第 ${escapeHtml(c.claimNo)} 個</td>
        <td class="px-3 py-2 text-gray-500">${escapeHtml(c.note || '')}</td>
        ${voidCell}
      </tr>
    `;
  }).join('');
}

// ---------- Input View ----------

function renderInput() {
  if (role.role !== 'admin') {
    $('inputStudentBody').innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">只限管理員輸入</td></tr>';
    return;
  }

  const data = classData.get(inputClass);
  if (!data) {
    $('inputStudentBody').innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">請選擇班級</td></tr>';
    $('inputSummary').textContent = '';
    $('inputRecentClaims').innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">暫無紀錄</td></tr>';
    return;
  }

  const status = $('inputStatusFilter').value;
  const search = $('inputSearch').value;
  const rows = filterRows(data.rows, { status, search });
  const s = data.summary;

  $('inputSummary').textContent = `${inputClass}：${s.studentCount} 人 · 應得 ${s.earnedTotal} · 已領 ${s.claimedTotal} · 待領 ${s.pendingTotal} · 資料截至 ${data.lastRollcallDate || '—'}`;

  if (!rows.length) {
    $('inputStudentBody').innerHTML = '<tr><td colspan="8" class="px-4 py-6 text-center text-gray-400">沒有符合條件的學生</td></tr>';
  } else {
    $('inputStudentBody').innerHTML = rows.map(r => {
      const claimButtonClass = r.pending > 0
        ? 'bg-blue-600 text-white hover:bg-blue-700'
        : 'bg-gray-100 text-gray-500 hover:bg-gray-200';
      return `
        <tr class="border-t border-gray-100 hover:bg-blue-50">
          <td class="px-3 py-2">
            <div class="font-medium">${escapeHtml(r.studentName)}</div>
            <div class="text-xs text-gray-400">${CATEGORY_LABEL[r.category] || escapeHtml(r.category)}</div>
          </td>
          <td class="px-2 py-2 text-right">${r.massCount}</td>
          <td class="px-2 py-2 text-right">${r.earned}</td>
          <td class="px-2 py-2 text-right">${r.claimed}</td>
          <td class="px-2 py-2 text-right font-bold ${r.pending ? 'text-red-600' : 'text-gray-400'}">${r.pending}</td>
          <td class="px-2 py-2 text-center whitespace-nowrap">
            <span class="font-bold ${r.progress === r.threshold - 1 ? 'text-orange-600' : 'text-gray-600'}">${r.progress}/${r.threshold}</span>
            ${r.overClaimed ? `<span class="ml-1 text-xs text-red-600">超額 ${r.overClaimed}</span>` : ''}
          </td>
          <td class="px-2 py-2 text-center text-xs text-gray-500 whitespace-nowrap">多 ${r.toNext} 次<br>（第 ${r.nextMilestone} 次）</td>
          <td class="px-3 py-2 text-center whitespace-nowrap">
            <button data-action="claim" data-class="${escapeAttr(r.className)}" data-name="${escapeAttr(r.studentName)}" class="text-xs px-2 py-1 rounded font-bold ${claimButtonClass}">領取</button>
            <button data-action="batch" data-class="${escapeAttr(r.className)}" data-name="${escapeAttr(r.studentName)}" class="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700 hover:bg-orange-200">補錄</button>
            ${r.claimed ? `<button data-action="history" data-class="${escapeAttr(r.className)}" data-name="${escapeAttr(r.studentName)}" class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">紀錄</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  const recent = allClaims.filter(c => c.className === inputClass).slice(0, 20);
  renderRecentClaims($('inputRecentClaims'), recent, { showClass: false, showVoid: true });
}

// ---------- Claim dialog ----------

function openClaimDialog(mode, className, studentName) {
  if (role.role !== 'admin') {
    setMessage('只限管理員輸入領取紀錄', 'error');
    return;
  }
  const row = rowFor(className, studentName);
  if (!row) {
    setMessage('找不到學生資料，請重新整理', 'error');
    return;
  }

  claimContext = { mode, className, studentName, row };
  $('claimDialogTitle').textContent = mode === 'batch' ? '批次補錄' : '登記領取';
  $('claimStudentInfo').textContent = `${className} · ${studentName} · 彌撒 ${row.massCount} 次 · 應得 ${row.earned} · 已領 ${row.claimed} · 待領 ${row.pending}`;
  $('claimCountWrap').classList.toggle('hidden', mode !== 'batch');
  $('claimCount').value = mode === 'batch' ? Math.max(1, Math.min(20, row.pending || 1)) : 1;
  $('claimDate').value = todayStr();
  $('claimNote').value = '';
  updateClaimPreview();

  if ($('claimDialog').open) $('claimDialog').close();
  $('claimDialog').showModal();
}

function updateClaimPreview() {
  if (!claimContext) return;
  const { mode, row } = claimContext;
  const count = mode === 'batch'
    ? Math.max(1, Math.min(20, Number($('claimCount').value) || 1))
    : 1;
  const claimNos = getNextClaimNos(row.claims.map(c => c.claimNo), count);
  claimContext.claimNos = claimNos;

  $('claimNosPreview').textContent = formatClaimNos(claimNos);
  $('claimConfirm').textContent = claimNos.length > 1 ? `確認登記 ${claimNos.length} 個` : '確認';

  const warning = claimWarning(row, claimNos);
  const el = $('claimWarning');
  if (warning) {
    el.textContent = `⚠️ ${warning}`;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function closeClaimDialog() {
  claimContext = null;
  if ($('claimDialog').open) $('claimDialog').close();
}

async function confirmClaim() {
  if (!claimContext) return;
  const { className, studentName, row, mode } = claimContext;
  const count = mode === 'batch'
    ? Math.max(1, Math.min(20, Number($('claimCount').value) || 1))
    : 1;
  const claimNos = getNextClaimNos(row.claims.map(c => c.claimNo), count);
  const claimedAt = $('claimDate').value || todayStr();
  const note = $('claimNote').value.trim();

  const warning = claimWarning(row, claimNos);
  if (warning && !window.confirm(`${warning}\n\n仍然要登記嗎？`)) return;

  const btn = $('claimConfirm');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '儲存中…';

  try {
    await saveRewardClaims(schoolYear, claimNos.map(claimNo => ({
      className,
      studentName,
      claimNo,
      claimedAt,
      massCountAtClaim: row.massCount,
      note,
      source: mode === 'batch' ? 'import' : 'app'
    })));
    closeClaimDialog();
    setMessage(`已登記：${className} ${studentName} ${formatClaimNos(claimNos)}`, 'success');
    try {
      await reloadClaims();
    } catch (reloadErr) {
      console.error(reloadErr);
      setMessage(`已登記，但重新載入失敗：${reloadErr.message}`, 'error');
    }
  } catch (err) {
    console.error(err);
    setMessage(`登記失敗：${err.message}`, 'error');
    try { await reloadClaims(); } catch (_) { /* ignore */ }
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function handleVoidClaim(el) {
  const id = el.dataset.id;
  const className = el.dataset.class;
  const studentName = el.dataset.name;
  const claimNo = el.dataset.no;
  if (!id) return;
  if (!window.confirm(`確定作廢 ${className} ${studentName} 第 ${claimNo} 個獎勵？\n作廢後可以重新登記。`)) return;

  try {
    await voidRewardClaim(schoolYear, id, '介面作廢');
    setMessage(`已作廢：${className} ${studentName} 第 ${claimNo} 個`, 'success');
    try {
      await reloadClaims();
    } catch (reloadErr) {
      console.error(reloadErr);
      setMessage(`已作廢，但重新載入失敗：${reloadErr.message}`, 'error');
    }
  } catch (err) {
    console.error(err);
    setMessage(`作廢失敗：${err.message}`, 'error');
  }
}

function openHistoryDialog(className, studentName) {
  const row = rowFor(className, studentName);
  if (!row) return;

  $('historyTitle').textContent = '領取紀錄';
  $('historySubtitle').textContent = `${className} · ${studentName} · 彌撒 ${row.massCount} 次 · 應得 ${row.earned} · 已領 ${row.claimed}`;

  if (!row.claims.length) {
    $('historyBody').innerHTML = '<p class="text-sm text-gray-400 text-center py-6">暫無領取紀錄</p>';
  } else {
    $('historyBody').innerHTML = `
      <table class="w-full text-sm border-collapse">
        <thead class="bg-gray-100 text-gray-600">
          <tr>
            <th class="px-3 py-2 text-left">日期</th>
            <th class="px-2 py-2 text-center">獎勵</th>
            <th class="px-2 py-2 text-center">當時彌撒</th>
            <th class="px-3 py-2 text-left">備註</th>
            <th class="px-3 py-2 text-left">輸入者</th>
          </tr>
        </thead>
        <tbody>
          ${row.claims.map(c => `
            <tr class="border-t border-gray-100">
              <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(c.claimedAt || '—')}</td>
              <td class="px-2 py-2 text-center whitespace-nowrap">第 ${escapeHtml(c.claimNo)} 個</td>
              <td class="px-2 py-2 text-center">${escapeHtml(c.massCountAtClaim ?? '—')}</td>
              <td class="px-3 py-2 text-gray-500">${escapeHtml(c.note || '')}</td>
              <td class="px-3 py-2 text-gray-500">${escapeHtml(c.recordedBy || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  if ($('historyDialog').open) $('historyDialog').close();
  $('historyDialog').showModal();
}

// ---------- Report ----------

function getFilteredReportRows() {
  const classFilter = $('reportClassSelect').value || '*';
  const status = $('reportStatusFilter').value;
  const search = $('reportSearch').value;
  const out = [];
  for (const cls of classes) {
    if (classFilter !== '*' && cls !== classFilter) continue;
    const data = classData.get(cls);
    if (!data) continue;
    filterRows(data.rows, { status, search }).forEach(row => out.push({ cls, row }));
  }
  return out;
}

function getFilteredClaims() {
  const classFilter = $('reportClassSelect').value || '*';
  const from = $('reportFrom').value;
  const to = $('reportTo').value;
  const search = String($('reportSearch').value || '').trim().toLowerCase();

  return allClaims.filter(c => {
    if (classFilter !== '*' && c.className !== classFilter) return false;
    if (from && String(c.claimedAt || '') < from) return false;
    if (to && String(c.claimedAt || '') > to) return false;
    if (search && !String(c.studentName || '').toLowerCase().includes(search)) return false;
    return true;
  }).sort((a, b) => {
    const d = String(b.claimedAt || '').localeCompare(String(a.claimedAt || ''));
    if (d) return d;
    return String(a.studentName || '').localeCompare(String(b.studentName || ''), 'zh-Hant');
  });
}

function renderReport() {
  if (!config) return;
  const filtered = getFilteredReportRows();
  const summary = summarizeRewardRows(filtered.map(x => x.row), config.threshold);

  $('reportSummary').innerHTML = [
    { label: '學生', value: summary.studentCount, unit: '人', color: 'text-gray-800' },
    { label: '彌撒人次', value: summary.massTotal, unit: '次', color: 'text-orange-600' },
    { label: '應得獎勵', value: summary.earnedTotal, unit: '個', color: 'text-blue-700' },
    { label: '已領取', value: summary.claimedTotal, unit: '個', color: 'text-emerald-700' },
    { label: '待領取', value: summary.pendingTotal, unit: '個', color: summary.pendingTotal ? 'text-red-600' : 'text-gray-500' },
    { label: '領取率', value: `${summary.rate}%`, unit: '', color: 'text-purple-700' }
  ].map(c => `
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 px-3 py-3">
      <div class="text-xs text-gray-500">${c.label}</div>
      <div class="kpi-number text-2xl font-bold ${c.color} mt-1">${c.value}<span class="text-xs font-normal text-gray-400 ml-1">${c.unit}</span></div>
    </div>
  `).join('');

  const groups = [];
  for (const cls of classes) {
    const rows = filtered.filter(x => x.cls === cls).map(x => x.row);
    if (!rows.length) continue;
    groups.push({ className: cls, rows, summary: summarizeRewardRows(rows, config.threshold) });
  }

  $('reportStatusText').textContent = `${groups.length} 班 · ${filtered.length} 人（篩選後）`;
  $('printMeta').textContent = `${schoolYear} · 每 ${config.threshold} 次彌撒 1 個獎勵 · 計算期間 ${config.startDate} 至 ${config.endDate} · 列印日期 ${todayStr()}`;

  if (!groups.length) {
    $('reportContent').innerHTML = '<div class="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400">沒有符合條件的學生</div>';
  } else {
    $('reportContent').innerHTML = groups.map(group => {
      const s = group.summary;
      return `
        <section class="class-block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-1">
            <h4 class="font-bold text-blue-800">${escapeHtml(group.className)}</h4>
            <span class="text-xs text-gray-500">${s.studentCount} 人 · 彌撒 ${s.massTotal} · 應得 ${s.earnedTotal} · 已領 ${s.claimedTotal} · 待領 ${s.pendingTotal} · 領取率 ${s.rate}%</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead class="bg-gray-50 text-gray-500">
                <tr>
                  <th class="px-2 py-2 text-left w-8">#</th>
                  <th class="px-3 py-2 text-left">姓名</th>
                  <th class="px-2 py-2 text-right">彌撒</th>
                  <th class="px-2 py-2 text-right">應得</th>
                  <th class="px-2 py-2 text-right">已領</th>
                  <th class="px-2 py-2 text-right">待領</th>
                  <th class="px-2 py-2 text-center">進度</th>
                  <th class="px-2 py-2 text-center whitespace-nowrap">下次可領</th>
                  <th class="px-2 py-2 text-left whitespace-nowrap">最後領取</th>
                  <th class="px-2 py-2 text-center no-print">紀錄</th>
                </tr>
              </thead>
              <tbody>
                ${group.rows.map((r, i) => `
                  <tr class="border-t border-gray-100 hover:bg-blue-50">
                    <td class="px-2 py-2 text-gray-400">${i + 1}</td>
                    <td class="px-3 py-2 font-medium">${escapeHtml(r.studentName)}</td>
                    <td class="px-2 py-2 text-right">${r.massCount}</td>
                    <td class="px-2 py-2 text-right">${r.earned}</td>
                    <td class="px-2 py-2 text-right">${r.claimed}</td>
                    <td class="px-2 py-2 text-right font-bold ${r.pending ? 'text-red-600' : 'text-gray-400'}">${r.pending}${r.overClaimed ? ` <span class="text-xs">(超額 ${r.overClaimed})</span>` : ''}</td>
                    <td class="px-2 py-2 text-center">${r.progress}/${r.threshold}</td>
                    <td class="px-2 py-2 text-center text-xs text-gray-500 whitespace-nowrap">多 ${r.toNext} 次<br>（第 ${r.nextMilestone} 次）</td>
                    <td class="px-2 py-2 text-gray-500 whitespace-nowrap">${escapeHtml(r.lastClaimedAt || '—')}</td>
                    <td class="px-2 py-2 text-center no-print">
                      ${r.claims.length ? `<button data-action="history" data-class="${escapeAttr(r.className)}" data-name="${escapeAttr(r.studentName)}" class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">查看</button>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
      `;
    }).join('');
  }

  renderReportClaims();
}

function renderReportClaims() {
  const list = getFilteredClaims();
  $('reportClaimsStatus').textContent = `${list.length} 條`;
  const body = $('reportClaimsBody');

  if (!list.length) {
    body.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">暫無紀錄</td></tr>';
    return;
  }

  body.innerHTML = list.map(c => `
    <tr class="border-t border-gray-100 hover:bg-gray-50">
      <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(c.claimedAt || '—')}</td>
      <td class="px-3 py-2">${escapeHtml(c.className)}</td>
      <td class="px-3 py-2">${escapeHtml(c.studentName)}</td>
      <td class="px-2 py-2 text-center whitespace-nowrap">第 ${escapeHtml(c.claimNo)} 個</td>
      <td class="px-3 py-2 text-gray-500">${escapeHtml(c.note || '')}</td>
      <td class="px-3 py-2 text-gray-500">${escapeHtml(c.recordedBy || '')}</td>
    </tr>
  `).join('');
}

function printReport() {
  switchTab('report');
  setTimeout(() => window.print(), 120);
}

function exportStudentCsv() {
  const list = getFilteredReportRows();
  if (!list.length) {
    setMessage('沒有可匯出的學生資料', 'error');
    return;
  }
  const rows = [
    ['班別', '姓名', '彌撒次數', '應得獎勵', '已領取', '待領取', '進度', '下次獎勵', '最後領取日'],
    ...list.map(({ cls, row }) => [
      cls,
      row.studentName,
      row.massCount,
      row.earned,
      row.claimed,
      row.pending,
      `${row.progress}/${row.threshold}`,
      `多 ${row.toNext} 次（第 ${row.nextMilestone} 次）`,
      row.lastClaimedAt || ''
    ])
  ];
  downloadCsv(`彌撒獎勵_${schoolYear}_${todayStr()}.csv`, rows);
}

function exportClaimsCsv() {
  const list = getFilteredClaims();
  if (!list.length) {
    setMessage('沒有可匯出的領取紀錄', 'error');
    return;
  }
  const rows = [
    ['領取日期', '班別', '姓名', '第幾個獎勵', '當時彌撒次數', '備註', '輸入者'],
    ...list.map(c => [
      c.claimedAt || '',
      c.className || '',
      c.studentName || '',
      c.claimNo || '',
      c.massCountAtClaim ?? '',
      c.note || '',
      c.recordedBy || ''
    ])
  ];
  downloadCsv(`彌撒獎勵紀錄_${schoolYear}_${todayStr()}.csv`, rows);
}

function csvCell(value) {
  const s = String(value == null ? '' : value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, rows) {
  const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setMessage(`已匯出 ${filename}`, 'success');
}
