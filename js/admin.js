// js/admin.js
import { APP_CONFIG } from './config.js';

const GAS_URL = APP_CONFIG.appsScriptUrl;

const COLOR_SWATCH = {
    "bg-blue-500": "bg-blue-500",
    "bg-green-500": "bg-green-500",
    "bg-yellow-500": "bg-yellow-500",
    "bg-purple-500": "bg-purple-500",
    "bg-red-500": "bg-red-500",
    "bg-pink-500": "bg-pink-500",
    "bg-indigo-500": "bg-indigo-500",
    "bg-teal-500": "bg-teal-500"
};

let draftOptions = [];

const $ = (id) => document.getElementById(id);

function setStatus(msg, color = "text-gray-700") {
    const el = $("status-msg");
    el.textContent = msg;
    el.className = `mt-4 text-sm font-semibold ${color}`;
}

function setDirty(isDirty) {
    $("dirty-indicator").classList.toggle("hidden", !isDirty);
}

function renderOptions() {
    const list = $("options-list");
    list.innerHTML = "";
    if (draftOptions.length === 0) {
        list.innerHTML = '<p class="text-sm text-gray-500 italic">目前沒有任何選項。請用下方表單新增。</p>';
        return;
    }
    draftOptions.forEach((opt, idx) => {
        const row = document.createElement("div");
        row.className = "flex flex-col sm:flex-row gap-2 items-stretch sm:items-center p-2 border rounded-lg bg-gray-50";
        row.innerHTML = `
            <span class="inline-block w-4 h-4 rounded ${COLOR_SWATCH[opt.color] || "bg-blue-500"}"></span>
            <input data-idx="${idx}" data-field="name" value="${escapeAttr(opt.name)}"
                   class="border border-gray-300 p-1.5 rounded flex-1 focus:outline-none focus:border-blue-500">
            <select data-idx="${idx}" data-field="color" class="border border-gray-300 p-1.5 rounded">
                ${Object.keys(COLOR_SWATCH).map(c =>
                    `<option value="${c}" ${c === opt.color ? "selected" : ""}>${c.replace("bg-", "").replace("-500", "")}</option>`
                ).join("")}
            </select>
            <button data-idx="${idx}" data-action="remove"
                    class="bg-red-500 hover:bg-red-600 text-white font-bold px-3 py-1.5 rounded whitespace-nowrap">
                🗑️ 刪除
            </button>
        `;
        list.appendChild(row);
    });

    list.querySelectorAll("input[data-field], select[data-field]").forEach(el => {
        el.addEventListener("change", onEditField);
    });
    list.querySelectorAll("button[data-action='remove']").forEach(el => {
        el.addEventListener("click", onRemoveOption);
    });
}

function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function onEditField(e) {
    const idx = parseInt(e.target.dataset.idx, 10);
    const field = e.target.dataset.field;
    draftOptions[idx][field] = e.target.value;
    setDirty(true);
}

function onRemoveOption(e) {
    const idx = parseInt(e.target.dataset.idx, 10);
    if (draftOptions.length <= 1) {
        setStatus("至少需要保留一個選項", "text-red-600");
        return;
    }
    if (!confirm(`確定要刪除「${draftOptions[idx].name}」？\n（這只會從選項清單移除，不會刪除既有的票數）`)) return;
    draftOptions.splice(idx, 1);
    setDirty(true);
    renderOptions();
}

function onAddOption() {
    const nameInput = $("option-name");
    const colorSel = $("option-color");
    const name = nameInput.value.trim();
    if (!name) {
        setStatus("請輸入選項名稱", "text-red-600");
        return;
    }
    if (draftOptions.some(o => o.name === name)) {
        setStatus(`「${name}」已存在`, "text-red-600");
        return;
    }
    draftOptions.push({ name, color: colorSel.value });
    nameInput.value = "";
    setDirty(true);
    renderOptions();
    setStatus(`已加入「${name}」到草稿（尚未儲存）`, "text-gray-700");
}

async function callBackend(body) {
    const resp = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
    });
    return resp.json();
}

async function loadInitial() {
    try {
        const resp = await fetch(GAS_URL, { method: "GET", mode: "cors", cache: "no-store" });
        const data = await resp.json();
        draftOptions = Array.isArray(data.options) ? data.options.map(o => ({ ...o })) : [];
        renderOptions();
        setDirty(false);
    } catch (e) {
        setStatus("無法載入選項：" + e.message, "text-red-600");
    }
}

async function onSave() {
    if (draftOptions.length === 0) {
        setStatus("至少需要一個選項", "text-red-600");
        return;
    }
    setStatus("儲存中…");
    try {
        const result = await callBackend({
            action: "saveOptions",
            options: draftOptions
        });
        if (!result.success) throw new Error(result.error || "Save failed");
        setDirty(false);
        setStatus(`✅ 已儲存 ${result.count} 個選項。vote.html 將在 5 秒內更新。`, "text-green-600");
    } catch (e) {
        setStatus("❌ " + e.message, "text-red-600");
    }
}

async function onReset() {
    if (!confirm("⚠️ 確定要重置投票？這會清空所有票數紀錄（選項清單不受影響）。")) return;
    setStatus("重置中…");
    try {
        const result = await callBackend({ action: "resetPoll" });
        if (!result.success) throw new Error(result.error || "Reset failed");
        setStatus(`✅ 已清空 ${result.clearedRows} 筆投票紀錄。`, "text-green-600");
    } catch (e) {
        setStatus("❌ " + e.message, "text-red-600");
    }
}

(function init() {
    loadInitial();
    $("add-option").addEventListener("click", onAddOption);
    $("option-name").addEventListener("keydown", e => { if (e.key === "Enter") onAddOption(); });
    $("save-btn").addEventListener("click", onSave);
    $("reset-btn").addEventListener("click", onReset);
})();