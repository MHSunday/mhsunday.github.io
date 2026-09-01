// js/main-hub.js — 登入後嘅入口選擇頁
// 可以揀去「每班 Portal」或「彌撒獎勵」；老師/管理員預設建議入 Portal。
import { getUserRole, logout, onRoleLoaded } from './auth.js';

const $ = (id) => document.getElementById(id);

function setMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text || '';
  el.className = `text-center text-sm font-medium min-h-[1.25rem] ${isError ? 'text-red-600' : 'text-green-600'}`;
}

function init(role) {
  $('logoutBtn').addEventListener('click', () => logout());

  const isAdmin = role && role.role === 'admin';
  const isTeacher = role && role.role === 'teacher';

  $('welcome').textContent = isAdmin
    ? '歡迎，管理員'
    : isTeacher
      ? '歡迎，老師'
      : '歡迎';

  if (isAdmin) {
    $('portalBtn').classList.add('ring-4', 'ring-blue-200');
    $('portalDesc').textContent = '點名 / 學生名單 / 班級檔案　（建議）';
  } else {
    $('formBtn').style.display = 'none';
  }

  $('portalBtn').addEventListener('click', () => {
    window.location.href = 'class_portal.html';
  });
  $('formBtn').addEventListener('click', () => {
    window.location.href = 'form.html';
  });
}

onRoleLoaded((role) => {
  if (role && (role.role === 'admin' || role.role === 'teacher')) {
    init(role);
  } else {
    setMessage('此系統僅限教職員使用', true);
    setTimeout(() => window.location.replace('./index.html'), 1500);
  }
});
