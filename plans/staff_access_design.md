# 校務團 Access 設計（讀取型角色）

> 日期：2026-09-11
> 狀態：**設計已拍板 ✅（2026-09-11）**，決策見第 10 節；可進入實作。
> 範圍：新增「校務團」角色，睇到 **通告** ＋ **每班同學嘅彌撒及出席統計** ＋ **上堂日曆（唯讀）**，全程唯讀。

## 1. 目標

主日學「校務團」需要一個唯讀入口，睇到：

1. **通告**（公告/檔案/活動板）— 現時所有登入用戶都睇到，校務團照用。
2. **每班同學彌撒及出席數** — 即係而家 `rollcall.html?tab=mass`（出席統計）嘅數據：每人「彌撒次數 / 出席次數 / 出席率」，但係**跨所有班、唯讀**。

校務團**唔應該**：
- 改任何資料（點名、通告、日曆）
- 睇學生補充資料（電話等私隱）、學生檔案連結（Sheet 有電話）

## 2. 角色定義

| 角色 | key | 用途 | 而家狀態 |
|---|---|---|---|
| 管理員 | `admin` | 全部權限 + 同步/發通告 | ✅ 已有 |
| 老師 | `teacher` | 自己班點名/睇資料 | ✅ 已有 |
| **校務團** | **`staff`** | **唯讀：通告 + 各班出席統計** | 🆕 新增 |

> Role key 用 **`staff`**（與 `admin`/`teacher` 英文字母風格一致；顯示名「校務團」）。✅ D1 已定

## 3. 權限範圍對照

| 功能 | admin | teacher | **staff（校務團）** |
|---|---|---|---|
| 通告·檔案 睇 | ✅ | ✅ | ✅（唯讀） |
| 通告 新增/編輯/刪除/置頂 | ✅ | ❌ | ❌ |
| 每班 Portal（自己班） | ✅ | ✅ | ❌（唔使去） |
| 出席統計（跨班、逐人） | ✅ | 自己班 | ✅（跨班、唯讀） |
| 全年矩陣 / 當日點名 | ✅ | 自己班 | ❌ |
| 上堂日曆（唯讀） | ✅ | ✅ | ✅（唯讀）✅ D6 |
| 學生補充資料（電話） | ✅ | 自己班 | ❌（私隱） |
| 同步 / 匯出（GAS⇄Firestore） | ✅ | ❌ | ❌ |

## 4. 新頁面：校務看板 `staff.html`

- **校務團登入後直接入 `staff.html`**（唔入 class_portal）。
- 版面（沿用 Tailwind + 藍色 bar 風格）：

```
┌──────────────────────────────────────────┐
│ 校務看板       通告·檔案│上堂日曆│登出   │
├──────────────────────────────────────────┤
│ 📌 通告·檔案（最近 5 條）                 │
│   [公告] 開學須知 2026-09-20         ↗    │
│   [檔案] 上課時間表                     ↗    │
│   顯示全部 → notices.html                 │
├──────────────────────────────────────────┤
│ 出席統計（所有班）                        │
│ [班級下拉 ▼]   幼兒班                     │
│ ┌──────┬────┬────────┬──────┬──────┐    │
│ │ 姓名 │類別│ 彌撒次數│出席次數│出席率│    │
│ ├──────┼────┼────────┼──────┼──────┤    │
│ │ 陳小明│學生│  12 次 │ 20 次 │ 65%  │    │
│ │ ...  │    │（／39主日）（／31堂）  │    │
│ └──────┴────┴────────┴──────┴──────┘    │
│ 每班 header：共 X 人 · 已記彌撒 Y · 已記出席 Z │
└──────────────────────────────────────────┘
```

- 統計計算**照用 `main-rollcall.js renderMass` 同一套定義**（分母：課堂 31 堂 2026-09-20~2027-05-23、彌撒 39 主日 2026-09-01~2027-05-31），保證數字同老師見到嘅一致。
- **只顯示 `category === '學生'` 嘅同學**（唔計小導師/老師）。✅ D3、D5
- 唔需要（都唔可以）儲存：冇任何 save/編輯按鈕。

## 5. 資料來源（Firestore，零 GAS 改動）

`js/db.js` 已經有齊所需函數，`main-staff.js` 直接組合：

```
classes    = await getAllClasses()          // /classes
for 每班：
  roster   = await getRoster(cls)           // /roster/{cls}/members
  year     = await getRollCallYear(cls)     // /rollcalls/{cls}/dates
sessions   = await getSessions()            // 計分母（假期/活動）
notices    = await getNotices()             // /notices
```

約 9 班 × 2 reads + sessions + notices ≈ 20 reads，free tier 綽綽有餘，load <2s。

> 可選優化（v2）：預先喺 Firestore 寫 `stats/{className}` aggregate，校務團只讀一個 doc。v1 直接現算就好。

## 6. 兩層權限（一定要兩步，同老師一樣）

### 第一層：GAS permissions 表（登入必用）
- 喺營運試算表 `1Uwa0Tis…` 嘅 `permissions` sheet（`role/class/email`）加校務團行：
  - `staff /（空白或全班代號）/ <校務團email>`
