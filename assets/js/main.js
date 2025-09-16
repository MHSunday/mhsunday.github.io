// assets/js/main.js
(function(global){
  const { APP_CONFIG, Api, AppState, UI, Admin } = global;

  window.onload = () => {
    // 設定 Google Sign-In client id
    // assets/js/main.js
(function(global){
  const { APP_CONFIG, Api, AppState, UI, Admin } = global;

  window.onload = () => {
    // 使用 JavaScript 初始化 Google Sign-In
    google.accounts.id.initialize({
      client_id: APP_CONFIG.OAUTH_CLIENT_ID,
      callback: global.onGoogleSignIn // 確保 onGoogleSignIn 是全域函式
    });

    // 將按鈕渲染到指定的元素上
    google.accounts.id.renderButton(
      document.getElementById("google-signin-button"),
      { theme: "outline", size: "large", text: "sign_in_with", shape: "pill" } // 按鈕樣式
    );

    // 綁定 UI
    UI.bindTabs();
    UI.loadCalendar();

    // 事件：登出、選班
    document.getElementById("signout").addEventListener("click", signOut);
    document.getElementById("class").addEventListener("change", ()=> UI.loadAll());
  };

  // ... onGoogleSignIn 和 signOut 函式保持不變 ...

})(window);

    // 綁定 UI
    UI.bindTabs();
    UI.loadCalendar();

    // 事件：登出、選班
    document.getElementById("signout").addEventListener("click", signOut);
    document.getElementById("class").addEventListener("change", ()=> UI.loadAll());
  };

  // Google Sign-In callback（由 GIS 呼叫）
  global.onGoogleSignIn = async (response)=>{
    try{
      const idToken = response.credential;
      const data = await Api.whoami(idToken);
      AppState.auth = {
        idToken,
        email: data.email,
        role: data.role,
        classes: data.classes || [],
        defaultClass: data.defaultClass || ""
      };
      UI.renderUserUI();
      Admin.fillClassDropdowns();
      Admin.bindAdminEvents();
      if(AppState.auth.role === "admin"){
        await Admin.loadAdminAnnouncements();
      }
      await UI.loadAll();
    }catch(e){
      console.error(e);
      alert("登入失敗，請再試一次。");
    }
  };

  function signOut(){
    AppState.auth = { idToken:null, email:null, role:null, classes:[], defaultClass:"" };
    document.getElementById("signin-container").classList.remove("hidden");
    document.getElementById("user-box").classList.add("hidden");
    document.getElementById("user-email").textContent = "";
    document.getElementById("class").classList.add("hidden");

    // 清空畫面
    document.getElementById("ann-body").innerHTML = "";
    document.getElementById("docs-list").innerHTML = "";
    document.getElementById("reminders").innerHTML = "";
    document.getElementById("classinfo-iframe").src = "about:blank";
    document.getElementById("att-iframe").src = "about:blank";
  }

})(window);
