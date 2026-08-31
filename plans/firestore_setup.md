# Firestore 整合 — 實作設定 + 部署步驟

> 日期：2026-08-27
> 範圍：**只做 每班 Portal + 課堂點名（出席%）**，其餘（彌撒登記/換領/投票）繼續用 GAS。
> 狀態：程式碼已寫好（`js/db.js` / `js/data.js` / 三個頁面），**未啟用 Firestore、未設 rules**。

## 1. 我哋點解用 Firestore

- Class portal load：GAS 同步 fetch 4 sheets ≈ **10s** → Firestore ≈ **1-2s**
- 儲存點名（40人）：**3-5s** → **<500ms**（writeBatch）
- 全年矩陣 + 出席%：**5s** → **<1s**

## 2. 架構（呢次實作）

```
teacher 登入
   │
   ├─ 每班 Portal / 課堂點名 ── Firestore（讀寫）
   │     ├─ /classes/{className}
   │     ├─ /roster/{className}/members/{name}
   │     ├─ /sessions/{date}
   │     ├─ /rollcalls/{className}/{date}/{name}
   │     ├─ /studentDetails/{className}/students/{name}
   │     └─ /classLinks/{className}
   │
   └─ admin_sessions.html（admin 專用）：
         ├─ 「同步 Sheets → Firestore」＝ 由 GAS API 讀返 Sheets 寫入 Firestore
         └─ 「匯出點名 → 試算表」＝ 由 Firestore 讀返，行 saveRollCall 寫入 GAS rollcalls 表
```

- **沿用 Firebase v8 namespaced SDK**（`firebase-firestore.js` CDN），同現有 `auth.js` 一致，GitHub Pages 靜態部署、**無需 build step**。
- **Rollback**：`js/config.js` 嘅 `USE_FIRESTORE: true` 改做 `false` 即時切返 GAS+Sheets。

## 3. 部署步驟（一定要跟）

### Step 1 — Firebase Console 啟用 Firestore
1. https://console.firebase.google.com → 專案 `githublogin-49a54`
2. 建置 › Firestore Database › 建立資料庫
   - **位置（region）**：建議 **asia-east2（香港）**（用家喺香港）；唔得就 asia-east1（台灣）
   - 模式：**生產模式**（唔好選測試模式）

### Step 2 — 建立第一個 admin 權限 doc
1. Firestore › 資料 › 開始新增集合
   - 集合 ID：`permissions`
   - 文件 ID：`sfxsunday@gmail.com`
   - 欄位：`role` = `admin`（可加 `classes` array 留空）

### Step 3 — 部署 Security Rules
1. Firestore › 規則
2. 貼入 `plans/firestore.rules` 內容
3. 發佈

> ⚠️ 未有 admin doc + 未部署 rules 之前，所有 Firestore 寫入都會被拒（rules 嘅 isAdmin 會讀唔到）。

### Step 4 — Push repo，GitHub Pages 自動發佈

### Step 5 — Admin 同步資料
1. 用 `sfxsunday@gmail.com` 登入 → `admin_sessions.html`
2. 撳「同步 Sheets → Firestore」（逐班 fetch，需時幾分鐘，做完先算）
3. 之後每日/每星期：導師喺 `rollcall.html` 點名（直接寫 Firestore）
4. 想將點名寫返入試算表：admin 撳「匯出點名 → 試算表」

### Step 6 — 檢查
- 每班 Portal load 應 <2s；點名 save 應 <1s。

## 4. 出席% 定義（依家實作嘅）

| 項目 | 定義 |
|---|---|
| 分母 | 已過嘅「上堂日」＝ sessions 中非「假期：」開頭、且日期 ≤ 今日 |
| 分子 | 該日該人出席（present = true） |
| 每人出席% | 全年矩陣新加嘅「出席%」欄 = 出席日 ÷ 已過上堂日 |
| 當日出席% | 當日點名頁 = 出席人次 ÷ 名單人數 |
| 班級出席率 | Portal 頂部卡片 = 出席總人次 ÷ （名單 × 已過上堂日） |

想改定義（例如唔計小導師/老師、或只計返「上課」類型），改 `js/db.js` 嘅 `getAttendanceStats` 同 `main-rollcall.js` 嘅 `eligibleDays`。

## 5. 點名「輸出返 GAS spreadsheet」

- **即時**：每班 portal 同點名都係直接寫 Firestore（快）。
- **輸出返試算表**：admin 喺 `admin_sessions.html` 撳「匯出點名 → 試算表」。
  - `js/db.js` 嘅 `exportRollcallsToGAS()` 讀 Firestore → 逐班逐日 call 現有 `saveRollCall`（GAS）
  - 寫入營運試算表（`1Uwa0Tis…`）嘅 `rollcalls` 表（日期/班別/班名/姓名/類別/出席/記錄人/記錄時間）
  - **唔需要改 GAS 後端**（沿用現有 `saveRollCall` POST endpoint）

## 6. 有咩檔案改咗 / 加咗

| 檔案 | 變動 |
|---|---|
| `js/config.js` | + `USE_FIRESTORE` flag（預設 true） |
| `js/db.js` | **新**：Firestore 資料層 + 出席% + 同步/匯出 |
| `js/data.js` | **新**：flag 切換 adapter（portal/點名/日曆都經呢度） |
| `js/main-portal.js` | 改用 data.js + 班級出席率卡片 |
| `js/main-rollcall.js` | 改用 data.js + 當日% + 全年矩陣「出席%」欄 |
| `js/main-sessions.js` | 改用 data.js + import 預設日曆（瀏覽器版）+ 同步/匯出按鈕 |
| `class_portal.html` / `rollcall.html` / `admin_sessions.html` | + firebase-firestore.js |
| `admin_sessions.html` | + Firestore 同步卡片（syncBtn / exportBtn） |
| `plans/firestore.rules` | **新**：Security Rules |
| `apps-script-backup/portal-integrated/firestoreSync.js` | **新（可選）**：GAS REST 版同步（需 IAM） |

## 7. 仲未做（人手）

- [ ] 啟用 Firestore（region：asia-east2 建議）
- [ ] 建 `permissions/sfxsunday@gmail.com` admin doc
- [ ] 部署 `plans/firestore.rules`
- [ ] 同步完再開比老師用；必要時 `USE_FIRESTORE=false` 快速 rollback
- [ ] （可選）刪走/保留 `js/data.js` 嘅 GAS fallback
