import { APP_CONFIG } from './config.js';

let currentUser = null;
let userRole = null;
let roleLoaded = false;
const roleLoadedCallbacks = [];

// 狀態鎖：防止在處理重定向結果時觸發自動跳轉
let isProcessingRedirect = true;

console.log("📦 auth.js loaded");

if (!firebase.apps.length) {
  firebase.initializeApp(APP_CONFIG.firebase);
}
const auth = firebase.auth();

// 強制設定持久化為 LOCAL，確保在跨網域跳轉後資訊不遺失
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

export function getCurrentUser() { return currentUser; }
export function getUserRole() { return userRole; }

/**
 * 控制載入動畫顯示/隱藏
 */
function toggleLoading(show) {
  const overlay = document.getElementById('authLoadingOverlay');
  if (overlay) {
    overlay.style.display = show ? 'flex' : 'none';
  }
  // 同時禁用登入按鈕防止重複點擊
  const loginBtn = document.querySelector('button'); // 假設 index.html 只有一個主要按鈕
  if (loginBtn && loginBtn.textContent.includes('Google')) {
    loginBtn.disabled = show;
    loginBtn.style.opacity = show ? '0.5' : '1';
  }
}

/**
 * 核心修正：處理重定向結果
 * 當頁面從 Google 登入跳轉回來時，必須呼叫此方法來「捕捉」登入資訊
 */
async function initAuth() {
  try {
    const result = await auth.getRedirectResult();
    if (result.user) {
      console.log("✅ 重定向登入成功:", result.user.email);
      toggleLoading(true); // 開始驗證權限，顯示 Loading
      // 登入成功後，onAuthStateChanged 會隨後觸發
    } else {
      console.log("ℹ️ 無掛起的重定向結果");
    }
  } catch (error) {
    console.error("❌ 重定向解析錯誤:", error);
    toggleLoading(false);
    if (error.code === 'auth/cross-origin-auth-not-supported') {
      alert("您的瀏覽器限制了跨站登入，請嘗試關閉「防止跨網站追蹤」或改用彈出視窗登入。");
    }
  } finally {
    isProcessingRedirect = false;
    // 手動觸發一次檢查，確保如果沒有登入動作，也能正確導向
    checkInitialState();
  }
}

// 立即執行初始化
initAuth();

export async function login() {
  const provider = new firebase.auth.GoogleAuthProvider();
  // 強制要求選擇帳號，避免自動登入舊帳號導致的 Session 混亂
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    //await auth.signInWithRedirect(provider);
    toggleLoading(true);
    await auth.signInWithPopup(provider);
  } catch (error) {
    console.error("Login error:", error);
    toggleLoading(false); // 失敗則關閉 Loading
    alert("登入失敗：" + (error.message || error.code));
  }
}

export async function logout() {
  try {
    toggleLoading(true);
    await auth.signOut();
    sessionStorage.clear(); // 清除快取的權限資訊
    window.location.replace('./index.html');
  } catch (error) {
    toggleLoading(false);
    console.error("Logout error:", error);
  }
}

export function onRoleLoaded(callback) {
  if (roleLoaded && userRole) {
    callback(userRole);
  } else {
    roleLoadedCallbacks.push(callback);
  }
}

// 檢查初始狀態的輔助函數
function checkInitialState() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  if (!auth.currentUser && !isProcessingRedirect) {
    if (currentPage !== 'index.html' && currentPage !== '') {
      window.location.replace('./index.html');
    }
  }
}

// --- 登入狀態監聽 ---
auth.onAuthStateChanged(async (user) => {
  console.log("User state changed:", user ? "LOGGED_IN" : "LOGGED_OUT");

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  if (user) {
    currentUser = user;
    toggleLoading(true); // 確保在 fetch 前顯示 Loading

    // 如果已經有快取的 Role，先通知 UI 減少閃爍
    const cachedRole = sessionStorage.getItem('userRole');
    if (cachedRole) {
      userRole = JSON.parse(cachedRole);
      roleLoaded = true;
      roleLoadedCallbacks.forEach(cb => cb(userRole));
    }

    try {
      // 修正 CORS：加入 timestamp 避免 GAS 緩存，並明確設定 mode: 'cors'
      const response = await fetch(
        `${APP_CONFIG.appsScriptUrl}?action=getUserRoles&email=${encodeURIComponent(user.email)}&t=${Date.now()}`,
        {
          method: 'GET',
          mode: 'cors',
          headers: { 'Accept': 'application/json' }
        }
      );

      if (!response.ok) throw new Error(`權限服務錯誤: ${response.status}`);

      const roleData = await response.json();

      if (roleData && (roleData.role === 'admin' || roleData.role === 'teacher')) {
        userRole = roleData;
        roleLoaded = true;

        // 存入 sessionStorage 供跨頁面使用
        sessionStorage.setItem('userRole', JSON.stringify(roleData));

        roleLoadedCallbacks.forEach(cb => cb(roleData));
        roleLoadedCallbacks.length = 0;

        // 安全跳轉：使用 replace 避免回退鍵循環
        if (currentPage === 'index.html' || currentPage === '') {
          window.location.replace('./form.html');
        }
      } else {
        alert("您沒有使用此系統的權限");
        await logout();
      }
    } catch (err) {
      console.error("獲取權限失敗", err);
      toggleLoading(false);
      // 網路錯誤時不立即登出，給予重試機會
      if (!navigator.onLine) {
        alert("網路連線中斷，請檢查網路設定");
      } else {
        alert("系統權限驗證失敗");
        await logout();
      }
    }
  } else {
    // 如果不是正在處理 Redirect，且確實沒有 user，才踢回首頁
    if (!isProcessingRedirect) {
      currentUser = null;
      userRole = null;
      roleLoaded = false;
      sessionStorage.removeItem('userRole');
      toggleLoading(false);
      if (currentPage !== 'index.html' && currentPage !== '') {
        window.location.replace('./index.html');
      }
    }
  }
});