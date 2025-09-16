// assets/js/main.js
(function(global){
  // 從全域物件中解構出需要的模組
  const { APP_CONFIG, Api, AppState, UI, Admin } = global;

  // 當整個頁面（包括所有資源）載入完成後執行
 // main.js
window.onload = () => {
  // 1. 初始化 Google Sign-In (這部分仍然需要)
  if (window.google?.accounts?.id && APP_CONFIG?.OAUTH_CLIENT_ID) {
    google.accounts.id.initialize({
      client_id: APP_CONFIG.OAUTH_CLIENT_ID,
      callback: global.onGoogleSignIn,
      ux_mode: 'redirect' // <--- 新增這一行
});
    });
  } else {
    console.error("Google GSI 腳本或 OAUTH_CLIENT_ID 未載入，無法初始化登入功能。");
  }

  // 2. 移除 renderButton 的呼叫，因為 HTML 會自動處理
  // google.accounts.id.renderButton(...)  <-- 刪除這一段

  // 3. 綁定 UI 事件 (保持不變)
  UI.bindTabs();
  UI.loadCalendar();

  // 4. 綁定其他全域事件 (保持不變)
  document.getElementById("signout").addEventListener("click", signOut);
  document.getElementById("class").addEventListener("change", () => UI.loadAll());
};

  // Google Sign-In callback（由 Google 的腳本在登入成功後呼叫）
  global.onGoogleSignIn = async (response) => {
    try {
      const idToken = response.credential;
      const data = await Api.whoami(idToken); // 驗證 token 並取得使用者資料

      // 將使用者資料存入全域狀態
      AppState.auth = {
        idToken,
        email: data.email,
        role: data.role,
        classes: data.classes || [],
        defaultClass: data.defaultClass || ""
      };

      // 更新 UI 介面
      UI.renderUserUI();
      Admin.fillClassDropdowns(); // 填充管理介面的班級下拉選單
      Admin.bindAdminEvents();

      // 如果是管理員，載入管理員專屬的公告列表
      if (AppState.auth.role === "admin") {
        await Admin.loadAdminAnnouncements();
      }
      
      // 載入所有與使用者相關的資料（公告、文件等）
      await UI.loadAll();

    } catch (e) {
      console.error(e);
      alert("登入失敗，請再試一次。");
    }
  };

  // 登出函式
  function signOut() {
    // 1. 清除全域狀態中的認證資訊
    AppState.auth = { idToken: null, email: null, role: null, classes: [], defaultClass: "" };

    // 2. 還原 UI 到登出狀態
    document.getElementById("signin-container").classList.remove("hidden");
    document.getElementById("user-box").classList.add("hidden");
    document.getElementById("user-email").textContent = "";
    document.getElementById("class").classList.add("hidden");

    // 3. 清空頁面上的資料
    document.getElementById("ann-body").innerHTML = "";
    document.getElementById("docs-list").innerHTML = "";
    document.getElementById("reminders").innerHTML = "";
    document.getElementById("classinfo-iframe").src = "about:blank";
    document.getElementById("att-iframe").src = "about:blank";

    // 4. 如果管理員分頁存在，也將其隱藏
    const adminTab = document.querySelector('.tab[data-tab="admin"]');
    if (adminTab) {
      adminTab.classList.add("hidden");
    }
  }

})(window);


