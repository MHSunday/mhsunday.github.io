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

  appsScriptUrl: "https://script.google.com/macros/s/AKfycbwYuh0JoIG3yUFCm2rL6DTbXeyaCfx-4K1kswX3gnPNNqFRwqB5cmNiqBT3RmNkXUQ/exec"
};

  // 🔥 替換為你的 Google Apps Script Web App URL
  //appsScriptUrl: "https://script.google.com/macros/s/AKfycbwYuh0JoIG3yUFCm2rL6DTbXeyaCfx-4K1kswX3gnPNNqFRwqB5cmNiqBT3RmNkXUQ/exec"


// 必須 export 才能在其他檔案 import！
export { APP_CONFIG };