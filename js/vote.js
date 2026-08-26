// js/vote.js
import { APP_CONFIG } from './config.js';

// 投票系統使用獨立的 voteScriptUrl（若未設定則退回 appsScriptUrl）
const GAS_URL = APP_CONFIG.voteScriptUrl || APP_CONFIG.appsScriptUrl;

// 不再有預設選項 — 必須從伺服器取得，避免閃現舊的硬編碼選項
let OPTIONS = [];
let COLORS = [];
let hasLoadedOptions = false;

/**
 * 根據裝置硬體特徵產生指紋雜湊值
 */
function getDeviceFingerprint() {
    const navigatorInfo = window.navigator.userAgent + window.navigator.language + window.screen.colorDepth;
    const screenInfo = window.screen.width + "x" + window.screen.height;
    const hardwareThreads = window.navigator.hardwareConcurrency || 0;
    const rawString = navigatorInfo + screenInfo + hardwareThreads;

    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        const char = rawString.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return "FP_" + Math.abs(hash);
}

/**
 * 渲染投票 UI（圖表 + 按鈕）。伺服器尚未回應時顯示載入中。
 */
function initUI() {
    const chartContainer = document.getElementById('chart-container');
    const buttonContainer = document.getElementById('vote-controls');
    chartContainer.innerHTML = '';
    buttonContainer.innerHTML = '';

    if (!hasLoadedOptions) {
        chartContainer.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm animate-pulse">⏳ 載入選項中…</p>';
        buttonContainer.innerHTML = '';
        return;
    }

    if (OPTIONS.length === 0) {
        chartContainer.innerHTML = '<p class="text-center text-gray-500 py-6 text-sm">⚠️ 管理員尚未設定任何選項</p>';
        buttonContainer.innerHTML = '';
        return;
    }

    OPTIONS.forEach((option, index) => {
        chartContainer.innerHTML += `
            <div>
                <div class="flex justify-between text-sm font-semibold mb-1">
                    <span>${option}</span>
                    <span id="count-${index}">0 votes (0%)</span>
                </div>
                <div class="w-full bg-gray-200 h-6 rounded-full overflow-hidden">
                    <div id="bar-${index}" class="${COLORS[index]} h-full transition-all duration-500" style="width: 0%"></div>
                </div>
            </div>
        `;

        const safeOption = String(option).replace(/'/g, "&#39;");
        buttonContainer.innerHTML += `
            <button data-choice="${safeOption}" class="vote-btn ${COLORS[index]} text-white font-bold py-3 px-4 rounded-xl hover:opacity-90 active:scale-95 transition text-sm">
                ${option}
            </button>
        `;
    });

    buttonContainer.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', () => castVote(btn.dataset.choice));
    });
}

/**
 * 向 GAS 獲取最新投票數據
 */
async function fetchVotes() {
    try {
        const url = GAS_URL + (GAS_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('Network error: HTTP ' + response.status);
        const data = await response.json();
        // 先套用伺服器選項（會重建 #count-X / #bar-X 元素），
        // 再更新票數。這樣 processVotes 一定寫到當前 DOM 上。
        if (data && Array.isArray(data.options) && data.options.length > 0) {
            applyServerOptions(data.options);
        }
        if (data && data.votes) {
            processVotes(data.votes);
        }
    } catch (error) {
        console.error('fetchVotes failed:', error);
    }
}

function applyServerOptions(serverOptions) {
    const newNames = serverOptions.map(o => o.name);
    const newColors = serverOptions.map(o => o.color || "bg-blue-500");
    OPTIONS = newNames;
    COLORS = newColors;
    hasLoadedOptions = true;
    initUI();
    checkVoteStatus();
}

/**
 * 執行投票動作
 */
async function castVote(choice) {
    if (localStorage.getItem('voted_dynamic')) {
        alert("You have already voted!");
        return;
    }

    document.getElementById('loading').classList.remove('hidden');
    const userFingerprint = getDeviceFingerprint();

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({ choice: choice, fingerprint: userFingerprint })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('voted_dynamic', 'true');
            checkVoteStatus();
            // Apps Script appendRow+getDataRange race: the just-added row
            // may not be in the immediate response. Re-fetch to get the
            // authoritative current sheet state for the bar chart.
            await fetchVotes();
        } else {
            alert(data.error || "Vote rejected.");
            localStorage.setItem('voted_dynamic', 'true');
            checkVoteStatus();
        }
    } catch (error) {
        alert("Network error, please try again.");
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

/**
 * 統計投票數據並更新條形圖與百分比
 */
function processVotes(votesArray) {
    const totalVotes = votesArray.length;
    OPTIONS.forEach((option, index) => {
        const matchCount = votesArray.filter(v => v === option).length;
        const percentage = totalVotes === 0 ? 0 : Math.round((matchCount / totalVotes) * 100);

        document.getElementById(`count-${index}`).innerText = `${matchCount} votes (${percentage}%)`;
        document.getElementById(`bar-${index}`).style.width = `${percentage}%`;
    });
}

/**
 * 檢查本機是否已經投過票，若是則隱藏按鈕
 */
function checkVoteStatus() {
    const voted = localStorage.getItem('voted_dynamic');
    const ctrl = document.getElementById('vote-controls');
    const msg = document.getElementById('voted-msg');
    const again = document.getElementById('vote-again');
    if (voted) {
        if (ctrl) ctrl.classList.add('hidden');
        if (msg) msg.classList.remove('hidden');
        if (again) again.classList.remove('hidden');
    } else {
        if (ctrl) ctrl.classList.remove('hidden');
        if (msg) msg.classList.add('hidden');
        if (again) again.classList.add('hidden');
    }
}

function resetVote() {
    if (!confirm('清除本機投票紀錄？\n（注意：後端的票數仍會保留，只有本裝置可以再次投票）')) return;
    localStorage.removeItem('voted_dynamic');
    checkVoteStatus();
    fetchVotes();
}

window.onload = async function () {
    initUI();
    checkVoteStatus();
    await fetchVotes();

    const urlParams = new URLSearchParams(window.location.search);
    const isScreen = urlParams.get('view') === 'screen';
    const pollMs = isScreen ? 4000 : 5000;

    setInterval(() => {
        if (document.hidden) return;
        fetchVotes();
    }, pollMs);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) fetchVotes();
    });

    const againBtn = document.getElementById('vote-again');
    if (againBtn) againBtn.addEventListener('click', resetVote);
};

window.castVote = castVote;