// assets/js/main.js
(function(global){
  const { APP_CONFIG, Api, AppState, UI, Admin } = global;

  window.onload = () => {
    // 設定 Google Sign-In client id
    const onloadEl = document.getElementById("g_id_onload");
    onloadEl?.setAttribute("data-client_id", APP_CONFIG.OAUTH_CLIENT_ID);

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