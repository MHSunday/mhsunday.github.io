function doGet() {
  var spreadsheet = SpreadsheetApp.openById(CONFIG.VOTE_SPREADSHEET_ID);
  var sheet = CONFIG.VOTE_SHEET_NAME
      ? spreadsheet.getSheetByName(CONFIG.VOTE_SHEET_NAME)
      : spreadsheet.getSheets()[0];
  // 強制讓任何 pending writes 提交，確保讀到最新狀態
  SpreadsheetApp.flush();
  var data = sheet.getDataRange().getValues();

  var votes = [];
  for (var i = 1; i < data.length; i++) {
    votes.push(data[i][1]); // Column B is index 1 (Choice)
  }

  return ContentService.createTextOutput(JSON.stringify({
    votes: votes,
    options: getOptions()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);

  // 管理員指令：先分流，避免影響原本的投票流程
  // 重要：失敗時必須用 ContentService 回 JSON，不能 throw，
  // 否則 GAS 會回 HTML 錯誤頁（沒有 CORS header），瀏覽器會擋掉。
  if (payload.action === "saveOptions") {
    var authErr = requireAdmin(payload.token);
    if (authErr) return authErr;
    var saveResult = doSaveOptions(payload.options);
    return ContentService.createTextOutput(JSON.stringify(saveResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (payload.action === "resetPoll") {
    var authErr2 = requireAdmin(payload.token);
    if (authErr2) return authErr2;
    var resetResult = doResetPoll();
    return ContentService.createTextOutput(JSON.stringify(resetResult))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var spreadsheet = SpreadsheetApp.openById(CONFIG.VOTE_SPREADSHEET_ID);
  var sheet = CONFIG.VOTE_SHEET_NAME
      ? spreadsheet.getSheetByName(CONFIG.VOTE_SHEET_NAME)
      : spreadsheet.getSheets()[0];

  var choice = payload.choice;
  var fingerprint = payload.fingerprint;

  // 讀一次 sheet 給 dedup 用
  var data = sheet.getDataRange().getValues();

  // Look through Column C (index 2) to see if this mobile device fingerprint already voted
  var alreadyVoted = false;
  for (var i = 1; i < data.length; i++) {
    if (data[i][2] === fingerprint) {
      alreadyVoted = true;
      break;
    }
  }

  if (alreadyVoted) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Already voted from this device." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 寫入新票
  sheet.appendRow([new Date(), choice, fingerprint]);

  // 強制 flush，否則緊接著的 getDataRange 經常看不到剛 append 的那一列
  SpreadsheetApp.flush();

  // 重讀一次拿給前端用
  var updatedData = sheet.getDataRange().getValues();
  var votes = [];
  for (var k = 1; k < updatedData.length; k++) {
    votes.push(updatedData[k][1]);
  }

  return ContentService.createTextOutput(JSON.stringify({ success: true, votes: votes }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========================
// 管理員功能 (Admin)
// ========================

function getOptions() {
  var ss = SpreadsheetApp.openById(CONFIG.VOTE_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.VOTE_OPTIONS_SHEET_NAME);
  if (!sheet) return [];
  SpreadsheetApp.flush();
  var data = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) out.push({ name: data[i][0], color: data[i][1] || "bg-blue-500" });
  }
  return out;
}

// 任何人都可以呼叫管理員指令（無密碼保護）
function requireAdmin(token) {
  return null;
}

function doSaveOptions(options) {
  if (!Array.isArray(options) || options.length === 0) {
    return { success: false, error: "Options cannot be empty" };
  }
  for (var i = 0; i < options.length; i++) {
    if (!options[i].name || !String(options[i].name).trim()) {
      return { success: false, error: "Option #" + (i + 1) + " has empty name" };
    }
  }
  var ss = SpreadsheetApp.openById(CONFIG.VOTE_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.VOTE_OPTIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.VOTE_OPTIONS_SHEET_NAME);
    sheet.appendRow(["name", "color"]);
    SpreadsheetApp.flush();
  }
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  SpreadsheetApp.flush();
  for (var j = 0; j < options.length; j++) {
    sheet.appendRow([
      String(options[j].name).trim(),
      options[j].color || "bg-blue-500"
    ]);
  }
  // 確保所有 append 提交，否則 GET 可能讀到舊資料
  SpreadsheetApp.flush();
  return { success: true, count: options.length };
}

function doResetPoll() {
  var ss = SpreadsheetApp.openById(CONFIG.VOTE_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.VOTE_SHEET_NAME);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 3).clearContent();
  SpreadsheetApp.flush();
  return { success: true, clearedRows: Math.max(0, lastRow - 1) };
}