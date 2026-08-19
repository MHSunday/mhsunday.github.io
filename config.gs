// Config.gs
const CONFIG = {
  // 🔑 學生名單 Google Sheet（多工作表，每張表是一班）
  STUDENT_SPREADSHEET_ID: "1vTb--p1DkUF2kwH7v-QvtxPclcfe5XGt9dZdBQyzZhg",

  // 🔑 權限設定表（建議獨立檔案）
  PERMISSION_SPREADSHEET_ID: "1Uwa0Tis5xSVJ7D_rLNirqYZpasLeRYb3Jb7EX6HJ9IY",
  PERMISSION_SHEET_NAME: "permissions",

  // 🔑 獎勵記錄表（建議獨立檔案）
  ATTENDANCE_SPREADSHEET_ID: "1Uwa0Tis5xSVJ7D_rLNirqYZpasLeRYb3Jb7EX6HJ9IY",
  ATTENDANCE_SHEET_NAME: "attendances",

    //投票記錄表
  VOTE_SPREADSHEET_ID: "1yaQTG6CSYC_BRtOyrYakdLKbJIcROJ_kxCGZ8433Zyk",
  VOTE_SHEET_NAME: "result",

  // 管理員功能 (admin.html) — 無密碼保護
  VOTE_OPTIONS_SHEET_NAME: "options"
};