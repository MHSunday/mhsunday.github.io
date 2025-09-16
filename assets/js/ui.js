// assets/js/ui.js
(function(global){
  const { GOOGLE_CAL_EMBED, DEFAULT_CLASSES } = global.APP_CONFIG;
  const { AppState, Api } = global;

  // 工具
  function nl2br(s){ return String(s||"").replace(/\n/g,"<br>"); }
  function esc(s){ return String(s||"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escUrl(u){ try{ new URL(u); return u; }catch(e){ return "#"; } }
  function show(id, yes){ document.getElementById(id).classList.toggle("hidden", !yes); }

  // Tabs
  function bindTabs(){
    document.querySelectorAll(".tab").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll("main section").forEach(sec=>sec.classList.add("hidden"));
        document.getElementById(btn.dataset.tab).classList.remove("hidden");
      });
    });
  }

  // 行事曆
  function loadCalendar(){
    document.getElementById("calendar-iframe").src = GOOGLE_CAL_EMBED;
  }

  // 使用者盒、班級下拉
  function renderUserUI(){
    document.getElementById("signin-container").classList.add("hidden");
    document.getElementById("user-box").classList.remove("hidden");
    document.getElementById("user-email").textContent = `${AppState.auth.email} • ${AppState.auth.role}`;

    const classSel = document.getElementById("class");
    classSel.innerHTML = '<option value="">選擇班級</option>';
    const src = (AppState.auth.classes && AppState.auth.classes.length) ? AppState.auth.classes : DEFAULT_CLASSES;
    src.forEach(c=>{
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      classSel.appendChild(opt);
    });
    if(AppState.auth.defaultClass) classSel.value = AppState.auth.defaultClass;
    classSel.classList.toggle("hidden", !(AppState.auth.classes && AppState.auth.classes.length));

    // 管理分頁
    const adminTab = document.querySelector('.tab[data-tab="admin"]');
    adminTab.classList.toggle("hidden", AppState.auth.role !== "admin");
  }

  // 載入全部（依目前班級）
  async function loadAll(){
    const klass = AppState.currentClass;
    await Promise.all([
      loadAnnouncements(klass),
      loadDocuments(klass),
      loadReminders(klass)
    ]);
    loadClassSheets(klass);
  }

  // 公告（以班級為主）
  async function loadAnnouncements(klass){
    try{
      const data = await Api.getAnnouncements(AppState.auth.idToken, klass);
      renderAnnouncements(data.items || []);
    }catch(e){
      console.error(e);
      renderAnnouncements([]);
    }
  }

  function renderAnnouncements(items){
    const body = document.getElementById("ann-body");
    const empty = document.getElementById("ann-empty");
    const count = document.getElementById("ann-count");
    body.innerHTML = "";
    if(!items.length){
      empty.classList.remove("hidden");
      count.textContent = "0";
      return;
    }
    empty.classList.add("hidden");
    count.textContent = `${items.length}`;
    items.forEach(it=>{
      const div = document.createElement("div");
      let cls = "notice";
      const pr = (it.Priority||"").toLowerCase();
      if(pr==="warn") cls += " warn";
      if(pr==="danger") cls += " danger";
      div.className = cls;
      const dates = [it.StartDate||"", it.EndDate||""].filter(Boolean).join(" → ");
      div.innerHTML = `
        <div class="row">
          <strong>${esc(it.Title)}</strong>
          <div class="spacer"></div>
          ${dates?`<span class="pill">${esc(dates)}</span>`:""}
        </div>
        <div>${nl2br(esc(it.Body))}</div>
        ${it.Audience?`<div class="muted" style="margin-top:6px">對象：${esc(it.Audience)}</div>`:""}
      `;
      body.appendChild(div);
    });
  }

  // 文件
  async function loadDocuments(klass){
    try{
      const data = await Api.getDocuments(AppState.auth.idToken, klass);
      renderDocuments(data.items || []);
    }catch(e){
      console.error(e);
      renderDocuments([]);
    }
  }

  function renderDocuments(items){
    const list = document.getElementById("docs-list");
    const empty = document.getElementById("docs-empty");
    const count = document.getElementById("docs-count");
    list.innerHTML = "";
    if(!items.length){
      empty.classList.remove("hidden");
      count.textContent = "0";
      return;
    }
    empty.classList.add("hidden");
    count.textContent = `${items.length}`;
    items.forEach(d=>{
      const div = document.createElement("div");
      div.className = "doc";
      div.innerHTML = `
        <div style="width:10px;height:36px;border-radius:8px;background:linear-gradient(180deg,#34d399,#60a5fa)"></div>
        <div style="flex:1">
          <div class="big-label">${esc(d.Title||"文件")}</div>
          <div class="muted">${esc(d.Description||"")}</div>
          <div style="margin-top:6px"><a href="${escUrl(d.URL||"#")}" target="_blank" rel="noopener">開啟 / 下載</a></div>
        </div>
        ${d.Visibility && d.Visibility!=="All" ? `<span class="pill">${esc(d.Visibility)}</span>` : ""}
      `;
      list.appendChild(div);
    });
  }

  // 提醒
  async function loadReminders(klass){
    try{
      const data = await Api.getReminders(AppState.auth.idToken, klass);
      renderReminders(data.items || []);
    }catch(e){
      console.error(e);
      renderReminders([]);
    }
  }

  function renderReminders(items){
    const list = document.getElementById("reminders");
    const empty = document.getElementById("rem-empty");
    list.innerHTML = "";
    if(!items.length){
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    items.forEach(r=>{
      const div = document.createElement("div");
      const dates = [r.StartDate||"", r.EndDate||""].filter(Boolean).join(" → ");
      div.className = "item";
      div.innerHTML = `
        <div class="big-label">${esc(r.Title||"提醒")}</div>
        ${dates?`<div class="muted">${esc(dates)}</div>`:""}
        <div>${nl2br(esc(r.Body||""))}</div>
      `;
      list.appendChild(div);
    });
  }

  // 班級資料/出席表
  function loadClassSheets(klass){
    document.getElementById("ci-class").textContent = klass || "—";
    document.getElementById("att-class").textContent = klass || "—";
    Api.getClassIframes(AppState.auth.idToken, klass).then(data=>{
      document.getElementById("classinfo-iframe").src = data.classInfoUrl || "about:blank";
      document.getElementById("att-iframe").src = data.attendanceUrl || "about:blank";
    }).catch(e=>{
      console.error(e);
      document.getElementById("classinfo-iframe").src = "about:blank";
      document.getElementById("att-iframe").src = "about:blank";
    });
  }

  // 對外匯出
  global.UI = {
    bindTabs, loadCalendar, renderUserUI, loadAll,
    helpers: { nl2br, esc, escUrl, show }
  };
})(window);