/**
 * 取得使用者角色與班級
 */
function getUserRoles(email) {
  const permSheet = SpreadsheetApp.openById(CONFIG.PERMISSION_SPREADSHEET_ID)
    .getSheetByName(CONFIG.PERMISSION_SHEET_NAME);
  const data = permSheet.getDataRange().getValues();
  const headers = data[0];
  const emailCol = headers.indexOf("email");
  const roleCol = headers.indexOf("role");
  const classCol = headers.indexOf("class");

  for (let i = 1; i < data.length; i++) {
    if (data[i][emailCol] === email) {
      const role = data[i][roleCol];
      const cls = data[i][classCol];
      if (role === "admin") {
        return { role: "admin", classes: ["*"] };
      } else if (role === "teacher") {
        return { role: "teacher", classes: [cls] };
      }
    }
  }
  return null; // 未授權
}

/**
 * 取得所有班級（工作表名稱）
 */
function getAllClasses() {
  const ss = SpreadsheetApp.openById(CONFIG.STUDENT_SPREADSHEET_ID);
  return ss.getSheets().map(sheet => sheet.getName());
}

/**
 * 取得某班學生名單（僅「類別=學生」），同時獲取學生的班名
 */
function getStudentsByClass(className) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.STUDENT_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(className);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    const serialCol = data[0].indexOf("序號");
    const typeCol = data[0].indexOf("類別");
    const nameCol = data[0].indexOf("姓名");
    const classNameCol = data[0].indexOf("班名"); // 新增班名列
    
    const students = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][typeCol] === "學生") {
        students.push({
          serial: data[i][serialCol],
          name: data[i][nameCol],
          className: data[i][classNameCol], // 班名字段
          category: className // sheet name as class category
        });
      }
    }
    return students;
  } catch (e) {
    console.error("Error in getStudentsByClass:", e);
    return [];
  }
}

/**
 * 根據班級和學生姓名獲取學生信息
 */
function getStudentInfo(className, studentName) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.STUDENT_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(className);
    if (!sheet) return null;
    const data = sheet.getDataRange().getValues();
    const serialCol = data[0].indexOf("序號");
    const typeCol = data[0].indexOf("類別");
    const nameCol = data[0].indexOf("姓名");
    const classNameCol = data[0].indexOf("班名"); // 班名列
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][typeCol] === "學生" && data[i][nameCol] === studentName) {
        return {
          serial: data[i][serialCol],
          name: data[i][nameCol],
          className: data[i][classNameCol], // 班名字段
          category: className // sheet name as class category
        };
      }
    }
    return null;
  } catch (e) {
    console.error("Error in getStudentInfo:", e);
    return null;
  }
}


/**
 * 取得所有學生及其班級（僅限 role="admin"），包含學生的班名
 * @returns {Array} 學生列表，格式為 [{class: '班級類別', name: '學生姓名', className: '班名'}, ...]
 */
function getAllStudents(email) {
  const user = getUserRoles(email);
  if (!user || user.role !== "admin") {
    throw new Error("只有管理員可執行此操作");
  }

  const classes = getAllClasses();
  const allStudents = [];

  for (const className of classes) {
    const students = getStudentsByClass(className);
    for (const student of students) {
      allStudents.push({
        class: student.category, // class category (sheet name)
        name: student.name,
        className: student.className // actual class name from 班名 column
      });
    }
  }

  return allStudents;
}

/**
 * 驗證日期是否為星期日
 */
function isSunday(dateStr) {
  const d = new Date(dateStr);
  return d.getDay() === 0; // 0 = Sunday
}

/**
 * 取得某班學生參與明細（用於 details.html）
 */
