// js/main-notices.js — 公告 / 檔案板
// 全部教職員可睇；admin 先可新增/編輯/刪除/置頂。
import { getNotices, saveNotice, deleteNotice, setNoticePinned } from './data.js';
import { onRoleLoaded, logout } from './auth.js';

const CATEGORY_STYLE = {
  '公告': 'bg-blue-50 text-blue-700',
  '檔案': 'bg-green-50 text-green-700',
  '活動': 'bg-purple-50 text-purple-700'
};

const $ = (id) => document.getElementById(id);

let isAdmin = false;
let notices = [];
let filter = 'all';
let editId = null;

function setMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text || '';
  el.className = `text-center text-sm font-medium min-h-[1.25rem] ${isError ? 'text-red-600' : 'text-green-600'}`;
}

function shortDate(dateStr) {
  const [, m, d] = String(dateStr || '').split('-');
  return m && d ? `${Number(m)}/${Number(d)}` : dateStr || '';
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function init(role) {
  isAdmin = role && role.role === 'admin';

  $('logoutBtn').addEventListener('click', () => logout());
  $('showFormBtn').addEventListener('click', () => openForm());
  $('cancelBtn').addEventListener('click', closeForm);
  $('saveBtn').addEventListener('click', save);

  document.querySelectorAll('.filterBtn').forEach(b => {
    b.addEventListener('click', () => setFilter(b.dataset.filter));
  });

  if (isAdmin) $('showFormBtn').classList.remove('hidden');

  load();
}

async function load() {
  setMessage('載入中...');
  try {
    notices = await getNotices();
    render();
    setMessage('');
  } catch (err) {
    setMessage(`載入失敗：${err.message}`, true);
  }
}

function setFilter(f) {
  filter = f;
  document.querySelectorAll('.filterBtn').forEach(b => {
    const active = b.dataset.filter === f;
    b.className = `px-3 py-1.5 rounded-md text-sm font-bold ${active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`;
  });
  render();
}

function render() {
  const body = $('noticesBody');
  const list = filter === 'all' ? notices : notices.filter(n => n.category === filter);
  body.innerHTML = '';
  if (!list.length) {
    body.innerHTML = '<div class="text-sm text-gray-400 text-center py-8">未有任何公告／檔案</div>';
    return;
  }
  list.forEach(n => body.appendChild(buildCard(n)));
}

function buildCard(n) {
  const card = document.createElement('div');
  card.className = 'bg-white rounded-xl shadow-md p-4 border border-gray-100';

  const head = document.createElement('div');
  head.className = 'flex items-center gap-2 mb-1';
  if (n.pinned) {
    const pin = document.createElement('span');
    pin.className = 'text-xs font-bold text-orange-600';
    pin.textContent = '📌 置頂';
    head.appendChild(pin);
  }
  const cat = document.createElement('span');
  cat.className = 'text-xs font-bold px-2 py-0.5 rounded ' + (CATEGORY_STYLE[n.category] || 'bg-gray-100 text-gray-600');
  cat.textContent = n.category || '公告';
  head.appendChild(cat);
  const spacer = document.createElement('div');
  spacer.className = 'flex-1';
  head.appendChild(spacer);
  const date = document.createElement('span');
  date.className = 'text-xs text-gray-400';
  date.textContent = shortDate(n.date);
  head.appendChild(date);
  card.appendChild(head);

  const title = document.createElement('div');
  title.className = 'font-bold text-base';
  title.textContent = n.title;
  card.appendChild(title);

  if (n.body) {
    const body = document.createElement('div');
    body.className = 'text-sm text-gray-600 mt-1 whitespace-pre-wrap';
    body.textContent = n.body;
    card.appendChild(body);
  }

  if (n.link) {
    const a = document.createElement('a');
    a.href = n.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'mt-2 inline-flex items-center gap-1 text-sm text-blue-700 font-bold';
    a.textContent = (n.fileName ? n.fileName : '開啟') + ' ↗';
    card.appendChild(a);
  }

  if (isAdmin) {
    const actions = document.createElement('div');
    actions.className = 'flex gap-3 mt-2 pt-2 border-t border-gray-100';
    const pinBtn = makeBtn(n.pinned ? '取消置頂' : '置頂', 'text-gray-600', () => togglePin(n));
    const editBtn = makeBtn('編輯', 'text-blue-600', () => openForm(n));
    const delBtn = makeBtn('刪除', 'text-red-500', () => remove(n.id));
    actions.appendChild(pinBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);
  }

  return card;
}

function makeBtn(label, colorClass, onClick) {
  const b = document.createElement('button');
  b.className = `text-sm font-bold ${colorClass}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function openForm(notice) {
  editId = notice ? notice.id : null;
  $('formTitle').textContent = notice ? '編輯公告' : '新增公告';
  $('nTitle').value = notice ? notice.title : '';
  $('nCategory').value = notice ? (notice.category || '公告') : '公告';
  $('nDate').value = notice ? (notice.date || '') : '';
  $('nLink').value = notice ? (notice.link || '') : '';
  $('nFileName').value = notice ? (notice.fileName || '') : '';
  $('nBody').value = notice ? (notice.body || '') : '';
  $('nPinned').checked = notice ? notice.pinned === true : false;
  $('noticeForm').classList.remove('hidden');
  $('showFormBtn').classList.add('hidden');
  $('noticeForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeForm() {
  $('noticeForm').classList.add('hidden');
  $('showFormBtn').classList.remove('hidden');
  editId = null;
}

async function save() {
  const title = $('nTitle').value.trim();
  if (!title) { setMessage('請輸入標題', true); return; }
  try {
    await saveNotice({
      id: editId || undefined,
      title,
      category: $('nCategory').value,
      date: $('nDate').value,
      link: $('nLink').value,
      fileName: $('nFileName').value,
      body: $('nBody').value,
      pinned: $('nPinned').checked
    });
    closeForm();
    await load();
    setMessage(editId ? '已更新' : '已新增');
    editId = null;
  } catch (err) {
    setMessage(`儲存失敗：${err.message}`, true);
  }
}

async function togglePin(n) {
  try {
    await setNoticePinned(n.id, !(n.pinned === true));
    await load();
  } catch (err) {
    setMessage(`更新失敗：${err.message}`, true);
  }
}

async function remove(id) {
  if (!confirm('確定刪除？')) return;
  try {
    await deleteNotice(id);
    await load();
    setMessage('已刪除');
  } catch (err) {
    setMessage(`刪除失敗：${err.message}`, true);
  }
}

onRoleLoaded((role) => { init(role); });
