// js/api.js
import { APP_CONFIG } from './config.js';

const API_URL = APP_CONFIG.appsScriptUrl;

function toFormData(obj) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    if (value != null) {
      params.append(key, typeof value === 'boolean' ? String(value) : String(value));
    }
  }
  return params;
}

// 公開 API（無需登入）
export async function getAllClasses() {
  const res = await fetch(`${API_URL}?action=getAllClasses`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function getStudentsByClass(className) {
  if (!className) throw new Error('班級名稱不能為空');
  const url = `${API_URL}?action=getStudentsByClass&class=${encodeURIComponent(className)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// 需要 email 的 API（由調用方傳入）
export async function getStats(email, className = '*') {
  if (!email) throw new Error('必須提供使用者 email');
  const url = `${API_URL}?action=getStats&email=${encodeURIComponent(email)}&class=${encodeURIComponent(className)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}


// 新增：更新換領狀態
export async function updateRedeemStatus(data) {
  const required = ['email', 'className', 'studentName', 'attendanceDate', 'redeemDate'];
  for (const field of required) {
    if (!data[field]) {
      throw new Error(`缺少必要欄位: ${field}`);
    }
  }

  const formData = toFormData({
    action: 'updateRedeemStatus',
    ...data
  });

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData
  });

  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result;
}

// 新增：獲取明細記錄
export async function fetchAttendanceDetails(email, className) {
  if (!email || !className) throw new Error('缺少必要參數');
  const url = `${API_URL}?action=getAttendanceDetails&email=${encodeURIComponent(email)}&class=${encodeURIComponent(className)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data; // 預期格式: [{ studentName, attendanceDate, redeemed, redeemDate }]
}

// 登記記錄
export async function recordAttendance(data) {
  const required = ['className', 'studentName', 'attendanceDate', 'email'];
  for (const field of required) {
    if (!data[field]) {
      throw new Error(`缺少必要欄位: ${field}`);
    }
  }

  const formData = toFormData(data);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData
  });

  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result;
}