function getAttendanceDetails(email, className) {
  const user = getUserRoles(email);
  if (!user) throw new Error("未授權");

  // 權限檢查
 if (user.role === "teacher" && user.classes[0] !== className) {
    throw new Error("無權限");
  }

  // Use cache to avoid repeated reads
  const cache = CacheService.getScriptCache();
  const cacheKey = `attendance_details_${className}`;
  const cachedData = cache.get(cacheKey);
  
  let data;
  if (cachedData) {
    data = JSON.parse(cachedData);
  } else {
    const attendanceSS = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
    const sheet = attendanceSS.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
    data = sheet.getDataRange().getValues();
    cache.put(cacheKey, JSON.stringify(data), 5 * 60); // Cache for 5 minutes
  }

  const headers = data[0];
  
  const classCol = headers.indexOf("班級");
  const studentCol = headers.indexOf("學生姓名");
  const dateCol = headers.indexOf("參與日期");
  const redeemedCol = headers.indexOf("已換領");
  const redeemDateCol = headers.indexOf("換領日期");
  // Check if there's a 班名 column (might be the 8th column if added)
  const classNameCol = headers.length > 7 ? 7 : -1; // Assuming 班名 is added as 8th column (index 7)

  let filtered = data.slice(1);
  if (className !== "*") {
    filtered = filtered.filter(row => row[classCol] === className);
 }

  return filtered.map(row => ({
    studentName: row[studentCol],
    attendanceDate: row[dateCol],
    redeemed: row[redeemedCol] === "是",
    redeemDate: row[redeemDateCol] || "",
    studentClassName: classNameCol !== -1 ? row[classNameCol] : undefined
  }));
}

/**
 * 取得所有未換領獎品的記錄 (僅限管理員)
 */
function getUnredeemedRecords(email) {
  const user = getUserRoles(email);
  if (!user || user.role !== "admin") {
    throw new Error("只有管理員可執行此操作");
  }

  // Use cache to avoid repeated reads
  const cache = CacheService.getScriptCache();
  const cacheKey = `unredeemed_records`;
  const cachedData = cache.get(cacheKey);
  
  let data;
  if (cachedData) {
    data = JSON.parse(cachedData);
  } else {
    const attendanceSS = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
    const sheet = attendanceSS.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
    data = sheet.getDataRange().getValues();
    cache.put(cacheKey, JSON.stringify(data), 5 * 60); // Cache for 5 minutes
  }

  const headers = data[0];
  
  const classCol = headers.indexOf("班級");
  const studentCol = headers.indexOf("學生姓名");
  const dateCol = headers.indexOf("登記日期");
  const redeemedCol = headers.indexOf("已換領");
  // Check if there's a 班名 column (might be the 8th column if added)
  const classNameCol = headers.length > 7 ? 7 : -1; // Assuming 班名 is added as 8th column (index 7)

  const unredeemedRecords = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][redeemedCol] !== "是") { // 未換領的記錄
      unredeemedRecords.push({
        class: data[i][classCol],
        studentName: data[i][studentCol],
        attendanceDate: data[i][dateCol],
        studentClassName: classNameCol !== -1 ? data[i][classNameCol] : undefined
      });
    }
 }

  return unredeemedRecords;
}

/**
 * 批量更新換領狀態
 */
function batchUpdateRedeemStatus(records, email) {
  const user = getUserRoles(email);
  if (!user || user.role !== "admin") {
    throw new Error("只有管理員可執行此操作");
  }

  // Use cache to avoid repeated reads
  const cache = CacheService.getScriptCache();
  const cacheKey = `batch_update_data`;
  const cachedData = cache.get(cacheKey);
  
  let data;
  if (cachedData) {
    data = JSON.parse(cachedData);
  } else {
    const attendanceSS = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
    const sheet = attendanceSS.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
    data = sheet.getDataRange().getValues();
    cache.put(cacheKey, JSON.stringify(data), 2 * 60); // Cache for 2 minutes (shorter for updates)
  }

  const headers = data[0];

  const classCol = headers.indexOf("班級");
  const studentCol = headers.indexOf("學生姓名");
  const dateCol = headers.indexOf("登記日期");
  const redeemedCol = headers.indexOf("已換領");
  const redeemDateCol = headers.indexOf("換領日期");
  // Check if there's a 班名 column (might be the 8th column if added)
  const classNameCol = headers.length > 7 ? 7 : -1; // Assuming 班名 is added as 8th column (index 7)

  let updatedCount = 0;
  const errors = [];

  for (let record of records) {
    const { className, studentName, attendanceDate, redeemDate } = record;
    
    let found = false;
    for (let i = 1; i < data.length; i++) {
      // 簡化日期處理：統一轉換為標準格式進行比較
      const rowDate = normalizeDate(data[i][dateCol]);
      const targetDate = normalizeDate(attendanceDate);

      if (
        data[i][classCol].toString().trim() === className.trim() &&
        data[i][studentCol].toString().trim() === studentName.trim() &&
        rowDate === targetDate
      ) {
        // 更新換領狀態
        const attendanceSS = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
        const sheet = attendanceSS.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
        sheet.getRange(i + 1, redeemedCol + 1).setValue("是");
        sheet.getRange(i + 1, redeemDateCol + 1).setValue(redeemDate);
        updatedCount++;
        found = true;
        break;
      }
    }
    
    if (!found) {
      errors.push(`找不到匹配紀錄: ${className}, ${studentName}, ${attendanceDate}`);
    }
 }

  // Invalidate cache after update
  cache.remove(`pending_redemption_report`);
  cache.remove(`unredeemed_records`);
  cache.remove(`achieved_students_*`);
  cache.remove(`stats_all`);
  
  return {
    success: true,
    updatedCount: updatedCount,
    errors: errors
  };
}

