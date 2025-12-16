// auth.js
import { firebaseConfig } from './config.js';

let currentUser = null;
let userRole = null;

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

export function getCurrentUser() {
  return currentUser;
}

export function getUserRole() {
  return userRole;
}

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

// 初始化監聽
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    try {
      const response = await fetch(`${APP_CONFIG.appsScriptUrl}?action=getUserRoles&email=${encodeURIComponent(user.email)}`);
      const roleData = await response.json();
      if (roleData && (roleData.role === 'admin' || roleData.role === 'teacher')) {
        userRole = roleData;
        // 如果已在 form 或 stats 頁，不跳轉
        if (window.location.pathname.endsWith('index.html')) {
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
    if (!window.location.pathname.endsWith('index.html')) {
      window.location.href = 'index.html';
    }
  }
});