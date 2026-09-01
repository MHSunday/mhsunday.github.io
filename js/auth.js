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

// 取得目前登入使用者的 Firebase ID Token（後端需要驗證身份用）
export function getAuthToken() {
  // forceRefresh=true：手機時鐘偏差可能令 SDK 誤判 token 未過期，強制 refresh 攞新 token
  return auth.currentUser ? auth.currentUser.getIdToken(true) : Promise.resolve(null);
}

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
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  try {
    toggleLoading(true);
    if (isIOS) {
      // iOS Safari 對 popup 登入不穩定，改用 redirect 登入
      await auth.signInWithRedirect(provider);
    } else {
      await auth.signInWithPopup(provider);
    }
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
  if (currentPage === 'index.html' || currentPage === '') return;
  // 等 Firebase 還原持久化 session 先決定係咪踢返去登入頁，
  // 避免手機還原較慢時（auth.currentUser 仲係 null）誤判為未登入。
  const unsubscribe = auth.onAuthStateChanged((user) => {
    unsubscribe();
    if (!user) {
      window.location.replace('./index.html');
    }
  });
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
      // 以 ID Token 取代 email，讓後端 server-side 驗證身份
      // 用 getIdToken(true) 強制 refresh：手機時鐘偏差/長開頁面會令舊 token 過期 → 被誤判無權限
      const idToken = await user.getIdToken(true);
      const response = await fetch(
        `${APP_CONFIG.appsScriptUrl}?action=getUserRoles&idToken=${encodeURIComponent(idToken)}&t=${Date.now()}`,
        {
          method: 'GET',
          mode: 'cors',
          headers: { 'Accept': 'application/json' }
        }
      );

      if (!response.ok) throw new Error(`權限服務錯誤: ${response.status}`);

      const roleData = await response.json();
      console.log("[auth] 登入 email:", user.email);
      console.log("[auth] getUserRoles 回傳:", roleData);

      if (roleData && (roleData.role === 'admin' || roleData.role === 'teacher')) {
        userRole = roleData;
        roleLoaded = true;

        // 存入 sessionStorage 供跨頁面使用
        sessionStorage.setItem('userRole', JSON.stringify(roleData));

        roleLoadedCallbacks.forEach(cb => cb(roleData));
        roleLoadedCallbacks.length = 0;

        // 安全跳轉：使用 replace 避免回退鍵循環
        if (currentPage === 'index.html' || currentPage === '') {
          window.location.replace('./hub.html');
        }
      } else {
        // 已經有快取 role（例如跨頁導航）→ 唔好因為 refresh 失敗就踢走用戶
        if (roleLoaded && userRole) {
          console.warn("[auth] getUserRoles refresh 失敗，繼續用快取 role");
          toggleLoading(false);
          return;
        }
        const detail = roleData && roleData.error ? `｜後端回覆：${roleData.error}` : `｜回傳：${JSON.stringify(roleData)}`;
        alert(`您沒有使用此系統的權限｜登入帳號：${user.email}${detail}`);
        await logout();
      }
    } catch (err) {
      console.error("獲取權限失敗", err);
      toggleLoading(false);
      // 已經有快取 role（跨頁導航）→ 唔好因為 refresh 失敗就登出
      if (roleLoaded && userRole) {
        console.warn("[auth] getUserRoles fetch 失敗，繼續用快取 role");
        return;
      }
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