/**
 * js/ui.js — 全站共用的小工具
 * 只放真正相同的邏輯；頁面專屬的 render / switchTab 不要放進來。
 */

export const $ = (id) => document.getElementById(id);

export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

export function urlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 2026-12-13 → 12/13；無法解析時回 fallback */
export function shortDate(dateStr, fallback = '') {
  const [, m, d] = String(dateStr || '').split('-');
  return m && d ? `${Number(m)}/${Number(d)}` : fallback;
}

/** 假期不是上課日（sessions 的 event 以「假期」開頭） */
export function isClassDay(session) {
  return !(session && session.event || '').startsWith('假期');
}

export function formatDateZhTW(value) {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('zh-TW');
}

export function formatDateZhHK(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

/**
 * 顯示訊息。預設用頁面的 #message。
 * @param {string} text
 * @param {{el?: HTMLElement, type?: 'info'|'error'|'success', className?: string, action?: {label:string,onClick:Function}}} opts
 */
export function setMessage(text, { el = null, type = 'info', className = '', action = null } = {}) {
  const target = el || document.getElementById('message');
  if (!target) return;

  const color = type === 'error' ? 'text-red-600' : type === 'success' ? 'text-emerald-600' : 'text-gray-500';
  if (className) target.className = `${className} ${color}`;
  target.textContent = '';

  const span = document.createElement('span');
  span.textContent = text || '';
  target.appendChild(span);

  if (action && typeof action.onClick === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-100';
    btn.textContent = action.label || '確定';
    btn.addEventListener('click', action.onClick);
    target.appendChild(btn);
  }
}
