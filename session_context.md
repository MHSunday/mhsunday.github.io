# Session Context — 主日學登記系統 登入修復 + 安全強化

> 更新日期：2026-08-26（登入修復）/ 2026-08-27（Firestore 整合實作）

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
- [ ] **Firestore 整合**（Portal + 課堂點名 已實作，**未啟用/未設 rules**）：見 `plans/firestore_setup.md` + `plans/firestore_design.md` + `plans/firestore.rules`

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

---

# 附錄：Firestore 整合設計（2026-08-26）

> 完整設計文件：`plans/firestore_design.md`
> 目的：解決 `class_portal` load 過慢（>10s）嘅問題

## 背景

- 現有 GAS + Sheets 架構：`getClassPortal` 同步 fetch 4 個 sheet + `getUserRoles` 每次 read permissions → load ~10s
- 目標：Class portal load < 1s；roll call save < 500ms（40人 batch）；全年矩陣 < 1s
- 沿用現有 Firebase Auth（無需新登入）；保留 Sheets 為 roster 編輯界面

## Firestore 資料模型

```
/schools/mhsunday (singleton)
  /classes/{className}             班級 metadata
  /roster/{className}/members/{name}   學生/小導師/老師 { serial, category, className, order }
  /sessions/{date}                 主日日曆 { date, title, event, order }
  /rollcalls/{className}/{date}/{name} 點名 { present, category, recorder, timestamp }
  /studentDetails/{className}/{name}   Form 補充資料
  /classLinks/{className}           表單連結
  /permissions/{email}              角色權限 { role, classes }
```

## 重點決策

- **唔用 Firebase custom claims**（GAS 唔可以直接 call Admin SDK；rules 讀 `permissions/{email}` doc 已夠）
- **Security Rules**：roster read=isAuthed / write=admin；rollcalls + studentDetails write=admin 或 isTeacherOf(className)；permissions 只可讀自己
- **前端新增 `js/db.js`**（Firebase modular SDK）：`getRoster` / `getSessions` / `getRollCall` / `saveRollCall`(writeBatch) / `getRollCallYear` / `getStudentDetails` / `getClassLink` / `saveSession`
- **保留 GAS API**：`getAllClasses` / `recordAttendance` / `getStats` / `getAchievedStudents`（form/redeem/details 唔郁）
- **GAS Sync 工具**：`RUN_SyncRosterToFirestore` / `RUN_SyncSessionsToFirestore`（用 Firestore REST API + `ScriptApp.getOAuthToken()`，需 IAM 權限）
- **Rollback**：前端 feature flag `USE_FIRESTORE`

## 效能預期

| 操作 | 現（GAS+Sheets） | 新（Firestore） |
|---|---|---|
| Class portal load | ~10s | ~1-2s |
| Save roll call (40人) | ~3-5s | ~300ms |
| 全年矩陣 (40×42) | ~5s | ~800ms |

Free tier（50,000 reads/day）完全足夠。

## Migration Plan（Phase）

1. **設置**：啟用 Firestore、建 `permissions/sfxsunday@gmail.com`、設定 Security Rules、budget alert
2. **Sync 工具**：寫 `firestoreSync.js`、測 sync
3. **Frontend**：`js/db.js` + 改 `class_portal.html` / `rollcall.html` / `admin_sessions.html`
4. **Rollback**：feature flag 切返 GAS

## 待確認

- [ ] Firestore region（asia-east1 / asia-east2）
- [ ] `sfxsunday@gmail.com` 為 first admin
- [ ] 保留 form.html / redeem.html 用 GAS
- [ ] Security Rules：teacher 睇唔睇到其他班 roster

---

# 附錄：Firestore 整合實作（2026-08-27）

> 設計見上節「Firestore 整合設計」+ `plans/firestore_design.md`。本節記實作 + 真實踩過嘅坑。

## 範圍

**只做**「每班 Portal + 課堂點名（含出席%）」。彌撒/換領/投票/詳細資料**繼續用 GAS**（唔郁）。

## 改動檔案

### 新增

| 檔案 | 內容 |
|---|---|
| `js/db.js` | Firestore v8 資料層（roster / sessions / rollcalls / classes / classLinks / studentDetails）+ `getAttendanceStats` + `syncAllFromGAS`（Sheets→Firestore）+ `exportRollcallsToGAS`（Firestore→GAS） |
| `js/data.js` | `USE_FIRESTORE` flag adapter（portal / 點名 / 日曆都經呢度 import，rollback = 改 flag） |
| `plans/firestore.rules` | Security Rules（admin / teacher / authed） |
| `plans/firestore_setup.md` | 部署步驟 + 出席% 定義 + 決策 |
| `apps-script-backup/portal-integrated/firestoreSync.js` | 可選 GAS REST 同步工具（需 IAM，已由瀏覽器版 `syncAllFromGAS` 取代） |

### 修改

| 檔案 | 內容 |
|---|---|
| `js/config.js` | + `USE_FIRESTORE: true`（改 `false` 即時 rollback） |
| `js/main-portal.js` | 改用 `data.js` + 「本班出席率」卡片 |
| `js/main-rollcall.js` | 改用 `data.js` + 當日出席% + 全年矩陣「出席%」欄 |
| `js/main-sessions.js` | 改用 `data.js` + 瀏覽器 import 預設日曆 + 同步/匯出按鈕 |
| `class_portal.html` / `rollcall.html` / `admin_sessions.html` | + `firebase-firestore.js` CDN；admin_sessions + 同步卡片 |

