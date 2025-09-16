// assets/js/api.js
(function(global){
  const { API_BASE } = global.APP_CONFIG;

  async function post(action, payload={}){
    const res = await fetch(`${API_BASE}?action=${encodeURIComponent(action)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const t = await res.text().catch(()=> "");
      throw new Error(`API 失敗：${action} ${t || res.status}`);
    }
    return res.json();
  }

  const Api = {
    whoami: (idToken) => post("whoami", { idToken }),
    getAnnouncements: (idToken, klass) => post("getAnnouncements", { idToken, klass }),
    saveAnnouncement: (idToken, data) => post("saveAnnouncement", { idToken, ...data }),
    deleteAnnouncement: (idToken, id) => post("deleteAnnouncement", { idToken, id }),
    getDocuments: (idToken, klass) => post("getDocuments", { idToken, klass }),
    getReminders: (idToken, klass) => post("getReminders", { idToken, klass }),
    getClassIframes: (idToken, klass) => post("getClassIframes", { idToken, klass })
  };

  global.Api = Api;
})(window);