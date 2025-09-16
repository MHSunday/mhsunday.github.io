// assets/js/admin.main.js
(function(global){
  const { APP_CONFIG, Api, AppState, Admin, AdminShell } = global;

  window.onload = () => {
    const onloadEl = document.getElementById("g_id_onload");
    onloadEl?.setAttribute("data-client_id", APP_CONFIG.OAUTH_CLIENT_ID);
    document.getElementById("signout").addEventListener("click", signOut);

    // Wire admin events (save/clear/reload)
    Admin.bindAdminEvents();
  };

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
      if(AppState.auth.role !== "admin"){
        alert("僅限管理員使用此頁面。");
        return signOut();
      }
      AdminShell.renderUserUI();
      Admin.fillClassDropdowns();
      await Admin.loadAdminAnnouncements();
    }catch(e){
      console.error(e);
      alert("登入失敗，請再試一次。");
    }
  };

  function signOut(){
    AppState.auth = { idToken:null, email:null, role:null, classes:[], defaultClass:"" };
    AdminShell.clearShell();
  }
})(window);