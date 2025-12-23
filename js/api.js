// js/api.js
import { APP_CONFIG } from './config.js';

const API_URL = APP_CONFIG.appsScriptUrl;

/**
 * 將物件轉換為 URLSearchParams 格式
 */
function toFormData(obj) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      // 確保布林值轉為字串 "true"/"false"
      params.append(key, String(value));
    }
  }
  return params;
}

// ==========================================
// 公開 API（無需登入）
// ==========================================

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

// ==========================================
// 需驗證或與資料相關的 API
// ==========================================

/**
 * 獲取統計數據
 */
export async function getStats(email, className = '*') {
  if (!email) throw new Error('必須提供使用者 email');
  const url = `${API_URL}?action=getStats&email=${encodeURIComponent(email)}&class=${encodeURIComponent(className)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * 獲取特定班級的詳細登記記錄
 */
export async function fetchAttendanceDetails(email, className) {
  if (!email || !className) throw new Error('缺少必要參數');
  const url = `${API_URL}?action=getAttendanceDetails&email=${encodeURIComponent(email)}&class=${encodeURIComponent(className)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data; 
}

/**
 * 新增登記記錄 (普通模式)
 * data 包含: email, className, studentName, attendanceDate, redeemed, redeemDate
 */
export async function recordAttendance(data) {
  const required = ['email', 'className', 'studentName', 'attendanceDate'];
  for (const field of required) {
    if (!data[field]) {
      throw new Error(`缺少必要欄位: ${field}`);
    }
  }

  const formData = toFormData({
    action: 'recordAttendance',
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

/**
 * 獲取所有學生及其班級 (僅限管理員)
 * @param {string} email - 用戶郵箱
 * @returns {Array} 學生列表，格式為 [{class: '班級名', name: '學生名'}, ...]
 */
export async function getAllStudents(email) {
  if (!email) throw new Error('必須提供使用者 email');
  
  const url = `${API_URL}?action=getAllStudents&email=${encodeURIComponent(email)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * 更新換領狀態 (補領模式)
 * data 包含: email, className, studentName, attendanceDate, redeemed, redeemDate
 */
export async function updateRedeemStatus(data) {
  // 在補領模式下，attendanceDate 是用來定位「哪一天的彌撒」
  const required = ['email', 'className', 'studentName', 'attendanceDate', 'redeemDate'];
  for (const field of required) {
    if (!data[field]) {
      throw new Error(`缺少必要欄位: ${field}`);
    }
  }

  // 處理日期格式，確保attendanceDate是yyyy-MM-dd格式
  const processedData = {
    ...data,
    attendanceDate: formatDateForApi(data.attendanceDate)
  };
  
  const formData = toFormData({
    action: 'updateRedeemStatus',
    ...processedData
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

/**
 * 獲取所有未換領獎品的記錄 (僅限管理員)
 * @param {string} email - 用戶郵箱
 * @returns {Array} 未換領記錄列表
 */
export async function getUnredeemedRecords(email) {
  if (!email) throw new Error('必須提供使用者 email');
  
  const url = `${API_URL}?action=getUnredeemedRecords&email=${encodeURIComponent(email)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * 批量更新換領狀態 (補領模式)
 * @param {Array} records - 要更新的記錄數組，每項包含 {className, studentName, attendanceDate, redeemDate}
 * @param {string} email - 用戶郵箱
 */
export async function batchUpdateRedeemStatus(records, email) {
  if (!email) throw new Error('必須提供使用者 email');
  if (!Array.isArray(records)) throw new Error('records 必須是數組');
  
  // 確保記錄中的日期格式正確
  const processedRecords = records.map(record => ({
    ...record,
    // 確保attendanceDate是yyyy-MM-dd格式
    attendanceDate: formatDateForApi(record.attendanceDate)
  }));
  
  const formData = toFormData({
    action: 'batchUpdateRedeemStatus',
    email: email,
    records: JSON.stringify(processedRecords)
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

/**
 * 將日期格式化為API所需的格式 (yyyy-MM-dd)
 */
function formatDateForApi(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  // 檢查是否是有效的日期
  if (isNaN(date.getTime())) {
    // 如果不是有效日期，直接返回原字符串
    return dateString;
  }
  // 格式化為 yyyy-MM-dd
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 獲取達成換領條件的學生名單
 * @param {string} email - 用戶郵箱
 * @param {string} className - 班級名稱，'*' 表示所有班級
 * @returns {Array} 達成換領條件的學生列表
 */
export async function getAchievedStudents(email, className = '*') {
   if (!email) throw new Error('必須提供使用者 email');
   
   const url = `${API_URL}?action=getAchievedStudents&email=${encodeURIComponent(email)}&class=${encodeURIComponent(className)}`;
   const res = await fetch(url);
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
 }