/**
 * 獲取達成換領條件的學生名單
 */
function getAchievedStudents(email, requestedClass = '*') {
  const user = getUserRoles(email);
  if (!user) throw new Error("未授權");

  // 權限檢查
  if (user.role === "teacher" && requestedClass !== '*' && requestedClass !== user.classes[0]) {
    throw new Error("無權限");
  }

  // Use cache to avoid repeated reads
  const cache = CacheService.getScriptCache();
  const cacheKey = `achieved_students_${requestedClass}`;
  const cachedData = cache.get(cacheKey);
  
  let data;
  if (cachedData) {
    data = JSON.parse(cachedData);
  } else {
    const attendanceSS = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
    const sheet = attendanceSS.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
    data = sheet.getDataRange().getValues();
    cache.put(cacheKey, JSON.stringify(data), 5 * 60); // Cache for 5 minutes
  }

  const headers = data[0];
  
  const classCol = headers.indexOf("班級");
  const studentCol = headers.indexOf("學生姓名");
  const dateCol = headers.indexOf("登記日期");
  // Check if there's a 班名 column (might be the 8th column if added)
  const classNameCol = headers.length > 7 ? 7 : -1; // Assuming 班名 is added as 8th column (index 7)
  
  let filteredData = data.slice(1);
  if (user.role === "teacher") {
    filteredData = filteredData.filter(row => row[classCol] === user.classes[0]);
  } else if (requestedClass && requestedClass !== "*") {
    filteredData = filteredData.filter(row => row[classCol] === requestedClass);
  }

  const redeemedCol = headers.indexOf("已換領");
  
  // 按學生姓名分組並計算出席次數
  const studentAttendanceMap = {};
  for (let row of filteredData) {
    const className = row[classCol];
    const studentName = row[studentCol];
    const attendanceDate = row[dateCol];
    const isRedeemed = row[redeemedCol] === "是";
    const studentClassName = classNameCol !== -1 ? row[classNameCol] : undefined;
    
    if (!studentAttendanceMap[studentName]) {
      studentAttendanceMap[studentName] = {
        class: className,
        studentName: studentName,
        studentClassName: studentClassName, // Add the student's class name
        attendanceCount: 0,
        attendanceDates: [],
        redeemedCount: 0  // 追踪已換領次數
      };
    }
    
    studentAttendanceMap[studentName].attendanceCount++;
    studentAttendanceMap[studentName].attendanceDates.push(attendanceDate);
    
    // 如果已換領，增加換領計數
    if (isRedeemed) {
      studentAttendanceMap[studentName].redeemedCount++;
    }
  }

  // 過濾出達成條件的學生 (假設達成條件是出席次數 >= 3)
  const ACHIEVEMENT_THRESHOLD = 1; // 可根據實際需求調整
  const achievedStudents = [];
  
  for (let studentName in studentAttendanceMap) {
    const student = studentAttendanceMap[studentName];
    if (student.attendanceCount >= ACHIEVEMENT_THRESHOLD) {
      // 找出最早達成條件的日期
      student.attendanceDates.sort(); // 排序日期
      student.achievedDate = student.attendanceDates[ACHIEVEMENT_THRESHOLD - 1]; // 第達成門檻次出席的日期即為達成日期
      
      // 計算達成條件的總次數（假設每次達到門檻就可換領一次禮物）
      const qualifiedRedemptions = Math.floor(student.attendanceCount / ACHIEVEMENT_THRESHOLD);
      
      // 添加換領狀態信息
      student.isFullyRedeemed = (student.redeemedCount >= qualifiedRedemptions);
      student.redemptionStatus = `${student.redeemedCount}/${qualifiedRedemptions}`;
      
      achievedStudents.push(student);
    }
  }

  return achievedStudents;
}



/**
 * 取得統計資料
 */
