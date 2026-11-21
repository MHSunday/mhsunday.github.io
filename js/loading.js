/**
 * js/loading.js — 全站載入遮罩（非 module，最早載入）
 *
 * 用法：
 *   window.showLoading('載入中…');
 *   window.hideLoading();
 *
 * 亦會自動包裝 window.fetch：任何 API 請求超過 180ms 就顯示遮罩，
 * 完成後 120ms 才收起，避免快速請求閃一下。
 */
(function () {
  if (window.__appLoadingInstalled) return;
  window.__appLoadingInstalled = true;

  var depth = 0;
  var showTimer = null;
  var hideTimer = null;
  var visible = false;
  var currentText = '載入中…';

  function ensure() {
    if (document.getElementById('appLoadingOverlay')) return;

    var style = document.createElement('style');
    style.id = 'appLoadingStyle';
    style.textContent =
      '@keyframes appLoadingSpin{to{transform:rotate(360deg)}}' +
      '#appLoadingOverlay{position:fixed;inset:0;z-index:9999;display:none;' +
      'align-items:center;justify-content:center;background:rgba(255,255,255,.72);' +
      'backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}' +
      '#appLoadingBox{display:flex;flex-direction:column;align-items:center;gap:12px}' +
      '#appLoadingSpinner{width:40px;height:40px;border:4px solid #bfdbfe;' +
      'border-top-color:#2563eb;border-radius:50%;animation:appLoadingSpin .8s linear infinite}' +
      '#appLoadingText{font:14px/1.4 system-ui,"Noto Sans TC",sans-serif;color:#4b5563}';
    (document.head || document.documentElement).appendChild(style);

    var el = document.createElement('div');
    el.id = 'appLoadingOverlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div id="appLoadingBox">' +
      '<div id="appLoadingSpinner"></div>' +
      '<div id="appLoadingText">載入中…</div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(el);
  }

  function paint() {
    ensure();
    var el = document.getElementById('appLoadingOverlay');
    var txt = document.getElementById('appLoadingText');
    if (txt) txt.textContent = currentText;
    if (el) el.style.display = 'flex';
    visible = true;
  }

  function show(text) {
    depth++;
    if (text) currentText = text;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (!visible && !showTimer) {
      showTimer = setTimeout(function () {
        showTimer = null;
        if (depth > 0) paint();
      }, 180);
    }
  }

  function hide() {
    depth = Math.max(0, depth - 1);
    if (depth > 0) return;
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (!visible) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      hideTimer = null;
      var el = document.getElementById('appLoadingOverlay');
      if (el) el.style.display = 'none';
      visible = false;
    }, 120);
  }

  window.showLoading = show;
  window.hideLoading = hide;

  // 自動覆蓋 fetch（GAS API 全部經此）
  if (window.fetch && !window.fetch.__appLoadingWrapped) {
    var origFetch = window.fetch;
    var wrapped = function () {
      show(currentText);
      try {
        var p = origFetch.apply(this, arguments);
        if (p && typeof p.finally === 'function') {
          return p.finally(function () { hide(); });
        }
        hide();
        return p;
      } catch (e) {
        hide();
        throw e;
      }
    };
    wrapped.__appLoadingWrapped = true;
    window.fetch = wrapped;
  }

  // 頁面跳轉時即時顯示，避免使用者以為點擊無反應
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    show('載入中…');
  }, true);
})();
