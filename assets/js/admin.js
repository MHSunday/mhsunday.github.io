// assets/js/admin.js
(function(global){
  const { AppState, Api, UI, APP_CONFIG } = global;

  function fillClassDropdowns(){
    const adminClassSel = document.getElementById("a-class");
    adminClassSel.innerHTML = '<option value="">選擇班級（或留白改用下列對象）</option>';
    const src = (AppState.auth.classes && AppState.auth.classes.length) ? AppState.auth.classes : APP_CONFIG.DEFAULT_CLASSES;
    src.forEach(c=>{
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      adminClassSel.appendChild(opt);
    });
  }

  function clearForm(){
    AppState.editAnnId = null;
    document.getElementById("a-title").value = "";
    document.getElementById("a-body").value = "";
    document.getElementById("a-audience").value = "All";
    document.getElementById("a-class").value = "";
    document.getElementById("a-priority").value = "normal";
    document.getElementById("a-start").value = "";
    document.getElementById("a-end").value = "";
  }

  function buildAudience(){
    const cls = document.getElementById("a-class").value.trim();
    if(cls) return cls; // 以班級為主
    return document.getElementById("a-audience").value || "All";
  }

  async function saveAnnouncement(){
    if(AppState.auth.role!=="admin"){
      alert("僅管理員可操作。");
      return;
    }
    const payload = {
      id: AppState.editAnnId,
      Title: document.getElementById("a-title").value.trim(),
      Body: document.getElementById("a-body").value.trim(),
      Audience: buildAudience(),
      Priority: document.getElementById("a-priority").value,
      StartDate: document.getElementById("a-start").value,
      EndDate: document.getElementById("a-end").value
    };
    if(!payload.Title){ alert("標題為必填。"); return; }
    try{
      const res = await Api.saveAnnouncement(AppState.auth.idToken, payload);
      if(res.ok){
        clearForm();
        await loadAdminAnnouncements();
        await UI.loadAll();
      }else{
        alert("儲存失敗。");
      }
    }catch(e){
      console.error(e);
      alert("儲存失敗。");
    }
  }

  async function loadAdminAnnouncements(){
    if(AppState.auth.role!=="admin") return;
    const data = await Api.getAnnouncements(AppState.auth.idToken, ""); // 管理員看全部
    const list = document.getElementById("admin-ann-list");
    list.innerHTML = "";
    (data.items||[]).forEach(it=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${UI.helpers.esc(it.Title||"")}</td>
        <td>${UI.helpers.esc(it.Audience||"")}</td>
        <td>${UI.helpers.esc(it.StartDate||"")}</td>
        <td>${UI.helpers.esc(it.EndDate||"")}</td>
        <td>${UI.helpers.esc(it.Priority||"")}</td>
        <td>
          <button class="btn-small secondary" data-act="edit" data-id="${UI.helpers.esc(it._id||"")}">編輯</button>
          <button class="btn-small" style="background:#fff;color:#b91c1c;border:1px solid #fecaca" data-act="del" data-id="${UI.helpers.esc(it._id||"")}">刪除</button>
        </td>
      `;
      list.appendChild(tr);
    });
    list.querySelectorAll("button").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        if(act==="edit"){
          const found = (data.items||[]).find(x=>x._id===id);
          if(found){
            AppState.editAnnId = id;
            document.getElementById("a-title").value = found.Title||"";
            document.getElementById("a-body").value = found.Body||"";
            document.getElementById("a-priority").value = (found.Priority||"normal");
            document.getElementById("a-start").value = (found.StartDate||"").slice(0,10);
            document.getElementById("a-end").value = (found.EndDate||"").slice(0,10);
            // 若是班級名稱就放到 a-class，否則以一般對象
            const classes = (APP_CONFIG.DEFAULT_CLASSES || []);
            if(found.Audience && classes.includes(found.Audience)){
              document.getElementById("a-class").value = found.Audience;
              document.getElementById("a-audience").value = "All";
            }else{
              document.getElementById("a-class").value = "";
              document.getElementById("a-audience").value = found.Audience || "All";
            }
            document.querySelector('.tab[data-tab="admin"]').click();
          }
        }else if(act==="del"){
          if(confirm("確定要刪除此公告？")){
            const r = await Api.deleteAnnouncement(AppState.auth.idToken, id);
            if(r.ok){ await loadAdminAnnouncements(); await UI.loadAll(); }
            else alert("刪除失敗。");
          }
        }
      });
    });
  }

  function bindAdminEvents(){
    document.getElementById("a-clear").addEventListener("click", clearForm);
    document.getElementById("a-save").addEventListener("click", saveAnnouncement);
    document.getElementById("reload-admin").addEventListener("click", loadAdminAnnouncements);
  }

  global.Admin = {
    fillClassDropdowns, clearForm, saveAnnouncement, loadAdminAnnouncements, bindAdminEvents
  };
})(window);