## 關鍵決策

1. **沿用 Firebase v8 namespaced SDK**（CDN）—— 同現有 `auth.js` 一致，GitHub Pages 靜態部署，**無 build step**
2. **「輸出返 GAS spreadsheet」唔使改 GAS 後端**：admin 撳「匯出點名 → 試算表」→ `db.exportRollcallsToGAS()` 讀 Firestore → 調用**既有** `saveRollCall`（GAS POST）寫入營運試算表 `rollcalls` 表
3. **同步方向**：Sheets → Firestore 由 admin 喺瀏覽器做（用 admin 自己嘅 token），**唔需要 GAS service account / IAM** —— 比 GAS REST 版可靠好多
4. **出席% 定義**（可改）：分母 = 已過嘅非「假期：」開頭嘅上堂日（日期 ≤ 今日）；分子 = 出席人次。改 `js/db.js` 嘅 `getAttendanceStats`
5. **rollback**：`USE_FIRESTORE: false` 即時切返 GAS + Sheets，唔需要改其他嘢

## 真實踩過嘅坑（Rules 部署）

### 坑 1：殘留預設規則 → syntax error

貼 rules 時如果**冇 Ctrl+A → Delete** 就 paste，原本嘅預設：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

仲喺度，後面接住你嘅規則 → parser 喺錯誤位置見到 `if` → 報「Line 8: mismatched input 'if'」。

**解：編輯器一定要全清空，再貼。**

### 坑 2：Rules Playground 測試嘅係「已發佈」嘅規則

唔係編輯器現有 draft。所以「Simulated read denied」出現時，就算編輯器已經改好都仲係 deny。

**解：一定要先撳「發佈 / Publish」再去模擬器。**

### 坑 3：Auth 冇填 email → read denied

模擬器 Authentication 揀咗 Firebase Auth / Google 之後，**一定要喺 payload 填 `email`**（同你要讀嘅 doc `{email}` 一致）。淨揀 provider 唔填 email → `request.auth.token.email` 為空 → rules 條件不成立 → deny。

### 坑 4：Doc 唔存在 ≠ read denied

`permissions` 嗰條 read rule 只係 `isAuthed() && request.auth.token.email == email`，**唔 check doc 存在**。換言之未建 doc 嘅情況下 admin email 讀都應該 allowed（會收到「not found」）。

**所以一旦 deny，幾乎一定係規則錯／未發佈／未登入，唔關 doc 事。**

## Firebase Console 設定 checklist（真實做過嘅順序）

1. Firestore Database → 建立資料庫
   - Region：**asia-east2（香港）**（香港用家延遲最低；揀錯改唔到）
   - 模式：**正式模式**（Production）
2. 資料 → 開始新增集合 → `permissions`
   - 文件 ID：`sfxsunday@gmail.com`
   - 欄位：`role` = `"admin"`（string，唔好有空格）
3. Rules → Ctrl+A → Delete → 貼 `plans/firestore.rules` → **發佈**
4. Rules Playground 驗證：
   - Location：`databases/(default)/documents/permissions/sfxsunday@gmail.com`
   - Type：`get`
   - Auth：Firebase Auth，email = `sfxsunday@gmail.com`
   - 預期：`Simulated read allowed`
5. 反向測：Auth 揀「None」 → `Simulated read denied` ✅
6. Push repo → GitHub Pages 自動更新
7. 用 admin 登入 → `admin_sessions.html` → 「同步 Sheets → Firestore」（一次性，數分鐘）
8. 測試：portal load <2s、rollcall save <500s、矩陣 + 出席% 出到

## 設定值

```js
// js/config.js
firebase: { projectId: "githublogin-49a54", ... },
USE_FIRESTORE: true
```

```js
// plans/firestore.rules（isAdmin 讀呢個 doc）
permissions/sfxsunday@gmail.com  { role: "admin" }
```

## 日常用法

| 操作 | 邊個 | 點做 |
|---|---|---|
| 點名 | 老師 | `rollcall.html` → 直接寫 Firestore（<500ms） |
| 睇出席% | 老師/管理員 | `class_portal.html` 頂部卡片 + `rollcall.html` 全年矩陣「出席%」欄 |
| 加新班 / 加新學生 | 管理員 | 改 Sheets STUDENT 試算表 → admin_sessions.html → 「同步 Sheets → Firestore」 |
| 改上堂日曆 | 管理員 | `admin_sessions.html` 直接編 → 寫 Firestore |
| 點名落試算表 | 管理員 | `admin_sessions.html` → 「匯出點名 → 試算表」→ 寫返 rollcalls 表 |

## Rollback

```js
// js/config.js
USE_FIRESTORE: false
```

Commit + push。即時切返舊 GAS + Sheets 架構。Firestore 資料保留，之後可以 re-enable。

## 未做（低優先）

- [ ] Budget alert（避免爆 Firestore 免費額）
- [ ] 將「輸出回 GAS spreadsheet」自動化（cron / on-write trigger），唔使人手撳匯出
- [ ] Teacher 權限 doc 流程（依家要人手建 teacher doc + 部署 Firestore write）
- [ ] Offline persistence（Firestore SDK 內建 `enableIndexedDbPersistence`，未啟用）
- [ ] Region 最終確認（已推薦 asia-east2，但 console 要揀）
