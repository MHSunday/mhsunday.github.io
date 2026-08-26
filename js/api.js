// js/api.js
import { APP_CONFIG } from './config.js';
import { getAuthToken } from './auth.js';

const API_URL = APP_CONFIG.appsScriptUrl;

/**
 * 取得目前登入使用者的 ID Token 作為 query string。
 * 後端會用這個 token server-side 驗證身份，不再信任前端傳的 email。
 */
async function getTokenQS() {
  const token = await getAuthToken();
  return token ? 'idToken=' + encodeURIComponent(token) : 'idToken=';
}

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
  const qs = await getTokenQS();
  const res = await fetch(`${API_URL}?action=getAllClasses&${qs}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function getStudentsByClass(className) {
  if (!className) throw new Error('班級名稱不能為空');
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getStudentsByClass&class=${encodeURIComponent(className)}&${qs}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  
  // If the backend returns objects instead of just names, handle appropriately
  // Return the raw data as the new structure contains additional fields
  return Array.isArray(data) ? data : [];
}

// ==========================================
// 需驗證或與資料相關的 API
// ==========================================

/**
 * 獲取統計數據
 */
export async function getStats(email, className = '*') {
  if (!email) throw new Error('必須提供使用者 email');
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getStats&email=${encodeURIComponent(email)}&class=${encodeURIComponent(className)}&${qs}`;
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
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getAttendanceDetails&email=${encodeURIComponent(email)}&class=${encodeURIComponent(className)}&${qs}`;
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
    ...data,
    idToken: await getAuthToken()
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
 * @returns {Array} 學生列表，格式為 [{class: '班級名', name: '學生名', className: '班名'}, ...]
 */
export async function getAllStudents(email) {
  if (!email) throw new Error('必須提供使用者 email');
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getAllStudents&email=${encodeURIComponent(email)}&${qs}`;
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
    ...processedData,
    idToken: await getAuthToken()
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
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getUnredeemedRecords&email=${encodeURIComponent(email)}&${qs}`;
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
    records: JSON.stringify(processedRecords),
    idToken: await getAuthToken()
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
   const qs = await getTokenQS();
   const url = `${API_URL}?action=getAchievedStudents&email=${encodeURIComponent(email)}&class=${encodeURIComponent(className)}&${qs}`;
   const res = await fetch(url);
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
 }
 
 /**
  * 獲取按班名分組的待兌換學生報告
  * @param {string} email - 用戶郵箱
  * @returns {Object} 按班名分組的待兌換學生報告
  */
 export async function getClassBasedPendingRedemptionReport(email) {
   if (!email) throw new Error('必須提供使用者 email');
   const qs = await getTokenQS();
   const url = `${API_URL}?action=getClassBasedPendingRedemptionReport&email=${encodeURIComponent(email)}&${qs}`;
   const res = await fetch(url);
   const data = await res.json();
   if (data.error) throw new Error(data.error);
   return data;
 }
 
/**
 * 獲取全局換領統計數據
 * @param {string} email - 用戶郵箱
 * @returns {Object} 全局換領統計數據
 */
export async function getGlobalRedemptionStats(email) {
  if (!email) throw new Error('必須提供使用者 email');
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getGlobalRedemptionStats&email=${encodeURIComponent(email)}&${qs}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ==========================================
// 上堂日曆 (sessions) API
// ==========================================

/**
 * 取得上堂日曆（全部上堂日/活動/假期/停課）
 * @returns {Array} [{date:'yyyy-MM-dd', type:'上課', note:''}]
 */
export async function getSessions() {
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getSessions&${qs}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return Array.isArray(data) ? data : [];
}

/**
 * 批量覆寫上堂日曆（僅管理員）
 * @param {Array} sessions - [{date, type, note}]
 */
export async function saveSessions(sessions) {
  if (!Array.isArray(sessions)) throw new Error('sessions 必須是數組');
  const formData = toFormData({
    action: 'saveSessions',
    sessions: JSON.stringify(sessions),
    idToken: await getAuthToken()
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
 * 一鍵重置上堂日曆為「學年內全部週日」（僅管理員）
 */
export async function resetSessions() {
  const qs = await getTokenQS();
  const url = `${API_URL}?action=resetSessions&${qs}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ==========================================
// 課堂點名 (rollcall) API
// ==========================================

/**
 * 取得某班完整名單（學生 + 小導師 + 老師）
 * @param {string} className
 * @returns {Array} [{serial, name, category, className}]
 */
export async function getClassRoster(className) {
  if (!className) throw new Error('班級名稱不能為空');
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getClassRoster&class=${encodeURIComponent(className)}&${qs}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return Array.isArray(data) ? data : [];
}

/**
 * 取得某班某日嘅點名狀態（roster + 已填出席）
 * @param {string} className
 * @param {string} date - yyyy-MM-dd
 * @returns {Array} [{serial, name, category, className, present}]
 */
export async function getRollCall(className, date) {
  if (!className || !date) throw new Error('缺少必要參數');
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getRollCall&class=${encodeURIComponent(className)}&date=${encodeURIComponent(date)}&${qs}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return Array.isArray(data) ? data : [];
}

/**
 * 批量儲存點名（日期可為過去 = 補填）
 * @param {string} className
 * @param {string} date - yyyy-MM-dd
 * @param {Array} records - [{name, category, className, present}]
 */
export async function saveRollCall(className, date, records) {
  if (!className || !date || !Array.isArray(records)) throw new Error('缺少必要參數');
  const formData = toFormData({
    action: 'saveRollCall',
    className: className,
    date: formatDateForApi(date),
    records: JSON.stringify(records),
    idToken: await getAuthToken()
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
 * 取得某班學年範圍內全部點名記錄（全年矩陣 VIEW）
 * @param {string} className
 * @param {string} [startDate] - yyyy-MM-dd
 * @param {string} [endDate] - yyyy-MM-dd
 * @returns {Object} { date: { 姓名: true/false } }
 */
export async function getRollCallYear(className, startDate, endDate) {
  if (!className) throw new Error('缺少必要參數');
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getRollCallYear&class=${encodeURIComponent(className)}&startDate=${encodeURIComponent(startDate || '')}&endDate=${encodeURIComponent(endDate || '')}&${qs}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data || {};
}

/**
 * 取得某班學生補充資料（Form 收集）
 * @param {string} className
 */
export async function getStudentDetails(className) {
  if (!className) throw new Error('缺少必要參數');
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getStudentDetails&class=${encodeURIComponent(className)}&${qs}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return Array.isArray(data) ? data : [];
}

/**
 * 取得某班 portal 資料（links + roster + sessions + details）
 * @param {string} className
 */
export async function getClassPortal(className) {
  if (!className) throw new Error('缺少必要參數');
  const qs = await getTokenQS();
  const url = `${API_URL}?action=getClassPortal&class=${encodeURIComponent(className)}&${qs}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}