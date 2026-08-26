# Session Context — 主日學登記系統 登入修復 + 安全強化

> 更新日期：2026-08-26

## 1. 原始問題

- 用戶回報「登入 Firebase 失敗」
- 實際症狀：Google 登入成功，但登入後立即被彈返登入頁（「您沒有使用此系統的權限」）

## 2. 診斷結果（根因）

| # | 根因 | 說明 |
|---|------|------|
| 1 | `appsScriptUrl` 指向嘅 GAS 部署被投票程式覆寫 | 原本主系統部署被 `voting.gs` 覆蓋，`doGet` 忽略參數、永遠回傳投票資料 → `getUserRoles` 攞唔到 role |
| 2 | 後端完全冇身份驗證 | GAS `getUserRoles(email)` 直接信任 query 入面嘅 email，任何人都可以扮 admin |
| 3 | `.gs` 原始碼放咗喺公開 GitHub repo | 洩漏 Google Sheets ID 同業務邏輯 |
| 4 | 部署後 `UrlFetchApp` 未授權 | `script.external_request` scope 未授權，server-side 驗證 call 唔到 Google |
| 5 | Firebase API key 有 referrer 限制，但冇加 auth 網域 | auth handler 喺 `githublogin-49a54.firebaseapp.com` 上跑，referer 被擋 → 「The action is invalid」 |
| 6 | 部署咗嘅 `config.gs` 冇 `FIREBASE_API_KEY`（或值錯） | `accounts:lookup` call 用 `key=undefined`/錯 key → 「API key not valid」 |

## 3. 已做嘅改動

### 後端（已移出 repo → `C:\Dev\SundaySchoolPortal\apps-script-backup\`）

- `config.gs`
  - 加入 `FIREBASE_API_KEY: "AIzaSyD2A4wLUBVUBKvfc_b0t1QPxye-_M1bIXY"`
  - 加入 `FIREBASE_PROJECT_ID: "githublogin-49a54"`
- `fixed_main.gs`
  - 新增 `verifyFirebaseIdToken(idToken)`：用 Firebase 官方 REST API
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=<FIREBASE_API_KEY>`
    （POST body 放 `{"idToken": ...}`）做 server-side 驗證
  - `doGet` / `doPost` 一律改用 **token 驗證後嘅 email**，唔再信任前端傳嘅 email
  - `doGet` 嘅錯誤全部用 `ContentService` 回 JSON（避免 HTML 錯誤頁被瀏覽器擋）
  - 有 debug log（`[doGet]` / `[getUserRoles]`）
  - 有測試函數 `__testUrlFetch`（可刪）
- `voting.gs`
  - 新增 `verifyFirebaseIdToken` + `getUserRoles` + 真正嘅 `requireAdmin(idToken)`
  - `saveOptions` / `resetPoll` 必須 admin token 先用得
  - ⚠️ 注意：投票系統暫時未重新部署（見「未完成項目」）

### 前端（已 commit + push）

- `js/auth.js`
  - 新增 `getAuthToken()` export（返回 `auth.currentUser.getIdToken()`）
  - `getUserRoles` 請求改用 `idToken`（唔再傳 `email`）
  - alert 會顯示登入 email + 後端回覆（除錯用，可保留）
- `js/api.js`
  - 所有 API 請求自動附上 `idToken`（GET 用 query、POST 用 formData）
- `js/config.js`
  - 新增 `voteScriptUrl`（投票系統獨立 URL，暫時與 `appsScriptUrl` 相同）
- `js/vote.js` / `js/admin.js`
  - 改用 `voteScriptUrl`
- `admin.html` / `js/admin.js`
  - 投票管理頁改為需 admin 登入（用 `onRoleLoaded` gate）

## 4. 部署步驟（重要，以後重新部署都係咁）

主系統 Apps Script 專案內要**同時有**：

1. `config.gs` — 必須包含 `FIREBASE_API_KEY` / `FIREBASE_PROJECT_ID`（第 3 節）
2. `fixed_main.gs`

每次改完 code：
- **Ctrl+S**
- 部署 › 管理部署作業 › ✏️ 編輯 › **版本：新版本** › 部署
  （舊版本會鎖住舊權限，一定要出新版本）

首次部署新版後要處理：

1. **授權 UrlFetchApp**：喺編輯器 Run `__testUrlFetch`（或任何會 call `UrlFetchApp` 嘅函數）→ 彈窗允許 `script.external_request` scope
2. **確認 API key 無限制**（Google Cloud Console）：應用程式限制 = 不限制；API 限制 = 不限制金鑰
   - 注意：如果 key 有 referrer 限制，server-to-server（無 Referer）會被擋 → 「API key not valid」

## 5. 測試結果（2026-08-26 已確認）

| 測試 | 結果 |
|------|------|
| GAS endpoint 無 token | `{"error":"缺少 idToken"}` |
| GAS endpoint 假 token | `{"error":"身份驗證失敗"}`（已改用 accounts:lookup） |
| `accounts:lookup` 用正確 key | 收（回 `INVALID_ID_TOKEN` 而唔係 API key not valid） |
| 真實登入 | ✅ 成功跳去 `form.html` |
| `getUserRoles("sfxsunday@gmail.com")`（編輯器直接測） | ✅ MATCH role=admin |

## 6. 關鍵設定值

```js
// js/config.js
firebase: {
  apiKey: "AIzaSyD2A4wLUBVUBKvfc_b0t1QPxye-_M1bIXY",
  authDomain: "githublogin-49a54.firebaseapp.com",
  projectId: "githublogin-49a54",
  ...
}
appsScriptUrl = "https://script.google.com/macros/s/AKfycbwYuh0JoIG3yUFCm2rL6DTbXeyaCfx-4K1kswX3gnPNNqFRwqB5cmNiqBT3RmNkXUQ/exec"
voteScriptUrl = 暫時同上（未分離）