function getStats(email, requestedClass) {
  const user = getUserRoles(email);
  if (!user) throw new Error("未授權");

  // Use cache to avoid repeated reads
  const cache = CacheService.getScriptCache();
  const cacheKey = `stats_${requestedClass || 'all'}`;
  const cachedData = cache.get(cacheKey);
  
  let data;
  if (cachedData) {
    data = JSON.parse(cachedData);
  } else {
    const attendanceSS = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
    const sheet = attendanceSS.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
    data = sheet.getDataRange().getValues();
    cache.put(cacheKey, JSON.stringify(data), 5 * 60); // Cache for 5 minutes
  }

  const headers = data[0];
  const classCol = headers.indexOf("班級");
  const studentCol = headers.indexOf("學生姓名");
  const redeemedCol = headers.indexOf("已換領");

  let filteredData = data.slice(1);
  if (user.role === "teacher") {
    filteredData = filteredData.filter(row => row[classCol] === user.classes[0]);
  } else if (requestedClass && requestedClass !== "*") {
    filteredData = filteredData.filter(row => row[classCol] === requestedClass);
  }

  // 計算統計
  const totalRecords = filteredData.length;
  const redeemedCount = filteredData.filter(row => row[redeemedCol] === "是").length;

  // 計算達成學生人數（去重）
  const uniqueStudents = new Set(filteredData.map(row => row[studentCol]));
  const achievedStudents = uniqueStudents.size;

  return {
    totalRecords,
    achievedStudents,
    redeemedCount,
    class: requestedClass || (user.role === "teacher" ? user.classes[0] : "*")
  };
}

function recordAttendance(payload) {
  const { className, studentName, attendanceDate, redeemed, redeemDate, email } = payload;

  // 1. Validate Sunday
  if (!isSunday(attendanceDate)) {
    throw new Error("登記日期必須為星期日!");
  }

  // 2. Validate redeemDate if redeemed
  if (redeemed && (!redeemDate || redeemDate.trim() === "")) {
    throw new Error("勾選已換領時，必須填寫換領日期");
 }

  // 3. Get the student's 班名 from the student sheet
  const studentData = getStudentInfo(className, studentName);
  const studentClassName = studentData ? studentData.className : '';

  // Use cache to avoid repeated reads
  const cache = CacheService.getScriptCache();
  const cacheKey = `record_attendance_data`;
  const cachedData = cache.get(cacheKey);
  
  let data;
  if (cachedData) {
    data = JSON.parse(cachedData);
  } else {
    const attendanceSS = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
    const sheet = attendanceSS.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
    data = sheet.getDataRange().getValues();
    cache.put(cacheKey, JSON.stringify(data), 2 * 60); // Cache for 2 minutes (shorter for updates)
  }

 // 使用全局的 normalizeDate 函數

  // 4. Check for duplicate: same class, student, and attendance date
  const exists = data.slice(1).some(row => {
    const rowClass = (row[0] || "").toString().trim();
    const rowStudent = (row[1] || "").toString().trim();
    const rowDateStr = normalizeDate(row[2]);

    return (
      rowClass === className.trim() &&
      rowStudent === studentName.trim() &&
      rowDateStr === normalizeDate(attendanceDate)
    );
 });

  if (exists) {
    throw new Error("該學生在此日期已有登記紀錄，請勿重複登記。");
  }

  // Add the record to the sheet
  const attendanceSS = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
  const sheet = attendanceSS.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
  const timestamp = new Date().toISOString();
  sheet.appendRow([
    className,           // 班級
    studentName,         // 學生姓名
    attendanceDate,      // 登記日期
    redeemed ? "是" : "否", // 已換領
    redeemDate || "",    // 換領日期
    email,               // 登記者Email
    timestamp,           // 登記時間
    studentClassName     // 新增：學生的班名 (從學生表獲取)
  ]);

  // Invalidate cache after update
  const cacheToUpdate = CacheService.getScriptCache();
  cacheToUpdate.remove(`pending_redemption_report`);
  cacheToUpdate.remove(`unredeemed_records`);
  cacheToUpdate.remove(`achieved_students_*`);
  cacheToUpdate.remove(`stats_all`);
  cacheToUpdate.remove(`attendance_details_*`);

  return { success: true };
}


/**
 * 動作 B：更新現有記錄 (補領禮物)
 * 邏輯：尋找現有紀錄 -> 更新「已換領」與「換領日期」欄位
 */
