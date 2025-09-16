// assets/js/admin.main.js
(function(global){
  const { APP_CONFIG, Api, AppState, Admin, AdminShell } = global;

  window.onload = () => {
  const clientId = APP_CONFIG?.OAUTH_CLIENT_ID;
  if(!clientId){
    console.error("Missing APP_CONFIG.OAUTH_CLIENT_ID");
    alert("系統設定遺失：尚未設定 OAuth Client ID");
    return;
  }
  // 原本：把 client_id 填回 g_id_onload
  const onloadEl = document.getElementById("g_id_onload");
  onloadEl?.setAttribute("data-client_id", clientId);

  // 新增：用 JS 直接初始化（避免標籤法未被讀到）
  if (window.google?.accounts?.id) {
    google.accounts.id.initialize({ client_id: clientId, callback: onGoogleSignIn });
    const btn = document.querySelector(".g_id_signin");
    if (btn) {
      google.accounts.id.renderButton(btn, { theme: "outline", size: "large" });
    }
  } else {
    console.warn("Google Identity 未載入，稍後再嘗試初始化");
  }

  document.getElementById("signout")?.addEventListener("click", signOut);
  Admin.bindAdminEvents();
};

    

  global.onGoogleSignIn = async (response)=>{
    try{

	  console.log('ID Token:', response.credential?.slice(0,20) + '...');
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