// js/main-food.js — 活動回覆（admin 全域 / teacher 自己班 / staff 唯讀分類表）
import {
  getFoodEvents, getFoodStats, getFoodShare, getFoodClasses,
  saveFoodEvent, buildFoodForm, cloneFoodEvent, archiveFoodEvent,
  addFoodManual, includeFoodStudent, exportFoodSheet, syncFoodFormText
} from './api.js';
import { onRoleLoaded, logout } from './auth.js';
import { $, escapeHtml, urlParam, setMessage as uiSetMessage } from './ui.js';

const STATUS_LABEL = {
  ok: '已回覆',
  late: '逾期',
  unmatched: '不在名單',
  inactive: '已離校',
  none: '未回覆',
  superseded: '舊版本'
};
const STATUS_CLASS = {
  ok: 'text-emerald-700 bg-emerald-50',
  late: 'text-amber-700 bg-amber-50',
  unmatched: 'text-red-700 bg-red-50',
  inactive: 'text-gray-600 bg-gray-100',
  none: 'text-gray-400 bg-gray-50',
  superseded: 'text-gray-400 bg-gray-50'
};

const TABS = [
  { id: 'overview', label: '總覽', roles: ['admin', 'staff'] },
  { id: 'table', label: '分類表', roles: ['admin', 'teacher', 'staff'] },
  { id: 'missing', label: '未回覆', roles: ['admin', 'teacher'] },
  { id: 'detail', label: '逐筆', roles: ['admin', 'teacher'] },
  { id: 'pending', label: '待處理', roles: ['admin'] },
  { id: 'share', label: '分享', roles: ['admin', 'teacher'] },
  { id: 'settings', label: '設定', roles: ['admin'] }
];

let userRole = 'teacher';
let events = [];
let event = null;
let stats = null;
let share = null;
let shareEventId = '';
let availableSheets = [];
let statsError = '';
let showArchived = false;
let activeTab = '';
let loading = false;

// ---------- helpers ----------

function plainToHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function setMessage(text, type = 'info') {
  uiSetMessage(text, {
    type,
    className: 'no-print max-w-7xl mx-auto px-3 pt-2 text-sm font-medium min-h-[1.5rem]'
  });
}

function fmtTs(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDateCn(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(s);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text || '');
    setMessage('已複製', 'success');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text || '';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); setMessage('已複製', 'success'); }
    catch (err) { setMessage('複製失敗，請長按選取', 'error'); }
    ta.remove();
  }
}

