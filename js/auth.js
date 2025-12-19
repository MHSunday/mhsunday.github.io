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
export function getCurrentUser() { return currentUser; }
export function getUserRole() { return userRole; }

export async function login() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (error) {
    console.error("Login error:", error);
    alert("登入失敗：" + error.message);
  }
}

export async function logout() {
  await auth.signOut();
  window.location.href = 'index.html';
}

export function onRoleLoaded(callback) {
  if (roleLoaded && userRole) {
    callback(userRole);
  } else {
    roleLoadedCallbacks.push(callback);
  }
}

// --- 登入狀態監聽 ---
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
        // 通知所有等待者
        roleLoadedCallbacks.forEach(cb => cb(roleData));
        roleLoadedCallbacks.length = 0;

        // 跳轉到表單頁（如果在首頁）
        const path = window.location.pathname;
        if (path === '/' || path.endsWith('/index.html')) {
          window.location.href = 'form.html';
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
    if (!window.location.pathname.endsWith('/index.html')) {
      window.location.href = 'index.html';
    }
  }
});