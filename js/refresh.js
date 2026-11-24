/**
 * js/refresh.js — 全站浮動重新整理按鈕
 *
 * 手機由主畫面捷徑進入時，Safari/Chrome 有時會用舊快取或卡住。
 * 這個按鈕會：
 *   1. 清 Cache Storage（如有）
 *   2. unregister service worker（如有）
 *   3. 清 app 的角色快取（userRole / userRoleCache），重新向 GAS 取權限
 *   4. 用 cache: 'reload' 重新抓目前頁面同 script / stylesheet
 *   5. 加 cache-busting query 再 navigate，避免 bfcache／主畫面快照
 *
 * 不會清 Firebase 登入狀態，所以唔會強制登出。
 */
(function () {
  if (window.__appRefreshInstalled) return;
  window.__appRefreshInstalled = true;

  var BTN_ID = 'appRefreshBtn';

  function ensureStyle() {
    if (document.getElementById('appRefreshStyle')) return;
    var style = document.createElement('style');
    style.id = 'appRefreshStyle';
    style.textContent =
      '#' + BTN_ID + '{position:fixed;z-index:9990;' +
      'right:calc(14px + env(safe-area-inset-right,0px));' +
      'bottom:calc(14px + env(safe-area-inset-bottom,0px));' +
      'width:46px;height:46px;border-radius:50%;' +
      'background:#1d4ed8;color:#fff;border:2px solid #fff;' +
      'box-shadow:0 4px 14px rgba(15,23,42,.28);' +
      'font:700 26px/1 system-ui,"Noto Sans TC",sans-serif;' +
      'display:flex;align-items:center;justify-content:center;' +
      'cursor:pointer;-webkit-tap-highlight-color:transparent;' +
      'user-select:none;-webkit-user-select:none;}' +
      '#' + BTN_ID + ':active{transform:scale(.94);}' +
      '#' + BTN_ID + ':disabled{opacity:.65;}' +
      '@media print{#' + BTN_ID + '{display:none!important;}}';
    (document.head || document.documentElement).appendChild(style);
  }

  function revalidate(url) {
    if (!url) return Promise.resolve();
    return Promise.race([
      fetch(url, { cache: 'reload', credentials: 'same-origin' }),
      new Promise(function (resolve) { setTimeout(resolve, 4000); })
    ]).catch(function () { /* ignore */ });
  }

  function revalidateResources() {
    var urls = [window.location.href];
    var nodes = document.querySelectorAll('script[src], link[rel="stylesheet"][href]');
    for (var i = 0; i < nodes.length; i++) {
      var raw = nodes[i].getAttribute('src') || nodes[i].getAttribute('href');
      if (!raw) continue;
      try {
        var u = new URL(raw, window.location.href);
        if (u.origin === window.location.origin) urls.push(u.href);
      } catch (e) { /* ignore */ }
    }
    var unique = urls.filter(function (u, i) { return urls.indexOf(u) === i; });
    return Promise.all(unique.map(revalidate));
  }

  function clearAppCaches() {
    return Promise.all([
      (function () {
        if (!('caches' in window)) return Promise.resolve();
        return caches.keys()
          .then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
          })
          .catch(function () { /* ignore */ });
      })(),
      (function () {
        if (!('serviceWorker' in navigator)) return Promise.resolve();
        return navigator.serviceWorker.getRegistrations()
          .then(function (regs) {
            return Promise.all(regs.map(function (r) { return r.unregister(); }));
          })
          .catch(function () { /* ignore */ });
      })(),
      (function () {
        try { sessionStorage.removeItem('userRole'); } catch (e) { /* ignore */ }
        try { localStorage.removeItem('userRoleCache'); } catch (e) { /* ignore */ }
        return Promise.resolve();
      })()
    ]);
  }

  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;
    ensureStyle();

    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.title = '重新整理（清除頁面快取）';
    btn.setAttribute('aria-label', '重新整理（清除頁面快取）');
    btn.textContent = '↻';

    btn.addEventListener('click', async function () {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = '…';

      if (window.showLoading) {
        try { window.showLoading('重新整理…'); } catch (e) { /* ignore */ }
      }

      await clearAppCaches();
      await revalidateResources();

      var url = new URL(window.location.href);
      url.searchParams.set('_r', Date.now());
      try {
        window.location.replace(url.toString());
      } catch (e) {
        window.location.reload();
      }
    });

    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureButton);
  } else {
    ensureButton();
  }
})();