function updateRedeemStatus(payload) {
  const { email, className, studentName, attendanceDate, redeemDate } = payload;

  if (!className || !studentName || !attendanceDate || !redeemDate) {
    throw new Error("缺少必要欄位: " + JSON.stringify(payload));
  }

  // 1. 權限檢查 (Debug 時可以先註解掉這部分確認是否為權限問題)
  const user = getUserRoles(email);
  if (!user) throw new Error("未授權: " + email);
  
  // Use cache to avoid repeated reads
  const cache = CacheService.getScriptCache();
  const cacheKey = `update_redeem_status_data`;
  const cachedData = cache.get(cacheKey);
  
  let data;
  if (cachedData) {
    data = JSON.parse(cachedData);
  } else {
    const ss = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
    data = sheet.getDataRange().getValues();
    cache.put(cacheKey, JSON.stringify(data), 2 * 60); // Cache for 2 minutes (shorter for updates)
  }

  const headers = data[0];

  const classCol = headers.indexOf("班級");
  const studentCol = headers.indexOf("學生姓名");
  const dateCol = headers.indexOf("登記日期");
  const redeemedCol = headers.indexOf("已換領");
  const redeemDateCol = headers.indexOf("換領日期");

  // 檢查標題索引是否正確
  if (classCol === -1 || studentCol === -1 || dateCol === -1) {
    throw new Error("找不到必要的表頭欄位");
  }

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    // 使用統一的日期規範化函數進行比較
    const rowDate = normalizeDate(data[i][dateCol]);
    const targetDate = normalizeDate(attendanceDate);

    if (
      data[i][classCol].toString().trim() === className.trim() &&
      data[i][studentCol].toString().trim() === studentName.trim() &&
      rowDate === targetDate
    ) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error(`找不到匹配紀錄: ${className}, ${studentName}, ${attendanceDate}`);
  }

  // 3. 更新欄位
  const ss = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
  sheet.getRange(rowIndex, redeemedCol + 1).setValue("是");
  sheet.getRange(rowIndex, redeemDateCol + 1).setValue(redeemDate);
  
  // Invalidate cache after update
  const cacheToUpdate = CacheService.getScriptCache();
  cacheToUpdate.remove(`pending_redemption_report`);
  cacheToUpdate.remove(`unredeemed_records`);
  cacheToUpdate.remove(`achieved_students_*`);
  cacheToUpdate.remove(`stats_all`);
  
  return { success: true, updatedRow: rowIndex };
}

/**
 * 規範化日期格式為 yyyy-MM-dd 字串
 */
function normalizeDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  if (typeof value === "number") {
    // Google Sheets 日期序列號
    const date = new Date((value - 25569) * 86400 * 1000);
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  // 假設是字符串 (或可以轉換為字符串)
  const str = value.toString().trim();
  if (str === "") return "";
  // 如果是 ISO 格式日期字符串 (包含 'T')
  if (str.includes('T')) {
    const date = new Date(str);
    if (isNaN(date.getTime())) return str; // 如果無法解析，返回原字符串
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
 // 如果看起來像日期 (例如 "2025-12-21")，直接返回
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str;
 // 否則嘗試解析
  const d = new Date(str);
  if (isNaN(d.getTime())) return str; // fallback
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// ========================
// Web App 入口
// ========================

function doGet(e) {
 const action = e.parameter.action;
  const email = e.parameter.email;
  const className = e.parameter.class;
											 													 									   

  let result;
  try {
    if (action === "getUserRoles") {
      result = getUserRoles(email);
    } else if (action === "getAllClasses") {
      result = getAllClasses();
    } else if (action === "getAllStudents") {
      result = getAllStudents(email);
    } else if (action === "getStudentsByClass") {
      result = getStudentsByClass(className);
    } else if (action === "getStats") {
      result = getStats(email, className); 
    } else if (action === "getAttendanceDetails") {
      result = getAttendanceDetails(email, className);    
    } else if (action === "getUnredeemedRecords") {
      result = getUnredeemedRecords(email);
    } else if (action === "getAchievedStudents") {
      result = getAchievedStudents(email, className);
    } else if (action === "getClassBasedPendingRedemptionReport") {
      result = getClassBasedPendingRedemptionReport(email);
    } else if (action === "getGlobalRedemptionStats") {
      result = getGlobalRedemptionStats(email);
    } else {
      throw new Error("未知操作");
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON)
      //.setHeaders({ 'Access-Control-Allow-Origin': '*' });
  }

 return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON)
    //.setHeaders({ 'Access-Control-Allow-Origin': '*' });

}



// 在 doPost 中加入新 action
							
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    // 嘗試用 e.parameter（表單格式）
    payload = {
      action: e.parameter.action,
      email: e.parameter.email,
      className: e.parameter.className,
      studentName: e.parameter.studentName,
      attendanceDate: e.parameter.attendanceDate,
      redeemDate: e.parameter.redeemDate,
      // 修復：正確處理可能為JSON字符串的records參數
      records: e.parameter.records ? (typeof e.parameter.records === 'string' ? JSON.parse(e.parameter.records) : e.parameter.records) : null
    };
  }

  try {
			   
    if (payload.action === "updateRedeemStatus") {
      // 移除 action，只傳資料
      const data = { ...payload };
      delete data.action;
      updateRedeemStatus(data);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
     } else if (payload.action === "batchUpdateRedeemStatus") {
      const records = payload.records || [];
      batchUpdateRedeemStatus(records, payload.email);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
      } else {
      // 原有的 recordAttendance
      recordAttendance(payload);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
																											 
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 取得按班名分組的待兌換學生報告
 * 返回按學生班名 (className) 分組的未兌換獎勵記錄
 */
function getClassBasedPendingRedemptionReport(email) {
  const user = getUserRoles(email);
  if (!user || user.role !== "admin") {
    throw new Error("只有管理員可執行此操作");
  }

  // Use cache to avoid repeated reads
  const cache = CacheService.getScriptCache();
  const cacheKey = `pending_redemption_report`;
  const cachedData = cache.get(cacheKey);
  
  let data;
  if (cachedData) {
    data = JSON.parse(cachedData);
  } else {
    const attendanceSS = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
    const sheet = attendanceSS.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
    data = sheet.getDataRange().getValues();
    cache.put(cacheKey, JSON.stringify(data), 5 * 60); // Cache for 5 minutes
  }

  const headers = data[0];
  
  const classCol = headers.indexOf("班級");
  const studentCol = headers.indexOf("學生姓名");
  const dateCol = headers.indexOf("登記日期");
  const redeemedCol = headers.indexOf("已換領");
  // Check if there's a 班名 column (might be the 8th column if added)
  const classNameCol = headers.length > 7 ? 7 : -1; // Assuming 班名 is added as 8th column (index 7)

  // Group unredeemed records by student's class name (班名)
  const groupedReport = {};

  for (let i = 1; i < data.length; i++) {
    // Only include records that are not yet redeemed
    if (data[i][redeemedCol] !== "是") {
      const className = classNameCol !== -1 ? data[i][classNameCol] : 'Unknown'; // Use 班名 if available, otherwise 'Unknown'
      const classCategory = data[i][classCol]; // The class category (sheet name)
      const studentName = data[i][studentCol];
      const attendanceDate = data[i][dateCol];
      
      // Initialize the class group if it doesn't exist
      if (!groupedReport[className]) {
        groupedReport[className] = [];
      }
      
      // Add the student record to the appropriate class group
      groupedReport[className].push({
        classCategory: classCategory, // Original class category from sheet name
        studentName: studentName,
        attendanceDate: attendanceDate,
        className: className // Student's class name (班名)
      });
    }
  }

  return groupedReport;
}

/**
 * 取得全局換領統計數據
 */
function getGlobalRedemptionStats(email) {
  const user = getUserRoles(email);
  if (!user || user.role !== "admin") {
    throw new Error("只有管理員可執行此操作");
  }

  // Use cache to avoid repeated reads
  const cache = CacheService.getScriptCache();
  const cacheKey = `global_redemption_stats`;
  const cachedData = cache.get(cacheKey);
  
  let data;
  if (cachedData) {
    data = JSON.parse(cachedData);
  } else {
    const attendanceSS = SpreadsheetApp.openById(CONFIG.ATTENDANCE_SPREADSHEET_ID);
    const sheet = attendanceSS.getSheetByName(CONFIG.ATTENDANCE_SHEET_NAME);
    data = sheet.getDataRange().getValues();
    cache.put(cacheKey, JSON.stringify(data), 5 * 60); // Cache for 5 minutes
  }

  const headers = data[0];
  const redeemedCol = headers.indexOf("已換領");

  // 計算全局統計
  const totalRecords = data.length - 1; // 減去標題行
  const redeemedCount = data.slice(1).filter(row => row[redeemedCol] === "是").length;
  const outstandingCount = totalRecords - redeemedCount;

  return {
    totalRecords,
    redeemedCount,
    outstandingCount
  };
}