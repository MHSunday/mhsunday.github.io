// config.js
const APP_CONFIG = {
  // 🔥 替換為你的 Firebase 設定（從 Firebase Console 取得）
  firebase: {
    apiKey: "AIzaSyD2A4wLUBVUBKvfc_b0t1QPxye-_M1bIXY",
    authDomain: "githublogin-49a54.firebaseapp.com",
    projectId: "githublogin-49a54",
    storageBucket: "githublogin-49a54.firebasestorage.app",
    messagingSenderId: "775608320556",
    appId: "1:775608320556:web:1ff2f18fd19e108dcb8789"
  },

  
  // 替換為你的 Cloud Function URL
  //apiProxyUrl: "https://us-central1-your-project.cloudfunctions.net/api",

  appsScriptUrl: "https://script.google.com/macros/s/AKfycbzBbEZzIIKRsrXNkMhGHJh4vutfLRfTMkK-Cs9pp82TEN59wvOEjA40rWnk74mGlqw/exec",

  // 投票系統獨立的 Apps Script URL（vote.html / admin.html 使用）
  // ⚠️ 仍未分離投票系統（按 session_context.md 未完成項目）；暫時同主系統指向同一 URL
  voteScriptUrl: "https://script.google.com/macros/s/AKfycbzBbEZzIIKRsrXNkMhGHJh4vutfLRfTMkK-Cs9pp82TEN59wvOEjA40rWnk74mGlqw/exec",

  // ==========================================
  // Firestore 整合開關（每班 Portal / 課堂點名 專用）
  // ==========================================
  // true  = 每班 Portal + 課堂點名 改用 Firestore（快：portal <2s、save <500ms）
  //         ⚠️ 前提：Firebase Console 已啟用 Firestore + 已部署 security rules
  //         （見 plans/firestore_setup.md），否則呢啲頁會報錯。
  // false = 用返 GAS + Sheets（舊架構，用嚟 rollback）
  USE_FIRESTORE: true
};

  // 🔥 替換為你的 Google Apps Script Web App URL
  //appsScriptUrl: "https://script.google.com/macros/s/AKfycbwYuh0JoIG3yUFCm2rL6DTbXeyaCfx-4K1kswX3gnPNNqFRwqB5cmNiqBT3RmNkXUQ/exec"


// 必須 export 才能在其他檔案 import！
export { APP_CONFIG };