// assets/js/ui-admin-shell.js
(function(global){
  const { AppState } = global;

  function renderUserUI(){
    document.getElementById("signin-container").classList.add("hidden");
    document.getElementById("user-box").classList.remove("hidden");
    document.getElementById("user-email").textContent = `${AppState.auth.email}`;
    document.getElementById("user-role").textContent = AppState.auth.role;
    const initial = (AppState.auth.email || "?").charAt(0).toUpperCase();
    const el = document.getElementById("user-initial");
    if(el) el.textContent = initial;
  }

  function clearShell(){
    document.getElementById("signin-container").classList.remove("hidden");
    document.getElementById("user-box").classList.add("hidden");
    const email = document.getElementById("user-email");
    if(email) email.textContent = "";
    const role = document.getElementById("user-role");
    if(role) role.textContent = "";
  }

  global.AdminShell = { renderUserUI, clearShell };
})(window);