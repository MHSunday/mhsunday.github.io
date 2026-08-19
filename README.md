# 彌撒參與登記系統 (Sunday School Portal)

一個用於主日學學生參與彌撒登記的 Web 應用程式，支援教師與管理員角色，提供出席登記、禮物頒發、補領、統計報表等功能。所有資料以 Google Sheets 作為資料庫，透過 Google Apps Script 對外提供 API。

## 目錄

- [功能特色](#功能特色)
- [系統架構](#系統架構)
- [技術棧](#技術棧)
- [目錄結構](#目錄結構)
- [資料庫結構 (Google Sheets)](#資料庫結構-google-sheets)
- [API 端點](#api-端點)
- [頁面一覽](#頁面一覽)
- [設定說明](#設定說明)
- [部署流程](#部署流程)
- [權限與角色](#權限與角色)
- [快取與效能](#快取與效能)

---

## 功能特色

### 1. Google 帳號登入
- Firebase Authentication + Google OAuth。
- 未登入用戶會被自動導回 `index.html`。

### 2. 多角色支援
- **管理員 (admin)**：可訪問所有班級、所有統計、批次頒發、列印未頒發名單。
- **教師 (teacher)**：僅能訪問被授權的單一班級，僅能登記與查看自己班級的資料。

### 3. 出席登記 (`form.html`)
- 自動完成下拉 (autocomplete) 選學生。
- 日期驗證：只接受「星期日」(後端雙重檢查)。
- 同一班 / 學生 / 日期重複登記會被擋下。
- 可勾選「已換領獎品」並填寫換領日期。

### 4. 補領與批次頒發 (`redeem.html` / `redeem_simplified.html`)
- 列出所有「未換領」紀錄，依班級、日期篩選。
- 可全選、批次更新換領日期 (`batchUpdateRedeemStatus`)。
- 亦可單筆更新 (`updateRedeemStatus`)。

### 5. 學生參與明細 (`details.html`)
- 顯示單一班級所有紀錄，未換領者可一次過全選並批次標記。

### 6. 統計報表 (`stat.html` / `combined_stats_report.html`)
- 三頁籤：統計摘要 / 達成換領條件名單 / 未頒發禮物名單。
- 達成條件可在後端 `ACHIEVEMENT_THRESHOLD` 設定 (目前為 1)。
- 全局視圖：已授予 / 未授予禮物總數。

### 7. 待兌換學生報告 (`class_redemption_report.html`)
- 以「班名 (className)」為單位分組顯示未換領清單。

### 8. 未頒發 A4 直式列印版 (`unredeemed_print.html`)
- 班級下拉過濾，按班分組；同名多筆以 ×2、×3 標示次數。
- 每班小計、頂部與底部合計；`@page A4 portrait`、`page-break-inside: avoid` 避免跨頁切斷表格。
- 工具列可選班級並呼叫瀏覽器列印對話框（另存 PDF）。

### 9. 管理後台 (`admin.html` + `assets/`)
- 公告管理、權限設定、系統維護 (使用 Tailwind 自有風格)。

---

## 系統架構

```
┌────────────────────────┐        ┌──────────────────────────┐        ┌────────────────────────┐
│  Browser (GitHub Pages)│ HTTPS  │   Google Apps Script     │  API   │   Google Sheets        │
│  - HTML / CSS / JS     │◀──────▶│   (fixed_main.gs)        │◀──────▶│   - Students (per cls) │
│  - Firebase Auth       │ JSON   │   - REST-like doGet/doPost│       │   - Attendances        │
│  - ES6 Modules         │        │   - 5 min Cache          │        │   - Permissions        │
└────────────────────────┘        └──────────────────────────┘        └────────────────────────┘
```

---

## 技術棧

| 層級 | 技術 |
|---|---|
| 靜態託管 | GitHub Pages (`mhsunday.github.io`) |
| 前端 | HTML5, CSS3, 原生 JavaScript ES6+ (modules) |
| CSS | Tailwind CSS (CDN)、自寫 CSS |
| 字型 | Google Fonts (Noto Sans TC) |
| 認證 | Firebase Authentication (compat SDK 10.12.x / 8.10.1，視頁面) |
| 後端 | Google Apps Script Web App (`doGet` / `doPost`) |
| 資料庫 | Google Sheets (3 個檔案：學生 / 出席 / 權限) |
| 快取 | Apps Script `CacheService` (2~5 分鐘) |
| 瀏覽器 API | `fetch`, `URLSearchParams`, `localStorage`, `sessionStorage`, `print`, `Web Speech`(語音頁) |

> 部分頁面 (`form.html`, `class_redemption_report.html`) 仍用 Firebase 8.10.1 SDK；其餘已升級 10.12.x compat 版。

---

## 目錄結構

```
.
├── index.html                  # 登入頁 (Firebase Google 登入)
├── indexBase.html              # 主日學教師平台入口 (備用)
├── index2.html                 # 舊版 Google 登入測試
│
├── form.html                   # 出席登記
├── details.html                # 學生參與明细
├── stat.html                   # 統計報表 (舊版)
├── combined_stats_report.html  # 統計報告 (新版三頁籤)
├── class_redemption_report.html# 按班名分組待兌換報告
├── redeem.html                 # 補領管理 (含明細)
├── redeem_simplified.html      # 簡化版頒發禮物管理
├── unredeemed_print.html       # 未頒發 A4 直式列印版 (新)
│
├── bingo.html                  # BINGO 互動遊戲
├── luckydraw.html              # 互動抽獎
├── seatPlan.html               # 禮堂座位安排
├── trip.html / nantou2.html    # 行程相關
├── voice.html / test*.html     # 測試頁 (Web Speech 等)
│
├── js/                         # 前端 ES 模組
│   ├── config.js               # Firebase + Apps Script URL 設定
│   ├── auth.js                 # Firebase Auth / 角色快取 / 守衛
│   ├── api.js                  # 與 Apps Script 通訊的 fetch 包裝
│   ├── main-form.js            # form.html 控制器
│   ├── main-details.js         # details.html 控制器
│   ├── main-stats.js           # stat.html 控制器
│   ├── main-combined-stats.js  # combined_stats_report.html 控制器
│   └── main-redeem.js          # redeem.html / redeem_simplified.html 控制器
│
├── assets/                     # admin.html 使用的後台資源
│   ├── css/
│   │   ├── styles.css
│   │   └── autocomplete.css
│   └── js/
│       ├── main.js             # 應用入口 (tab/state)
│       ├── admin.main.js       # 公告管理主邏輯
│       ├── admin.js            # 後台 API 整合
│       ├── api.js              # 後台 fetch 介面
│       ├── config.js           # 後台 GAS 設定
│       ├── state.js            # 全域狀態 store
│       └── ui.js, ui-admin-shell.js
│
├── config.gs                   # Apps Script 常數 (Spreadsheet ID)
├── fixed_main.gs               # Apps Script 後端主程式 (doGet/doPost)
│
├── 2026StudentList.csv         # 範例學生名單 (班級, 姓名)
├── mixkit-*.mp3                # 音效素材
│
├── plans/                      # 系統規格、效能優化、變更計劃文件
└── README.md                   # 本檔
```

---

## 資料庫結構 (Google Sheets)

### Sheet 1：學生名單 (`STUDENT_SPREADSHEET_ID`)
多工作表結構 — **每張工作表 = 一個班級類別**，表內含以下欄位：

| 欄位 | 說明 |
|---|---|
| 序號 | 學生編號 |
| 類別 | `學生` / 其他 (後端只取類別 = `學生` 者) |
| 姓名 | 學生姓名 |
| 班名 | 顯示用的班名 (如「聖依納爵•羅耀拉」) |

> 工作表名稱 (`sheetName`) 才是 `班級類別`；`班名` 是資料行。系統設計上一個工作表可包含多個班名的學生。
> 範例 CSV：`2026StudentList.csv` 提供匯入格式參考。

### Sheet 2：權限表 (`PERMISSION_SPREADSHEET_ID` › `permissions`)

| email | role | class |
|---|---|---|
| user@example.com | admin | *(留空)* |
| teacher@example.com | teacher | 班級A |

`role` 為 `admin` 或 `teacher`；教師的 `class` 為其被授權的班級類別。

### Sheet 3：出席 / 換領紀錄 (`ATTENDANCE_SPREADSHEET_ID` › `attendances`)

| # | 欄位 | 說明 |
|---|---|---|
| 1 | 班級 | 班級類別 (對應學生工作表名) |
| 2 | 學生姓名 | |
| 3 | 登記日期 | `yyyy-MM-dd`；必須為星期日 |
| 4 | 已換領 | `是` / `否` |
| 5 | 換領日期 | `yyyy-MM-dd` (勾已換領時必填) |
| 6 | Email | 登入的教師 / 管理員 email |
| 7 | 登記時間 | ISO timestamp |
| 8 | 班名 | 學生所屬的班名 (從學生表取得) |

> 「班名」欄是後續為支援「按班名分組報告」所加入；舊資料可為空。

---

## API 端點

由 `fixed_main.gs` 透過 `doGet` / `doPost` 對應 URL query string：

### GET

| Action | 參數 | 用途 |
|---|---|---|
| `getUserRoles` | `email` | 取得角色與班級 |
| `getAllClasses` | — | 所有班級 (工作表名) |
| `getStudentsByClass` | `class` | 該班學生 |
| `getAllStudents` | `email` | 全部班級學生 (僅 admin) |
| `getStats` | `email`, `class` | 統計數字 |
| `getAttendanceDetails` | `email`, `class` | 出席明細 |
| `getUnredeemedRecords` | `email` | 未換領清單 (僅 admin) |
| `getAchievedStudents` | `email`, `class` | 達成換領條件者 |
| `getClassBasedPendingRedemptionReport` | `email` | 按班名分組待兌換 |
| `getGlobalRedemptionStats` | `email` | 全局已 / 未換領 |

### POST

| Action | Body | 用途 |
|---|---|---|
| `recordAttendance` | 表單 | 新增出席紀錄 |
| `updateRedeemStatus` | 表單 | 補領單筆 |
| `batchUpdateRedeemStatus` | `records` JSON 字串 | 批次補領 |

> 所有 POST 內容可為 `application/json` 或 `application/x-www-form-urlencoded`；`js/api.js` 採用後者以避免 CORS preflight。

---

## 頁面一覽

| 頁面 | 角色 | 入口 | 主要 JS | 對應後端 |
|---|---|---|---|---|
| `index.html` | 公開 | 預設 | `js/auth.js` | — |
| `form.html` | 教師 / 管理員 | 登入後自動跳轉 | `js/main-form.js` | `recordAttendance` |
| `details.html` | 教師 / 管理員 | form 連結 | `js/main-details.js` | `getAttendanceDetails`, `updateRedeemStatus` |
| `stat.html` | 教師 / 管理員 | 導覽列 | `js/main-stats.js` | `getStats`, `getAchievedStudents`, `getUnredeemedRecords` |
| `combined_stats_report.html` | 教師 / 管理員 | 導覽列 | `js/main-combined-stats.js` | 同上 + `getGlobalRedemptionStats` |
| `redeem.html` | 教師 / 管理員 | 導覽列 | `js/main-redeem.js` | `updateRedeemStatus` |
| `redeem_simplified.html` | 管理員 | 導覽列 | `js/main-redeem.js` | `batchUpdateRedeemStatus`, `getUnredeemedRecords` |
| `class_redemption_report.html` | 管理員 | 導覽列 | `assets/js/api.js` | `getClassBasedPendingRedemptionReport` |
| `unredeemed_print.html` | 管理員 | 從統計報告按鈕進入 | 內嵌 | `getUnredeemedRecords` |
| `admin.html` | 管理員 | 直接 URL | `assets/js/*.js` | 公告 / 權限管理 API |

---

## 設定說明

### Firebase (`js/config.js`)

```js
const APP_CONFIG = {
  firebase: {
    apiKey: "...",
    authDomain: "githublogin-49a54.firebaseapp.com",
    projectId: "githublogin-49a54",
    storageBucket: "githublogin-49a54.firebasestorage.app",
    messagingSenderId: "...",
    appId: "..."
  },
  appsScriptUrl: "https://script.google.com/macros/s/<SCRIPT_ID>/exec"
};
```

- Firebase Console 啟用 **Google** 登入方式。
- 將授權網域加入 Firebase Authentication → Sign-in method → Authorized domains (如 `localhost`, `*.github.io`)。

### Google Apps Script (`config.gs`)

```js
const CONFIG = {
  STUDENT_SPREADSHEET_ID:   "<學生總表 ID>",
  PERMISSION_SPREADSHEET_ID:"<權限表 ID>",
  PERMISSION_SHEET_NAME:    "permissions",
  ATTENDANCE_SPREADSHEET_ID:"<出席 / 換領表 ID>",
  ATTENDANCE_SHEET_NAME:    "attendances"
};
```

> 預設 `PERMISSION_SPREADSHEET_ID` 與 `ATTENDANCE_SPREADSHEET_ID` 指向同一個檔案 (兩張工作表)。可視需要拆分。

### Web App 部署

1. Apps Script 編輯器 → **部署 › 新增部署作業**。
2. 類型：**網頁應用程式**。
3. 執行身分：**我 (擁有者)**；存取權限：**任何人** (因為 GitHub Pages 是公開站台)。
4. 取得 `/exec` URL，貼回 `js/config.js` 的 `appsScriptUrl`。

---

## 部署流程

1. 在 Google Sheets 建立三份檔案，依上述欄位建表。
2. 把 `config.gs` 與 `fixed_main.gs` 合併到 Apps Script 專案。
3. 設定 `CONFIG.*` ID 並部署 Web App。
4. 修改 `js/config.js` 的 Firebase 與 Apps Script URL。
5. Push 到 `mhsunday.github.io`，GitHub Pages 自動發佈。
6. 在 Firebase Console 將 `*.github.io` 加進 Authorized domains。
7. 在權限表 (`permissions`) 加入使用者 email 與角色。

---

## 權限與角色

- `js/auth.js` 透過 `onAuthStateChanged` 監聽登入狀態。
- 未登入時非 `index.html` 會被 `window.location.replace('./index.html')` 踢回。
- 已登入但無 email 對應的角色時，呼叫 `logout()` 並提示「您沒有使用此系統的權限」。
- 角色資料以 `sessionStorage.userRole` 快取，避免每頁重複 fetch。
- 每個後端 API 都會再次檢查 `email` 對應的角色，不信任前端。

| 角色 | 可做 |
|---|---|
| teacher | 登記、查看、補領 — **僅限 `class = 自己班級`** |
| admin | 全部上述 + 全部班級統計 + 未頒發清單 + 批次頒發 + 列印 |

---

## 快取與效能

後端使用 Apps Script `CacheService` 將讀取結果快取 5 分鐘 (統計) 或 2 分鐘 (補領寫入後相關 cache)。

```js
cache.put(cacheKey, JSON.stringify(data), 5 * 60); // 秒
```

每次寫入 (`recordAttendance` / `updateRedeemStatus` / `batchUpdateRedeemStatus`) 都會主動 `cache.remove()` 對應鍵，確保下次讀取為最新資料。

---

## 已知限制

1. **跨網域登入**：使用 Firefox 的「加強型追蹤保護」可能擋掉 Google 登入；建議用 Chrome 或關閉該選項。
2. **CORS**：Apps Script Web App 預設不支援自訂 header；前端一律用 `application/x-www-form-urlencoded` POST 以避免 preflight。
3. **Google Sheets 容量**：每張工作表上限 ~1000 萬列；以本系統使用量遠低於此。
4. **達成條件閾值**：寫死在 `fixed_main.gs` 的 `ACHIEVEMENT_THRESHOLD = 1`，需改後端再部署。

---

## 維運小抄

- 重置某學生資料：直接編輯 Google Sheets。
- 清除 Apps Script 快取：Apps Script 編輯器 → 執行 `CacheService.getScriptCache().removeAll()`。
- 新增班級：在學生總表新增工作表，依 `序號 / 類別 / 姓名 / 班名` 欄位填寫即可，無需改後端。
- 角色異動：直接修改 `permissions` 工作表，使用者下次登入 / 重新整理時生效 (sessionStorage 過期後)。