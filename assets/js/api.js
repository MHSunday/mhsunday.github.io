// assets/js/api.js
// 專責呼叫後端 Apps Script Web App 的 API。
// 說明：
// - 以 POST 傳遞 JSON，所有動作以 ?action=xxx 指定
// - 大部分端點都需要 idToken（由 Google Sign-In 取得）
// - 這支檔案同時支援主站與管理後台（admin.html）

(function (global) {
  const { API_BASE } = global.APP_CONFIG || {};

  if (!API_BASE) {
    console.warn("[Api] 未設定 APP_CONFIG.API_BASE，請於 assets/js/config.js 中設定 Web App URL");
  }

  // 基本 POST 包裝
  async function post(action, payload = {}) {
    if (!API_BASE) throw new Error("缺少 API_BASE 組態");
    if (!action) throw new Error("缺少 action 參數");

    const url = `${API_BASE}?action=${encodeURIComponent(action)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Apps Script 可能在錯誤時回傳文字，盡量取文字以利除錯
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`API ${action} 失敗（${res.status}）：${text || "無回應"}`);
    }

    // 嘗試解析 JSON（後端預期皆回傳 JSON）
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`API ${action} 回應非 JSON：${text}`);
    }
  }

  // 封裝各端點
  const Api = {
    // 驗證登入並取得使用者角色/班級
    whoami: (idToken) => post("whoami", { idToken }),

    // 公告（依班級）
    getAnnouncements: (idToken, klass) =>
      post("getAnnouncements", { idToken, klass }),

    // 公告 CRUD（管理員）
    saveAnnouncement: (idToken, data) =>
      post("saveAnnouncement", { idToken, ...data }),

    deleteAnnouncement: (idToken, id) =>
      post("deleteAnnouncement", { idToken, id }),

    // 文件（依可見範圍與班級）
    getDocuments: (idToken, klass) =>
      post("getDocuments", { idToken, klass }),

    // 全校提醒（含班級、期間過濾）
    getReminders: (idToken, klass) =>
      post("getReminders", { idToken, klass }),

    // 各班 iframe（班級資料、出席表）
    getClassIframes: (idToken, klass) =>
      post("getClassIframes", { idToken, klass }),

    // 行事曆事件（以清單方式顯示，不使用 iframe）
    // days：未來天數，預設 14 天
    getCalendarEvents: (idToken, days = 14) =>
      post("getCalendarEvents", { idToken, days }),
  };

  global.Api = Api;
})(window);