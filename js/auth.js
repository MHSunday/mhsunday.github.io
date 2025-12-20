// js/auth.js
import { APP_CONFIG } from './config.js';

let currentUser = null;
let userRole = null;
let roleLoaded = false;
const roleLoadedCallbacks = [];

// 🔥 初始化 Firebase（使用 HTML 引入的全域 firebase）
if (!firebase.apps.length) {
  firebase.initializeApp(APP_CONFIG.firebase);
}
const auth = firebase.auth();

// --- 匯出的函式 ---
export function getCurrentUser() {
  return currentUser;
}

export function getUserRole() {
  return userRole;
}

// ✅ 一律使用 signInWithRedirect（行動裝置相容）
export async function login() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithRedirect(provider);
  } catch (error) {
    console.error("Login error:", error);
    alert("登入失敗：" + (error.message || error.code));
  }
}

export async function logout() {
  await auth.signOut();
  // 跳轉到首頁（使用相對路徑，相容 GitHub Pages）
  window.location.href = 'index.html';
}

export function onRoleLoaded(callback) {
  if (roleLoaded && userRole) {
    callback(userRole);
  } else {
    roleLoadedCallbacks.push(callback);
  }
}

// --- 處理 Redirect 登入結果（非必需，但可除錯）---
auth.getRedirectResult().catch(error => {
  if (error.code !== 'auth/redirect-cancelled-by-user') {
    console.error("Redirect login error:", error);
  }
});

// --- 登入狀態監聽 ---
// 在 onAuthStateChanged 中，替換跳轉部分
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    try {
      const response = await fetch(
        `${APP_CONFIG.appsScriptUrl}?action=getUserRoles&email=${encodeURIComponent(user.email)}`
      );
      const roleData = await response.json();

      if (roleData && (roleData.role === 'admin' || roleData.role === 'teacher')) {
        userRole = roleData;
        roleLoaded = true;
        roleLoadedCallbacks.forEach(cb => cb(roleData));
        roleLoadedCallbacks.length = 0;

        // 🔑 修正跳轉邏輯
        const currentPage = window.location.pathname.split('/').pop();
        if (!['form.html', 'stat.html', 'details.html'].includes(currentPage)) {
          window.location.href = './form.html'; // ✅ 相對路徑
        }
      } else {
        alert("您沒有使用此系統的權限");
        await auth.signOut();
      }
    } catch (err) {
      console.error("獲取權限失敗", err);
      alert("系統錯誤，請稍後再試");
      await auth.signOut();
    }
  } else {
    currentUser = null;
    userRole = null;
    roleLoaded = false;

    // 未登入時跳回首頁
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage !== 'index.html' && currentPage !== '') {
      window.location.href = './index.html';
    }
  }
});