function openWhatsApp(phone, text) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  const intl = digits.startsWith('852') ? digits : '852' + digits;
  const url = digits
    ? `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

// ---------- tabs ----------

function buildTabs() {
  const wrap = $('tabs');
  wrap.innerHTML = '';
  const allowed = TABS.filter(t => t.roles.includes(userRole));
  if (!allowed.length) return;

  allowed.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.tab = t.id;
    btn.className = 'tab-btn text-xs px-3 py-1.5 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100';
    btn.textContent = t.label;
    btn.addEventListener('click', () => switchTab(t.id));
    wrap.appendChild(btn);
  });

  if (!allowed.some(t => t.id === activeTab)) activeTab = allowed[0].id;
}

function switchTab(id) {
  activeTab = id;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  const panel = $('tab-' + id);
  if (panel) panel.classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach(b => {
    const on = b.dataset.tab === id;
    b.className = 'tab-btn text-xs px-3 py-1.5 rounded-md border '
      + (on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100');
  });
}

// ---------- data ----------

async function loadEvents(preferId) {
  const res = await getFoodEvents(showArchived);
  events = res.events || [];
  userRole = res.role || userRole;

  const sel = $('eventSelect');
  sel.innerHTML = '';
  if (!events.length) {
    event = null;
    stats = null;
    share = null;
    $('emptyState').classList.remove('hidden');
    $('emptyText').textContent = userRole === 'admin'
      ? '暫無活動。'
      : '目前沒有適合你的活動。';
    $('emptyCreateBtn').classList.toggle('hidden', userRole !== 'admin');
    $('content').classList.add('hidden');
    return;
  }
  $('emptyState').classList.add('hidden');

  events.forEach(ev => {
    const opt = document.createElement('option');
    opt.value = ev.eventId;
    opt.textContent = `${ev.title || ev.eventId}${ev.status === 'archived' ? '（已封存）' : ''}`;
    sel.appendChild(opt);
  });

  const wanted = preferId || urlParam('event') || (event && event.eventId);
  const pick = events.find(e => e.eventId === wanted)
    || events.find(e => e.status !== 'archived')
    || events[0];
  sel.value = pick.eventId;
  event = pick;
}

async function reload(force = false) {
  if (!event || loading) return;
  if (!events.length) {
    $('content').classList.add('hidden');
    return;
  }
  loading = true;
  window.showLoading('載入統計…');
  statsError = '';
  try {
    const id = event.eventId;
    if (event.hasForm) {
      try {
        stats = await getFoodStats(id, force);
      } catch (err) {
        stats = null;
        statsError = err.message || '未知錯誤';
        setMessage(`讀取統計失敗：${statsError}`, 'error');
      }
      if (userRole !== 'staff' && (!share || shareEventId !== id)) {
        try {
          share = await getFoodShare(id);
          shareEventId = id;
        } catch (err) {
          share = null;
        }
      }
    } else {
      stats = null;
      share = null;
      shareEventId = '';
    }

    render();
    if (!stats && event.hasForm) setMessage(`暫時無法讀取回應表：${statsError || '未知錯誤'}`, 'error');
    else setMessage('');
  } catch (err) {
    console.error(err);
    setMessage(err.message || '載入失敗', 'error');
  } finally {
    loading = false;
    window.hideLoading();
  }
}

// ---------- render ----------

function render() {
  $('content').classList.remove('hidden');

  // 未有表單的草稿：admin 直接入「設定」
  if (!stats && !event.hasForm && userRole === 'admin' && activeTab === 'overview') {
    activeTab = 'settings';
  }

  renderHeader();
  buildTabs();
  switchTab(activeTab);

  if (stats) {
    renderOverview();
    renderTable();
    renderMissing();
    renderDetail();
    renderPending();
  } else {
    renderEmptyStats();
  }

  if (share) renderShare();
  renderSettings();
}

function renderEmptyStats() {
  ['overviewBody', 'overviewFoot', 'tableBody', 'contentBody', 'detailBody', 'missingBody', 'pendingBody'].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = '';
  });
  $('qualityLine').textContent = '此活動尚未建立表單，或暫無回應。';
}

function renderHeader() {
  $('eventTitle').textContent = event.title || event.eventId;
  $('eventMeta').textContent = `活動 ${fmtDateCn(event.date)} ｜ 截止 ${fmtDateCn(event.deadline)}`;

  const statusText = { draft: '草稿', open: '收集中', closed: '已截止', archived: '已封存' }[event.status] || event.status || '';
  const el = $('eventStatus');
  el.textContent = statusText;
  el.className = 'text-xs px-2 py-1 rounded '
    + (event.status === 'open' ? 'bg-emerald-50 text-emerald-700'
      : event.status === 'archived' ? 'bg-gray-200 text-gray-500'
        : 'bg-amber-50 text-amber-700');

  $('printTitle').textContent = `活動回覆 — ${event.title || event.eventId}`;
  $('printSubtitle').textContent = `活動 ${fmtDateCn(event.date)} ｜ 截止 ${fmtDateCn(event.deadline)} ｜ 產生於 ${new Date().toLocaleString('zh-HK')}`;

  if (!stats) {
    ['kpiRoster','kpiResponded','kpiAttending','kpiParents','kpiUnits','kpiPersons'].forEach(id => {
      const el = $(id);
      if (el) el.textContent = '0';
    });
    $('kpiPercent').textContent = '';
    $('progressBar').style.width = '0%';
    return;
  }
  const t = stats.totals || {};
  $('kpiRoster').textContent = t.roster || 0;
  $('kpiResponded').textContent = t.responded || 0;
  const pct = t.roster ? (t.responded / t.roster * 100) : 0;
  $('kpiPercent').textContent = `(${pct.toFixed(1)}%)`;
  $('kpiAttending').textContent = t.attending || 0;
  $('kpiParents').textContent = t.parents || 0;
  $('kpiUnits').textContent = t.shareUnits || 0;
  $('kpiPersons').textContent = t.sharePersons || 0;
  $('progressBar').style.width = `${Math.min(100, pct)}%`;
}

function renderOverview() {
  const body = $('overviewBody');
  const foot = $('overviewFoot');
  body.innerHTML = '';
  foot.innerHTML = '';

  (stats.classes || []).forEach(c => {
    const tr = document.createElement('tr');
    tr.className = 'border-t border-gray-100 hover:bg-blue-50 cursor-pointer';
    tr.innerHTML = `
      <td class="px-3 py-2 font-medium">${escapeHtml(c.name)}</td>
      <td class="px-3 py-2 text-right kpi-number">${c.roster}</td>
      <td class="px-3 py-2 text-right kpi-number">${c.responded}</td>
      <td class="px-3 py-2 text-right kpi-number ${c.missing ? 'text-red-600 font-bold' : 'text-gray-400'}">${c.missing}</td>
      <td class="px-3 py-2 text-right kpi-number">${c.attending}</td>
      <td class="px-3 py-2 text-right kpi-number">${c.parents}</td>
      <td class="px-3 py-2 text-right kpi-number">${c.shareUnits}</td>
      <td class="px-3 py-2 text-right kpi-number">${c.sharePersons}</td>`;
    tr.addEventListener('click', () => {
      if (userRole !== 'admin' && userRole !== 'teacher') return;
      const sel = $('detailClassSelect');
      if (sel) sel.value = c.name;
      switchTab('detail');
      renderDetail();
    });
    body.appendChild(tr);
  });

  const t = stats.totals || {};
  foot.innerHTML = `
    <tr class="border-t-2 border-gray-200">
      <td class="px-3 py-2">合計</td>
      <td class="px-3 py-2 text-right kpi-number">${t.roster || 0}</td>
      <td class="px-3 py-2 text-right kpi-number">${t.responded || 0}</td>
      <td class="px-3 py-2 text-right kpi-number">${t.missing || 0}</td>
      <td class="px-3 py-2 text-right kpi-number">${t.attending || 0}</td>
      <td class="px-3 py-2 text-right kpi-number">${t.parents || 0}</td>
      <td class="px-3 py-2 text-right kpi-number">${t.shareUnits || 0}</td>
      <td class="px-3 py-2 text-right kpi-number">${t.sharePersons || 0}</td>
    </tr>`;

  const q = stats.quality || {};
  const parts = [
    `${q.rows || 0} 行 → ${t.responded || 0} 人`,
    `重複 ${q.duplicates || 0}`,
    `不在名單 ${q.unmatched || 0}`,
    `已離校 ${q.inactive || 0}`,
    `逾期 ${q.late || 0}`
  ];
  $('qualityLine').textContent = '資料檢查：' + parts.join(' ｜ ');
}

function renderTable() {
  const classes = (stats.classes || []).map(c => c.name);
  const head = $('tableHead');
  head.innerHTML = '<th class="px-3 py-2 text-left">分類</th>'
    + classes.map(c => `<th class="px-3 py-2 text-right">${escapeHtml(c)}</th>`).join('')
    + '<th class="px-3 py-2 text-right">合計單位</th><th class="px-3 py-2 text-right">約人份</th>';

  const body = $('tableBody');
  body.innerHTML = '';
  const rows = stats.table || [];

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'border-t border-gray-100';
    const clsCells = classes.map(c => {
      const v = (r.classes && r.classes[c]) || 0;
      return `<td class="px-3 py-2 text-right kpi-number ${v ? '' : 'text-gray-300'}">${v || '—'}</td>`;
    }).join('');
    tr.innerHTML = `<td class="px-3 py-2 font-medium">${escapeHtml(r.category)}</td>${clsCells}
      <td class="px-3 py-2 text-right kpi-number font-bold">${r.units}</td>
      <td class="px-3 py-2 text-right kpi-number">${r.persons}</td>`;
    body.appendChild(tr);
  });

  const totalUnits = (stats.totals && stats.totals.shareUnits) || 0;
  const totalPersons = (stats.totals && stats.totals.sharePersons) || 0;
  const tr = document.createElement('tr');
  tr.className = 'border-t-2 border-gray-200 bg-gray-50 font-bold';
  tr.innerHTML = '<td class="px-3 py-2">合計</td>'
    + classes.map(c => {
      const sum = rows.reduce((s, r) => s + ((r.classes && r.classes[c]) || 0), 0);
      return `<td class="px-3 py-2 text-right kpi-number">${sum}</td>`;
    }).join('')
    + `<td class="px-3 py-2 text-right kpi-number">${totalUnits}</td>
       <td class="px-3 py-2 text-right kpi-number">${totalPersons}</td>`;
  body.appendChild(tr);

  // 食物內容明細
  const contentHead = $('contentHead');
  const contentBody = $('contentBody');
  if (contentHead && contentBody) {
    contentHead.innerHTML = '<th class="px-3 py-2 text-left">分類</th>'
      + '<th class="px-3 py-2 text-left">食物內容</th>'
      + '<th class="px-3 py-2 text-right">單位</th>'
      + '<th class="px-3 py-2 text-right">約人份</th>'
      + '<th class="px-3 py-2 text-left">班別</th>';
    const contents = stats.contents || [];
    contentBody.innerHTML = contents.length
      ? contents.map(t => {
        const cls = Object.keys(t.classes || {})
          .map(k => `${escapeHtml(k)} ${t.classes[k]}`).join('、');
        return `<tr class="border-t border-gray-100">
          <td class="px-3 py-2">${escapeHtml(t.category)}</td>
          <td class="px-3 py-2 font-medium">${escapeHtml(t.content)}</td>
          <td class="px-3 py-2 text-right kpi-number">${t.units}</td>
          <td class="px-3 py-2 text-right kpi-number">${t.persons}</td>
          <td class="px-3 py-2 text-gray-600">${cls}</td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="5" class="px-3 py-6 text-center text-gray-400">暫無分享食物</td></tr>';
  }
}