// config.gs
PERMISSION_SPREADSHEET_ID = "1Uwa0Tis5xSVJ7D_rLNirqYZpasLeRYb3Jb7EX6HJ9IY"
PERMISSION_SHEET_NAME = "permissions"   // 表頭：role / class / email
FIREBASE_API_KEY = "AIzaSyD2A4wLUBVUBKvfc_b0t1QPxye-_M1bIXY"
FIREBASE_PROJECT_ID = "githublogin-49a54"
```

## 7. 未完成項目

- [ ] **投票系統分離**：開獨立 Apps Script 專案放 `voting.gs` + `config.gs`，取得新 `/exec` URL 後更新 `voteScriptUrl`；而家投票被主系統覆蓋住
- [ ] **API key 正式限制**（可選）：整 server-only API key 畀後端用，前端 key 先可以加返 referrer 限制
- [ ] **檢查 Google Sheets 權限**：確認三張 Sheet 唔係「anyone with link can view」公開
- [ ] **`.gs` 唔好再放返入 public repo**（已移去 `C:\Dev\SundaySchoolPortal\apps-script-backup\`）

---

# 附錄：整合專案（portal-integrated）2026-08-26

## 目的

整合兩套 GAS：
1. 網頁後端（`fixed_main.gs` + `config.gs`）
2. 後台管線（`SundaySchoolClassManagement`：StudentList / 收據 / 出席表 / 檢核 / 權限）

加埋 7 項功能：Student Detail(Form)、StudentList、收據、課堂點名、彌撒+獎勵、硬copies 點名紙、每班 Portal。

## 新專案位置

`C:\Dev\SundaySchoolPortal\apps-script-backup\portal-integrated\`

| 檔案 | 來源/功能 |
|---|---|
| `config.js` | 統一設定（CONFIG + CFG_*） |
| `auth.gs` | `verifyFirebaseIdToken` / `isAdminEmail_` |
| `web_main.gs` | `doGet`/`doPost` + 網頁 API（= fixed_main 精簡） |
| `sessions.gs` | 上堂日曆（get/save/reset） |
| `rollcall.gs` | 課堂點名（getClassRoster / getRollCall / saveRollCall / getRollCallYear） |
| `studentDetail.gs` | Form → student_details sync |
| `portal.gs` | 每班 portal 資料（links + roster + sessions + details） |
| `createStudent.js` / `createDetailList.js` / `createReceipt.js` / `createAttendance.js` / `dataValidation.js` / `mapping.js` / `accessControl.js` / `utils.js` / `Runner.js` | 管線（原樣，改咗 createAttendance 安全略過） |

## 新增 Sheets（都喺 OPERATION_SPREADSHEET_ID = 1Uwa0Tis…）

| 表 | 欄位 |
|---|---|
| `sessions` | 日期 / 類型(上課·活動·假期·停課) / 備註 |
| `rollcalls` | 日期 / 班別 / 班名 / 姓名 / 類別 / 出席(是/否) / 記錄人 / 記錄時間 |
| `student_details` | 班別 / 姓名 / 性別 / 就讀學校 / 出生年份 / 聯絡電話 / 更新時間 |
| `class_links` | 班別 / 表單連結 / 備註 |

## 新增網頁（mhsunday.github.io）

| 頁面 | 功能 |
|---|---|
| `rollcall.html` + `js/main-rollcall.js` | 當日點名 / 全年矩陣 / A4 列印點名紙（補填自動開啟） |
| `admin_sessions.html` + `js/main-sessions.js` | 管理上堂日曆（admin） |
| `class_portal.html` + `js/main-portal.js` | 每班集中 links + 快速動作 |

`js/api.js` 新增：`getSessions` / `saveSessions` / `resetSessions` / `getClassRoster` / `getRollCall` / `saveRollCall` / `getRollCallYear` / `getStudentDetails` / `getClassPortal`。

## 新增 GAS API

- GET：`getSessions` / `resetSessions`(admin) / `getClassRoster` / `getRollCall` / `getRollCallYear` / `getStudentDetails` / `getClassPortal`
- POST：`saveSessions`(admin) / `saveRollCall`（日期可為過去=補填）

## 部署步驟（整合後）

1. 喺 Apps Script 建立新專案（或開主專案），貼入 `portal-integrated\` 全部檔案（用 Ctrl+S 儲存；**唔好**將 `.clasp.json`/README 貼入）。
2. `config.js` 確認 ID；**待填**：`CFG_ATTENDANCE_OUTPUT_FOLDER_ID`（可留空=用網頁列印）、`STUDENT_FORM_RESPONSES_SPREADSHEET_ID`。
3. 部署 › 管理部署作業 › ✏️ 編輯 › 版本：新版本 › 部署，攞 `/exec` URL 更新 `js/config.js` 嘅 `appsScriptUrl`。
4. 首次授權：編輯器行 `__testUrlFetch`（UrlFetchApp）／`RUN_Sessions_ResetToSchoolYear`（Spreadsheet/Drive）。
5. 行 `RUN_Sessions_ResetToSchoolYear` 初始化日曆 → 再喺 `admin_sessions.html` 逐日改 類型/備註。
6. 建立 Google Form（班別/姓名/性別/就讀學校/出生年份/聯絡電話），將回應表 ID 填入 config，行 `RUN_SyncStudentDetail` 或加 `onFormSubmit` trigger。
7. 喺 `class_links` 表填各班表單連結（portal 頁會顯示）。
8. Push repo，GitHub Pages 自動發佈。

## 人手待辦（未做）

- [ ] 建立 Google Form 並填 `STUDENT_FORM_RESPONSES_SPREADSHEET_ID`
- [ ] `class_links` 表填入各班表單連結
- [ ] 可選：`CFG_ATTENDANCE_OUTPUT_FOLDER_ID`（想保留管線產出 Sheets 出席表先填）
- [ ] 投票系統分離仍按舊計劃（`voting.gs` 獨立專案）
