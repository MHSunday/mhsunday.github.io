# 彌撒參與登記系統

一個用於教會主日學學生參與彌撒登記的 Web 應用程式，支援教師和管理員角色，具有出席登記、統計分析和獎品換領等功能。

## 功能特色

- **Google 帳號登入**：使用 Firebase Authentication 進行身分驗證
- **多角色支援**：
  - 管理員：可訪問所有班級資料
  - 教師：僅能訪問指定班級資料
- **出席登記**：
  - 標準登記模式
  - 補領登記模式（更新歷史記錄的換領狀態）
- **資料管理**：
  - 查看學生參與明細
  - 批量標記換領狀態
- **統計報表**：顯示參與人數、達成學生數等統計資訊

## 技術架構

- **前端**：HTML, CSS, JavaScript (ES6+)
- **認證**：Firebase Authentication（Google 登入）
- **後端**：Google Apps Script 作為 Web App API
- **資料儲存**：Google Sheets 作為資料庫
- **UI 框架**：Tailwind CSS

## 檔案結構

```
├── index.html          # 登入頁面
├── form.html           # 出席登記表單
├── details.html        # 學生參與明細
├── stat.html           # 統計報表
├── js/
│   ├── config.js       # Firebase 和 API 設定
│   ├── auth.js         # 身分驗證邏輯
│   ├── api.js          # API 串接函式
│   ├── main-form.js    # 登記表單邏輯
│   ├── main-details.js # 明細頁面邏輯
│   └── main-stats.js   # 統計頁面邏輯
```

## 設定說明

### Firebase 設定
1. 在 Firebase Console 建立專案
2. 啟用 Google 登入方法
3. 在 `js/config.js` 中更新 Firebase 設定：

```javascript
const APP_CONFIG = {
 firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
  },
  appsScriptUrl: "https://script.google.com/macros/s/YOUR_APPS_SCRIPT_ID/exec"
};
```

### Google Apps Script API
1. 在 Google Sheets 中建立資料表結構
2. 部署 Google Apps Script 作為 Web App
3. 在 `js/config.js` 中更新 `appsScriptUrl`

### 資料表結構
Google Sheets 中應包含以下工作表：
- `Classes`: 班級列表
- `Students`: 學生資料（班級、姓名）
- `Attendance`: 出席記錄（學生姓名、班級、參與日期、換領狀態、換領日期、教師郵件）

## 系統流程

1. 使用者透過 Google 帳號登入系統
2. 系統根據使用者郵件地址驗證其角色（管理員/教師）
3. 教師可登記所負責班級學生的出席情況
4. 管理員可查看所有班級的資料和統計資訊
5. 支援標記獎品換領狀態及補領歷史記錄

## 權限機制

- 系統會根據使用者的電子郵件地址查詢其角色
- 管理員可存取所有班級資料
- 教師僅能存取被授權的特定班級

## 資料處理

- 出席記錄包含：學生姓名、參與日期、換領狀態、換領日期
- 支援批量處理未換領記錄
- 提供詳細的參與明細表格