function missingByClass() {
  return (stats.classes || []).filter(c => (c.missingNames || []).length);
}

function renderMissing() {
  const wrap = $('missingBody');
  wrap.innerHTML = '';
  const groups = missingByClass();

  if (!groups.length) {
    wrap.innerHTML = '<div class="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">全部已回覆。</div>';
  } else {
    groups.forEach(c => {
      const div = document.createElement('div');
      div.className = 'bg-white rounded-xl shadow-sm border border-gray-200 p-4';
      div.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div class="font-bold">${escapeHtml(c.name)} <span class="text-red-600">${c.missingNames.length}</span> 位未回覆</div>
          <div class="no-print flex gap-2">
            <button class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" data-act="copy-missing" data-class="${escapeHtml(c.name)}">複製</button>
            <button class="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="chase" data-class="${escapeHtml(c.name)}">提醒提交</button>
          </div>
        </div>
        <p class="text-sm text-gray-700 break-words">${c.missingNames.map(escapeHtml).join('、')}</p>`;
      wrap.appendChild(div);
    });
  }

  const q = stats.quality || {};
  const hint = $('unmatchedHint');
  if (q.unmatched) {
    hint.classList.remove('hidden');
    hint.textContent = `有 ${q.unmatched} 筆提交「不在名單中」，已轉交管理員處理（不視為未回覆）。`;
  } else {
    hint.classList.add('hidden');
  }

  wrap.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cls = btn.dataset.class;
      const c = (stats.classes || []).find(x => x.name === cls);
      if (!c) return;
      if (btn.dataset.act === 'copy-missing') {
        copyText(c.missingNames.join('、'));
      } else {
        chaseClass(c);
      }
    });
  });
}

function chaseClass(c) {
  const link = (event.classLinks && event.classLinks[c.name]) || '';
  const text = [
    `【${event.title || ''}｜${c.name}】`,
    '',
    `尚有 ${c.missingNames.length} 位同學未提交：${c.missingNames.join('、')}`,
    link,
    '',
    `截止：${fmtDateCn(event.deadline)}`
  ].join('\n');
  openWhatsApp('', text);
}

function renderDetail() {
  const sel = $('detailClassSelect');
  const classes = (stats.classes || []).map(c => c.name);
  const prev = sel.value;
  sel.innerHTML = classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (classes.includes(prev)) sel.value = prev;
  else if (classes.length) sel.value = classes[0];

  const cls = (stats.classes || []).find(c => c.name === sel.value);
  const body = $('detailBody');
  body.innerHTML = '';
  if (!cls) return;

  const showOld = $('showSuperseded').checked;
  const onlyCurrent = cls.students.filter(s => s.status !== 'none');
  if (!onlyCurrent.length) {
    body.innerHTML = '<tr><td colspan="12" class="px-3 py-6 text-center text-gray-400">未有回覆</td></tr>';
  }

  onlyCurrent.forEach(s => {
    const status = s.status || 'ok';
    const tr = document.createElement('tr');
    tr.className = 'border-t border-gray-100';
    const edited = (s.edited || 1) > 1 ? `×${s.edited}` : '';
    const action = (userRole === 'admin' && status === 'late')
      ? `<button class="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200" data-act="include" data-name="${escapeHtml(s.name)}">計入</button>`
      : '';
    tr.innerHTML = `
      <td class="px-3 py-2 font-medium">${escapeHtml(s.name)}</td>
      <td class="px-3 py-2"><span class="text-[11px] px-1.5 py-0.5 rounded ${STATUS_CLASS[status] || ''}">${STATUS_LABEL[status] || status}</span></td>
      <td class="px-3 py-2">${escapeHtml(s.attend || '')}</td>
      <td class="px-3 py-2">${escapeHtml(s.plan || '')}</td>
      <td class="px-3 py-2">${escapeHtml(s.category || '')}</td>
      <td class="px-3 py-2">${escapeHtml(s.content || '')}</td>
      <td class="px-3 py-2 text-right kpi-number">${s.units || ''}</td>
      <td class="px-3 py-2 text-right kpi-number">${s.parents || 0}</td>
      <td class="px-3 py-2 text-right text-gray-500">${edited}</td>
      <td class="px-3 py-2 whitespace-nowrap text-gray-500">${escapeHtml(fmtTs(s.ts))}</td>
      <td class="px-3 py-2 text-gray-600 max-w-[16rem] truncate" title="${escapeHtml(s.note || '')}">${escapeHtml(s.note || '')}</td>
      <td class="px-3 py-2 text-center no-print">${action}</td>`;
    body.appendChild(tr);
  });

  if (showOld && stats.rows) {
    const oldRows = stats.rows.filter(r => r.cls === cls.name && !r.isLatest);
    oldRows.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'border-t border-gray-100 bg-gray-50 text-gray-400';
      tr.innerHTML = `
        <td class="px-3 py-2">${escapeHtml(r.name)}</td>
        <td class="px-3 py-2"><span class="text-[11px] px-1.5 py-0.5 rounded bg-gray-100">舊版本</span></td>
        <td class="px-3 py-2">${escapeHtml(r.attend || '')}</td>
        <td class="px-3 py-2">${escapeHtml(r.plan || '')}</td>
        <td class="px-3 py-2">${escapeHtml(r.category || '')}</td>
        <td class="px-3 py-2">${escapeHtml(r.content || '')}</td>
        <td class="px-3 py-2 text-right">${r.units || ''}</td>
        <td class="px-3 py-2 text-right">${r.parents || 0}</td>
        <td class="px-3 py-2 text-right"></td>
        <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(fmtTs(r.ts))}</td>
        <td class="px-3 py-2">${escapeHtml(r.note || '')}</td>
        <td class="px-3 py-2"></td>`;
      body.appendChild(tr);
    });
  }

  body.querySelectorAll('button[data-act="include"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`將 ${btn.dataset.name} 的最新回覆計入統計？`)) return;
      btn.disabled = true;
      try {
        await includeFoodStudent(event.eventId, cls.name, btn.dataset.name);
        setMessage('已計入', 'success');
        await reload(true);
      } catch (err) {
        setMessage(`計入失敗：${err.message}`, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderPending() {
  const wrap = $('pendingBody');
  wrap.innerHTML = '';

  const late = [];
  (stats.classes || []).forEach(c => {
    (c.students || []).forEach(s => {
      if (s.status === 'late') late.push({ cls: c.name, name: s.name, ts: s.ts, plan: s.plan, units: s.units });
    });
  });

  const blocks = [
    { title: '姓名不在名單中', desc: '家長選了「我的子女不在名單中」，請核對後補錄。', rows: (stats.unmatched || []).map(r => ({
      cls: r.cls, name: r.name, note: r.note, ts: r.ts
    })) },
    { title: '已離校／已轉班', desc: '提交時在名單，現在名單已無此人。', rows: (stats.inactive || []).map(r => ({
      cls: r.cls, name: r.name, note: '', ts: r.ts
    })) },
    { title: '逾期提交', desc: '預設不計入；可按「計入」納入統計。', rows: late }
  ];

  blocks.forEach(b => {
    const div = document.createElement('div');
    div.className = 'bg-white rounded-xl shadow-sm border border-gray-200 p-4';
    let html = `<div class="font-bold mb-1">${b.title} <span class="text-gray-400 text-sm">${b.rows.length}</span></div>
      <p class="text-xs text-gray-500 mb-3">${b.desc}</p>`;
    if (!b.rows.length) {
      html += '<p class="text-sm text-gray-400">無</p>';
    } else {
      html += '<div class="space-y-2">' + b.rows.map(r => `
        <div class="flex flex-wrap items-center gap-2 text-sm border border-gray-100 rounded-lg px-3 py-2">
          <span class="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">${escapeHtml(r.cls || '—')}</span>
          <span class="font-medium">${escapeHtml(r.name || '—')}</span>
          <span class="text-gray-400 text-xs">${escapeHtml(fmtTs(r.ts))}</span>
          ${r.note ? `<span class="text-gray-600 text-xs">備註：${escapeHtml(r.note)}</span>` : ''}
          ${b.title === '逾期提交' ? `<button class="ml-auto text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200" data-act="include-late" data-cls="${escapeHtml(r.cls)}" data-name="${escapeHtml(r.name)}">計入</button>` : ''}
          ${b.title === '姓名不在名單中' ? `<button class="ml-auto text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200" data-act="manual" data-cls="${escapeHtml(r.cls)}" data-name="${escapeHtml(r.name)}" data-note="${escapeHtml(r.note || '')}">前往補錄</button>` : ''}
        </div>`).join('') + '</div>';
    }
    div.innerHTML = html;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll('button[data-act="include-late"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await includeFoodStudent(event.eventId, btn.dataset.cls, btn.dataset.name);
        setMessage('已計入', 'success');
        await reload(true);
      } catch (err) {
        setMessage(`計入失敗：${err.message}`, 'error');
        btn.disabled = false;
      }
    });
  });

  wrap.querySelectorAll('button[data-act="manual"]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab('settings');
      const manClass = $('manClass');
      if (manClass) {
        manClass.value = btn.dataset.cls || '';
        fillManualNames();
      }
      const note = $('manNote');
      if (note && !note.value) note.value = btn.dataset.note || '';
    });
  });
}

function renderShare() {
  if (!share) return;
  $('noticeText').textContent = share.notice || '';
  const list = $('shareList');
  list.innerHTML = '';

  (share.perClass || []).forEach(item => {
    const div = document.createElement('div');
    div.className = 'border border-gray-100 rounded-lg p-3';
    const qrUrl = item.link
      ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(item.link)}`
      : '';
    div.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div class="font-bold">${escapeHtml(item.class)}</div>
        <div class="no-print flex flex-wrap gap-2">
          <button class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" data-act="copy">複製訊息</button>
          <button class="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700" data-act="wa">WhatsApp 群</button>
          <button class="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" data-act="qr">QR</button>
          ${userRole === 'admin' ? `
          <input class="text-xs border border-gray-300 rounded px-2 py-1 w-32" data-phone placeholder="老師電話 8 位" inputmode="numeric">
          <button class="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100" data-act="wa-teacher">發給老師</button>` : ''}
        </div>
      </div>
      <pre class="whitespace-pre-wrap text-sm bg-gray-50 border border-gray-100 rounded-lg p-3 mb-2">${escapeHtml(item.text)}</pre>
      <div class="text-xs text-gray-500 break-all">${escapeHtml(item.link || '（未建立表單）')}</div>
      <div class="mt-2 hidden" data-qr>${qrUrl ? `<img src="${qrUrl}" alt="QR" class="w-44 h-44 border border-gray-200 rounded">` : ''}</div>`;

    div.querySelector('[data-act="copy"]').addEventListener('click', () => copyText(item.text));
    div.querySelector('[data-act="wa"]').addEventListener('click', () => openWhatsApp('', item.text));
    const waTeacher = div.querySelector('[data-act="wa-teacher"]');
    if (waTeacher) {
      waTeacher.addEventListener('click', () => {
        const phone = div.querySelector('[data-phone]').value.trim();
        if (!phone) {
          setMessage('請先輸入老師的電話號碼', 'error');
          return;
        }
        openWhatsApp(phone, item.text);
      });
    }
    div.querySelector('[data-act="qr"]').addEventListener('click', () => {
      const q = div.querySelector('[data-qr]');
      if (q) q.classList.toggle('hidden');
    });

    list.appendChild(div);
  });
}

function renderFormTextEditor() {
  const wrap = $('formTextEditor');
  if (!wrap) return;

  const t = event.formText || {};
  const q = t.questions || {};
  const pages = t.pages || {};

  const rows = [
    { key: 'name', label: '姓名', note: '選項自動用該班學生名單' },
    { key: 'attend', label: '出席', choices: true, note: '「不出席」會跳過其餘題目直接提交，請保留「不出席」字樣' },
    { key: 'plan', label: '食物安排', choices: true, note: '「多帶」選項會跳去分享頁，請保留「多帶」字樣' },
    { key: 'category', label: '食品分類', list: 'categories', note: '這些選項亦會用於統計' },
    { key: 'content', label: '食物內容', note: '短答' },
    { key: 'units', label: '份量', list: 'shareUnits', note: '只填數字（人份），例如 5, 10, 15, 20' },
    { key: 'parents', label: '家長人數', choices: true },
    { key: 'note', label: '備註', note: '短答' }
  ];

  const rowHtml = rows.map(r => {
    const item = q[r.key] || {};
    const choices = Array.isArray(item.choices) ? item.choices.join(', ') : '';
    const listValue = r.list === 'categories'
      ? (event.categories || []).join(', ')
      : (r.list === 'shareUnits' ? (event.shareUnits || []).join(', ') : '');
    return `
      <div class="border border-gray-100 rounded-lg p-3">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <span class="text-xs font-medium text-gray-500 w-16 shrink-0">${escapeHtml(r.label)}</span>
          <input data-q="${r.key}" data-f="title" value="${escapeHtml(item.title || '')}"
            class="flex-1 min-w-[12rem] border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="題目標題">
        </div>
        <input data-q="${r.key}" data-f="help" value="${escapeHtml(item.help || '')}"
          class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-2" placeholder="說明文字（可留空）">
        ${r.list ? `
          <input data-list="${r.list}" value="${escapeHtml(listValue)}"
            class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="選項，用逗號分隔">
        ` : ''}
        ${r.choices ? `
          <input data-q="${r.key}" data-f="choices" value="${escapeHtml(choices)}"
            class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="選項，用逗號分隔">
        ` : ''}
        ${r.note ? `<p class="text-[11px] text-gray-500 mt-1">${escapeHtml(r.note)}</p>` : ''}
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="grid gap-3">
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">確認訊息</label>
        <input data-ft="confirmation" value="${escapeHtml(t.confirmation || '')}"
          class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
      </div>
      <div class="grid sm:grid-cols-3 gap-3">
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">第 2 頁標題（食物安排）</label>
          <input data-ft="pages.plan" value="${escapeHtml(pages.plan || '')}"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">第 3 頁標題（分享食物）</label>
          <input data-ft="pages.share" value="${escapeHtml(pages.share || '')}"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">第 4 頁標題（家長及備註）</label>
          <input data-ft="pages.other" value="${escapeHtml(pages.other || '')}"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
        </div>
      </div>
      <div class="space-y-2">${rowHtml}</div>
    </div>`;
}

function collectFormText() {
  const formText = { confirmation: '', pages: { plan: '', share: '', other: '' }, questions: {} };
  const lists = { categories: [], shareUnits: [] };

  document.querySelectorAll('[data-ft]').forEach(el => {
    const key = el.dataset.ft;
    if (key.indexOf('pages.') === 0) formText.pages[key.slice(6)] = el.value;
    else formText[key] = el.value;
  });

  document.querySelectorAll('[data-list]').forEach(el => {
    const raw = el.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (el.dataset.list === 'categories') lists.categories = raw;
    if (el.dataset.list === 'shareUnits') {
      lists.shareUnits = raw.map(Number).filter(n => n > 0);
    }
  });

  document.querySelectorAll('[data-q]').forEach(el => {
    const key = el.dataset.q;
    const field = el.dataset.f;
    formText.questions[key] = formText.questions[key] || {};

    if (field === 'choices') {
      const arr = el.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      if (arr.length) formText.questions[key].choices = arr;
    } else {
      formText.questions[key][field] = el.value;
    }
  });

  return { formText: formText, categories: lists.categories, shareUnits: lists.shareUnits };
}

function toDateInput(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return '';
}

function renderSettings() {
  if (userRole !== 'admin') return;
  $('setTitle').value = event.title || '';
  $('setDate').value = toDateInput(event.date);
  $('setDeadline').value = toDateInput(event.deadline);
  const introEl = $('setIntro');
  introEl.innerHTML = event.formIntroHtml || plainToHtml(event.formIntro || '');
  $('setAliases').value = Object.keys(event.classAliases || {})
    .map(sheet => `${sheet}=${event.classAliases[sheet]}`)
    .join('\n');
  $('aliasHint').textContent = availableSheets.length
    ? `試算表分頁：${availableSheets.join('、')}`
    : '';
  $('setMsgNotice').value = event.shareMessageNotice || '';
  $('setMsgLink').value = event.shareMessageLink || '';
  renderFormTextEditor();

  const hint = $('buildHint');
  hint.textContent = event.hasForm
    ? '此活動已有表單；如要重做，請先「封存」再「複製成新活動」。'
    : '尚未建立表單。按「建立表單」會即時讀取學生名單，產生表單、回應表及每班連結。班別別名僅於建立表單時套用，建立後不可修改。';
  $('buildFormBtn').disabled = !!event.hasForm;

  // 分類 dropdown
  const cats = event.categories || [];
  $('manCategory').innerHTML = cats.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  // 食物安排 dropdown（跟表單設定的選項）
  const planChoices = (event.formText && event.formText.questions && event.formText.questions.plan
    && event.formText.questions.plan.choices) || ['不會，需學校準備', '會，只夠自己', '會，多帶分享'];
  const prevPlan = $('manPlan').value;
  $('manPlan').innerHTML = planChoices.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  if (planChoices.includes(prevPlan)) $('manPlan').value = prevPlan;

  // 班別 dropdown
  const classNames = (stats && stats.classes ? stats.classes.map(c => c.name) : event.classNames) || [];
  const prevClass = $('manClass').value;
  $('manClass').innerHTML = classNames.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (classNames.includes(prevClass)) $('manClass').value = prevClass;
  fillManualNames();
}

function fillManualNames() {
  const cls = $('manClass').value;
  const c = stats && (stats.classes || []).find(x => x.name === cls);
  const names = c ? c.students.map(s => s.name) : [];
  const prev = $('manName').value;
  $('manName').innerHTML = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (names.includes(prev)) $('manName').value = prev;
}

// ---------- actions ----------

function parseAliases(text) {
  const out = {};
  String(text || '').split(/\r?\n/).forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const i = t.indexOf('=');
    if (i < 1) return;
    const sheet = t.slice(0, i).trim();
    const display = t.slice(i + 1).trim();
    if (sheet && display) out[sheet] = display;
  });
  return out;
}

async function onSaveEvent() {
  if (!event) return false;

  const collected = collectFormText();

  const payload = {
    eventId: event.eventId,
    title: ($('setTitle').value || event.title || '').trim(),
    date: $('setDate').value || toDateInput(event.date),
    deadline: $('setDeadline').value || toDateInput(event.deadline),
    formIntro: $('setIntro').innerText,
    formIntroHtml: $('setIntro').innerHTML,
    shareMessageNotice: $('setMsgNotice').value,
    shareMessageLink: $('setMsgLink').value,
    classAliases: parseAliases($('setAliases').value),
    formText: collected.formText
  };
  if (collected.categories.length) payload.categories = collected.categories;
  if (collected.shareUnits.length) payload.shareUnits = collected.shareUnits;

  if (!payload.title || !payload.date || !payload.deadline) {
    const missing = [];
    if (!payload.title) missing.push('活動名稱');
    if (!payload.date) missing.push('活動日期');
    if (!payload.deadline) missing.push('截止日期');
    setMessage(`請填：${missing.join('、')}`, 'error');
    return false;
  }
  const btn = $('saveEventBtn');
  btn.disabled = true;
  window.showLoading('儲存設定…');
  let syncCount = null;
  let syncError = '';
  try {
    event = await saveFoodEvent(payload);
    share = null;
    shareEventId = '';

    // 有表單就順手同步 9 張，唔需要再按多一次
    if (event.hasForm) {
      try {
        const out = await syncFoodFormText(event.eventId);
        syncCount = out.updated;
        if (out.failed && out.failed.length) {
          syncError = out.failed.length + ' 張失敗：'
            + out.failed.map(function (f) { return f.class + '（' + f.error + '）'; }).join('、');
        }
        if (!syncError && out.missing && out.missing.length) {
          syncError = '缺少 formIds：' + out.missing.join('、');
        }
      } catch (err) {
        syncError = err.message || '未知錯誤';
      }
    }

    if (syncError) setMessage(`設定已儲存，但同步表單未完成：${syncError}`, 'error');
    else if (syncCount === null) setMessage('設定已儲存', 'success');
    else setMessage(`設定已儲存，並同步 ${syncCount} 張 Form`, 'success');

    await loadEvents(event.eventId);
    await reload(true);
    return true;
  } catch (err) {
    setMessage(`儲存失敗：${err.message}`, 'error');
    return false;
  } finally {
    btn.disabled = false;
    window.hideLoading();
  }
}

async function onSyncFormText() {
  if (!event) return;
  if (!confirm('儲存目前設定，並同步到 9 張現有 Form？\n連結及已收回應不會改變。')) return;

  // onSaveEvent 會自動同步，呢度唔再重複呼叫
  await onSaveEvent();
}

async function onBuildForm() {
  if (!event) return;
  if (!confirm(`為「${event.title}」建立 Google 表單？\n會產生新表單、新回應表及每班連結。`)) return;
  const btn = $('buildFormBtn');
  btn.disabled = true;
  setMessage('建立中，請稍候…');
  window.showLoading('建立表單中，請稍候…');
  try {
    const out = await buildFoodForm(event.eventId);
    setMessage(`已建立 ${(out.classNames || []).length} 張表單，請到「分享」查看每班連結`, 'success');
    await loadEvents(event.eventId);
    await reload(true);
    switchTab('share');
  } catch (err) {
    setMessage(`建立失敗：${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    window.hideLoading();
  }
}

async function onManualSave() {
  const cls = $('manClass').value;
  const name = $('manName').value;
  if (!cls || !name) {
    setMessage('請先選擇班別及姓名', 'error');
    return;
  }
  const plan = $('manPlan').value;
  const isShare = String(plan).indexOf('多帶') > -1;
  const units = isShare ? Number($('manUnits').value) || 0 : 0;
  const btn = $('manualBtn');
  btn.disabled = true;
  window.showLoading('儲存補錄…');
  try {
    await addFoodManual(event.eventId, {
      cls,
      name,
      attend: $('manAttend').value,
      plan,
      category: isShare ? $('manCategory').value : '',
      content: isShare ? $('manContent').value.trim() : '',
      units,
      parents: Number($('manParents').value) || 0,
      note: $('manNote').value
    });
    setMessage('已補錄', 'success');
    $('manNote').value = '';
    await reload(true);
  } catch (err) {
    setMessage(`補錄失敗：${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    window.hideLoading();
  }
}

async function onClone() {
  if (!confirm('複製此活動的設定成新活動？（不會複製表單及回應）')) return;
  window.showLoading('複製活動…');
  try {
    const ev = await cloneFoodEvent(event.eventId);
    await loadEvents(ev.eventId);
    await reload(true);
    setMessage('已建立新活動，請檢查標題／日期後儲存', 'success');
    switchTab('settings');
  } catch (err) {
    setMessage(`複製失敗：${err.message}`, 'error');
  } finally {
    window.hideLoading();
  }
}

async function onNew() {
  const today = new Date().toISOString().slice(0, 10);
  window.showLoading('建立活動…');
  try {
    const ev = await saveFoodEvent({
      title: '新活動',
      date: today,
      deadline: today,
      formIntro: '',
      shareMessageNotice: '',
      shareMessageLink: ''
    });
    await loadEvents(ev.eventId);
    await reload(true);
    setMessage('已建立新活動', 'success');
    switchTab('settings');
  } catch (err) {
    setMessage(`建立失敗：${err.message}`, 'error');
  } finally {
    window.hideLoading();
  }
}

async function onArchive() {
  if (!confirm('封存此活動？資料會保留，但不會再出現在預設列表。')) return;
  window.showLoading('封存中…');
  try {
    await archiveFoodEvent(event.eventId);
    setMessage('已封存', 'success');
    await loadEvents();
    await reload(true);
  } catch (err) {
    setMessage(`封存失敗：${err.message}`, 'error');
  } finally {
    window.hideLoading();
  }
}

async function onExport() {
  window.showLoading('匯出中…');
  try {
    setMessage('匯出中…');
    await exportFoodSheet(event.eventId);
    setMessage('已寫入回應試算表的 _normalized / _food_table / _food_detail', 'success');
  } catch (err) {
    setMessage(`匯出失敗：${err.message}`, 'error');
  } finally {
    window.hideLoading();
  }
}

// ---------- init ----------

function bindEvents() {
  $('eventSelect').addEventListener('change', async (e) => {
    const id = e.target.value;
    const found = events.find(x => x.eventId === id);
    if (found) event = found;
    activeTab = 'overview';
    await reload(true);
  });

  $('refreshBtn').addEventListener('click', () => reload(true));
  $('showArchived').addEventListener('change', async (e) => {
    showArchived = e.target.checked;
    window.showLoading('載入活動…');
    try {
      await loadEvents();
      await reload(true);
    } finally {
      window.hideLoading();
    }
  });
  $('emptyCreateBtn').addEventListener('click', onNew);
  $('printBtn').addEventListener('click', () => window.print());
  $('logoutBtn').addEventListener('click', () => logout());

  $('copyMissingBtn').addEventListener('click', () => {
    const groups = missingByClass();
    copyText(groups.map(c => `${c.name}：${c.missingNames.join('、')}`).join('\n'));
  });
  $('chaseBtn').addEventListener('click', () => {
    const groups = missingByClass();
    if (groups.length) chaseClass(groups[0]);
  });

  $('detailClassSelect').addEventListener('change', renderDetail);
  $('showSuperseded').addEventListener('change', renderDetail);
  $('manClass').addEventListener('change', fillManualNames);

  document.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.execCommand(btn.dataset.cmd, false, null);
      const el = $('setIntro');
      if (el) el.focus();
    });
  });

  $('saveEventBtn').addEventListener('click', onSaveEvent);
  $('syncFormTextBtn').addEventListener('click', onSyncFormText);
  $('buildFormBtn').addEventListener('click', onBuildForm);
  $('manualBtn').addEventListener('click', onManualSave);
  $('cloneBtn').addEventListener('click', onClone);
  $('newBtn').addEventListener('click', onNew);
  $('archiveBtn').addEventListener('click', onArchive);
  $('exportBtn').addEventListener('click', onExport);

  $('copyNoticeBtn').addEventListener('click', () => copyText($('noticeText').textContent));
  $('waNoticeBtn').addEventListener('click', () => openWhatsApp('', $('noticeText').textContent));
}

onRoleLoaded(async (role) => {
  userRole = (role && role.role) || 'teacher';
  activeTab = 'overview';
  $('showArchivedWrap').classList.toggle('hidden', userRole !== 'admin');
  bindEvents();
  window.showLoading('載入活動…');
  try {
    if (userRole === 'admin') {
      try { availableSheets = await getFoodClasses(); }
      catch (e) { availableSheets = []; }
    }
    await loadEvents();
    if (event) await reload();
  } catch (err) {
    console.error(err);
    setMessage(err.message || '載入失敗', 'error');
  } finally {
    window.hideLoading();
  }
});
