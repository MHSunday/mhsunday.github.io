// js/main-details.js
import { getCurrentUser, getUserRole, logout, onRoleLoaded } from './auth.js';
import { fetchAttendanceDetails, updateRedeemStatus } from './api.js';

function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\//g, '-');
}

if (!document.getElementById('recordsTable')) {
  console.warn('main-details.js 被載入到非 details.html 頁面');
} else {
  const className = getUrlParam('class');
  if (!className || className === '*') {
    alert('無效的班級參數');
    window.location.href = 'stat.html';
  } else {
    initDetailsPage(className);
  }
}

function initDetailsPage(className) {
  const displayClassEl = document.getElementById('displayClass');
  const recordsBody = document.getElementById('recordsBody');
  const messageEl = document.getElementById('message');
  const selectAll = document.getElementById('selectAll');
  const bulkBtn = document.getElementById('bulkRedeemBtn');
  const progressBar = document.getElementById('progressBar');
  const progressBarFill = document.getElementById('progressBarFill');

  displayClassEl.textContent = className;
  document.getElementById('logoutBtn').onclick = logout;

  onRoleLoaded(async (role) => {
    const user = getCurrentUser();
    if (!user) return;

    if (role.role === 'teacher' && role.classes[0] !== className) {
      alert('您無權查看此班級');
      window.location.href = 'stat.html';
      return;
    }

    await loadRecords(className);
  });

  // 全選邏輯
  selectAll.addEventListener('change', () => {
    document.querySelectorAll('.selectable-row').forEach(row => {
      if (selectAll.checked) {
        row.classList.add('selected');
      } else {
        row.classList.remove('selected');
      }
    });
  });

  // 批量標記
  bulkBtn.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!user) {
      alert('請先登入');
      return;
    }

    const selectedRows = Array.from(document.querySelectorAll('.selectable-row.selected'));
    if (selectedRows.length === 0) {
      alert('請先勾選要標記的記錄');
      return;
    }

    const redeemDate = prompt('請輸入換領日期（格式：YYYY-MM-DD）：', new Date().toISOString().split('T')[0]);
    if (!redeemDate || !/^\d{4}-\d{2}-\d{2}$/.test(redeemDate)) {
      alert('日期格式錯誤');
      return;
    }

    // 顯示進度條
    progressBar.style.display = 'block';
    progressBarFill.style.width = '0%';

    try {
      for (let i = 0; i < selectedRows.length; i++) {
        const row = selectedRows[i];
        await updateRedeemStatus({
          email: user.email,
          className: row.dataset.class,
          studentName: row.dataset.student,
          attendanceDate: row.dataset.date,
          redeemDate: redeemDate
        });

        // 更新進度
        const progress = Math.round(((i + 1) / selectedRows.length) * 100);
        progressBarFill.style.width = `${progress}%`;
      }

      alert(`成功標記 ${selectedRows.length} 筆記錄`);
      await loadRecords(className);
    } catch (err) {
      alert('批量更新失敗：' + err.message);
    } finally {
      progressBar.style.display = 'none';
    }
  });

  async function loadRecords(className) {
    messageEl.innerHTML = '<div class="loading">載入明細中…</div>';
    recordsBody.innerHTML = '';
    selectAll.checked = false;

    try {
      const records = await fetchAttendanceDetails(getCurrentUser().email, className);
      if (records.length === 0) {
        recordsBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#999;">尚無記錄</td></tr>`;
        messageEl.innerHTML = '';
        return;
      }

      recordsBody.innerHTML = records.map(record => {
        const isRedeemed = record.redeemed;
        const redeemBtn = !isRedeemed
          ? `<td>
              <button class="redeem-btn"
                      data-class="${className}"
                      data-student="${record.studentName}"
                      data-date="${record.attendanceDate}">
                標記為已換領
              </button>
            </td>`
          : '<td>—</td>';

        const rowClass = !isRedeemed ? 'selectable-row' : '';
        return `
          <tr class="${rowClass}" 
              data-student="${record.studentName}" 
              data-date="${record.attendanceDate}"
              data-class="${className}">
            <td>${record.studentName}</td>
            <td>${formatDate(record.attendanceDate)}</td>
            <td class="${isRedeemed ? 'redeemed-yes' : 'redeemed-no'}">
              ${isRedeemed ? '是' : '否'}
            </td>
            <td>${record.redeemDate ? formatDate(record.redeemDate) : '—'}</td>
            ${redeemBtn}
          </tr>
        `;
      }).join('');

      messageEl.innerHTML = '';

      // 綁定單筆按鈕
      document.querySelectorAll('.redeem-btn').forEach(btn => {
        btn.onclick = async () => {
          const user = getCurrentUser();
          if (!user) {
            alert('請先登入');
            return;
          }

          const redeemDate = prompt('請輸入換領日期（格式：YYYY-MM-DD）：', new Date().toISOString().split('T')[0]);
          if (!redeemDate || !/^\d{4}-\d{2}-\d{2}$/.test(redeemDate)) {
            alert('日期格式錯誤');
            return;
          }

          try {
            await updateRedeemStatus({
              email: user.email,
              className: btn.dataset.class,
              studentName: btn.dataset.student,
              attendanceDate: btn.dataset.date,
              redeemDate: redeemDate
            });
            await loadRecords(className);
          } catch (err) {
            alert('更新失敗：' + err.message);
          }
        };
      });

      // 更新全選按鈕狀態
      const selectableRows = document.querySelectorAll('.selectable-row');
      if (selectableRows.length === 0) {
        selectAll.disabled = true;
      } else {
        selectAll.disabled = false;
      }
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">載入失敗：${err.message}</span>`;
    }
  }
}