- GAS `web_main.gs getUserRoles` 要**接受 `staff` role**（而家淨係認 admin/teacher）→ 改 `apps-script-backup\portal-integrated\`，喺 GAS 編輯器部署新版本。
- 人手喺 Sheet 加就得，**唔使**行 `RUN_ImportTeachersToPermissions`（嗰個淨係導師用）。

### 第二層：Firestore permissions/{email}
- admin 喺 `admin_sessions.html` 撳「同步權限 → Firestore」→ `syncPermissionsFromGAS` 已支援任何 role，會寫 `permissions/{email} = { role:'staff', classes:[...] }`。
- （校務團唔寫 Firestore，rules 其實唔睇佢個 doc；但同步咗較一致、日後擴充安全。）

## 7. Security Rules（`plans/firestore.rules` 重出）

> ⚠️ `plans/firestore.rules` 之前喺 merge 中俾 remote 刪咗，而家係「未部署」狀態。今次順手重新整理一次，包括 `notices` 同確認 staff 讀取。

現有 rules 對 `roster/sessions/rollcalls/classLinks/studentDetails` 都係 `read: if isAuthed()`，**校務團（staff）自動符合**——因為佢有登入。所以：

- 唔需要為 staff 加任何 read 例外。
- 唯一要確保：`/notices/{id}` → `read: if isAuthed(); write: if isAdmin();`（校務團睇到但改唔到，規則層面已保證）。

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthed() {
      return request.auth != null;
    }
    function isAdmin() {
      return exists(/databases/$(database)/documents/permissions/$(request.auth.token.email))
        && get(/databases/$(database)/documents/permissions/$(request.auth.token.email)).data.role == 'admin';
    }

    match /roster/{className}/members/{name}        { allow read: if isAuthed();  allow write: if isAdmin(); }
    match /sessions/{date}                          { allow read: if isAuthed();  allow write: if isAdmin(); }
    match /rollcalls/{className}/dates/{date}       { allow read: if isAuthed();  allow write: if isAdmin() || isTeacherOf(className); }
    match /studentDetails/{className}/students/{n}  { allow read: if isAuthed();  allow write: if isAdmin() || isTeacherOf(className); }
    match /classLinks/{className}                   { allow read: if isAuthed();  allow write: if isAdmin(); }
    match /notices/{id}                             { allow read: if isAuthed();  allow write: if isAdmin(); }

    match /permissions/{email} {
      allow read:  if isAuthed() && request.auth.token.email == email;
      allow write: if isAdmin();
    }
  }
}
```

（注意：而家 `rollcalls` 實際路徑係 `rollcalls/{cls}/dates/{date}`，同舊設計文 `rollcalls/{cls}/{date}/{name}` 唔同，上面已用實際路徑。）

## 8. 檔案改動清單（實作時）

| 檔案 | 改動 |
|---|---|
| `staff.html`（**新**） | 校務看板頁面 |
| `js/main-staff.js`（**新**） | 通告列表 + 跨班出席統計（唯讀、只計學生） |
| `js/auth.js` | 接受 `staff` role；staff 登入 redirect → `staff.html` |
| `js/main-notices.js` / `notices.html` | 返回 link 按 role 指返 `staff.html` 或 `class_portal.html` |
| `js/main-calendar.js` / `calendar.html` | 角色 gate 加 `staff`（唯讀日曆，同 teacher 一樣） |
| `js/db.js` / `js/data.js` | 如需要加 1-2 個 helper（e.g. `getClassAttendance`），非必要 |
| `plans/firestore.rules`（**重新加入**） | 上述規則（含 notices） |
| `apps-script-backup\portal-integrated\web_main.gs`（**GAS，人手**） | `getUserRoles` 接受 `staff` role |

## 9. 部署步驟（實作時）

1. 改前端（第 8 節檔案）→ commit + push → GitHub Pages 自動更新。
2. GAS：改 `web_main.gs` getUserRoles 接受 staff → 部署新版本（Ctrl+S → 管理部署作業 → 新版本）。
3. 營運試算表 `permissions` sheet 加校務團行（`staff / email`）。
4. `admin_sessions.html` 撳「同步權限 → Firestore」。
5. Firebase Console：重新貼 + **發佈** `plans/firestore.rules`（含 notices）。
6. 測試：用校務團 email 登入 → 直入 `staff.html` → 睇到通告 + 各班統計；確認睇唔到編輯掣/學生電話。

## 10. 決策點（已拍板 ✅）

| # | 決策 | 結果 |
|---|---|---|
| D1 | 角色 key | **`staff`** |
| D2 | 主頁 | **新 `staff.html` 校務看板** |
| D3 | 統計粒度 | **逐班逐學生**（姓名 + 類別 + 彌撒次數 + 出席次數 + 出席率） |
| D4 | 通告權限 | **只可睇**（admin 先可寫） |
| D5 | 統計包邊啲人 | **只顯示「學生」**（唔計小導師/老師） |
| D6 | 其他功能 | **上堂日曆（唯讀）**：`calendar.html` 開放畀 staff |
