// js/main-redeem.js
import { getCurrentUser, getUserRole, logout, onRoleLoaded } from './auth.js';
import { getAllClasses, getUnredeemedRecords, batchUpdateRedeemStatus } from './api.js';

// 僅在 redeem.html 執行
if (!document.getElementById('recordsTable')) {
  console.warn('main-redeem.js 被載入到非 redeem.html 頁面');
} else {
 initRedeemPage();
}

function initRedeemPage() {
  const classFilter = document.getElementById('classFilter');
  const redeemDate = document.getElementById('redeemDate');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const updateAllBtn = document.getElementById('updateAllBtn');
  const updateAllUnselectedBtn = document.getElementById('updateAllUnselectedBtn');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const recordsTableBody = document.getElementById('recordsTableBody');
  const messageEl = document.getElementById('message');
  
  // 設置預設日期為今天
  const today = new Date().toISOString().split('T')[0];
  redeemDate.value = today;

  // 登出
  document.getElementById('logoutBtn').onclick = logout;

  // 監聽權限載入
  onRoleLoaded(async (role) => {
    const user = getCurrentUser();
    if (!user) return;

    // 檢查是否為管理員
    if (role.role !== 'admin') {
      messageEl.innerHTML = '<span style="color:red">只有管理員可以訪問此頁面</span>';
      return;
    }

    try {
      // 載入班級選項
      const classes = await getAllClasses();
      classFilter.innerHTML = '<option value="*">所有班級</option>';
      classes.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls;
        opt.textContent = cls;
        classFilter.appendChild(opt);
      });

      // 載入未換領記錄
      await loadUnredeemedRecords(user.email, '*');
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">初始化失敗：${err.message}</span>`;
    }
  });

  // 篩選班級事件
  classFilter.addEventListener('change', async () => {
    const user = getCurrentUser();
    if (user) {
      await loadUnredeemedRecords(user.email, classFilter.value);
    }
  });

  // 全選按鈕事件
  selectAllBtn.addEventListener('click', () => {
    const checkboxes = recordsTableBody.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
    updateButtonsState();
  });

  // 全選/取消全選主複選框事件
  selectAllCheckbox.addEventListener('change', () => {
    const checkboxes = recordsTableBody.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = selectAllCheckbox.checked;
    });
    updateButtonsState();
  });

 // 批量更新選取項目按鈕事件
  updateAllBtn.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!user) return;

    const checkboxes = recordsTableBody.querySelectorAll('input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
      messageEl.innerHTML = '<span style="color:orange">請先選擇要更新的記錄</span>';
      return;
    }

    const selectedRecords = [];
    checkboxes.forEach(checkbox => {
      const row = checkbox.closest('tr');
      selectedRecords.push({
        className: row.dataset.class,
        studentName: row.dataset.student,
        attendanceDate: row.dataset.attendanceDate,
        redeemDate: redeemDate.value
      });
    });

    await updateRedeemStatus(user.email, selectedRecords, '部分');
  });

  // 批量更新全部項目按鈕事件
 updateAllUnselectedBtn.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!user) return;

    const allRows = recordsTableBody.querySelectorAll('tr');
    if (allRows.length === 0) {
      messageEl.innerHTML = '<span style="color:orange">沒有記錄可更新</span>';
      return;
    }

    const allRecords = [];
    allRows.forEach(row => {
      allRecords.push({
        className: row.dataset.class,
        studentName: row.dataset.student,
        attendanceDate: row.dataset.attendanceDate,
        redeemDate: redeemDate.value
      });
    });

    await updateRedeemStatus(user.email, allRecords, '全部');
  });

  // 載入未換領記錄
  async function loadUnredeemedRecords(email, className) {
    messageEl.innerHTML = '<div class="loading">載入未換領記錄中…</div>';
    recordsTableBody.innerHTML = '';

    try {
      const records = await getUnredeemedRecords(email);
      const filteredRecords = className === '*' 
        ? records 
        : records.filter(record => record.class === className);

      if (filteredRecords.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" style="text-align: center;">沒有未換領的記錄</td>`;
        recordsTableBody.appendChild(row);
      } else {
        filteredRecords.forEach((record, index) => {
          const row = document.createElement('tr');
          row.dataset.class = record.class;
          row.dataset.student = record.studentName;
          row.dataset.attendanceDate = record.attendanceDate;
          
          row.innerHTML = `
            <td class="checkbox-cell"><input type="checkbox"></td>
            <td>${record.class}</td>
            <td>${record.studentName}</td>
            <td>${formatDate(record.attendanceDate)}</td>
            <td><input type="date" class="redeem-date-input" value="${redeemDate.value}" data-index="${index}"></td>
            <td class="status-cell">
              <button class="btn-secondary update-single-btn" data-index="${index}">更新</button>
            </td>
          `;
          recordsTableBody.appendChild(row);
        });

        // 為每個更新按鈕添加事件
        document.querySelectorAll('.update-single-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const user = getCurrentUser();
            if (!user) return;

            const index = parseInt(btn.dataset.index);
            const row = btn.closest('tr');
            const redeemDateInput = row.querySelector('.redeem-date-input');
            const record = {
              className: row.dataset.class,
              studentName: row.dataset.student,
              attendanceDate: row.dataset.attendanceDate,
              redeemDate: redeemDateInput.value
            };

            await updateRedeemStatus(user.email, [record], '單筆');
          });
        });

        // 為每個複選框添加事件
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
          checkbox.addEventListener('change', updateButtonsState);
        });
      }

      messageEl.innerHTML = '';
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">載入失敗：${err.message}</span>`;
    }
  }

 // 更新按鈕狀態
 function updateButtonsState() {
    const checkboxes = recordsTableBody.querySelectorAll('input[type="checkbox"]');
    const checkedBoxes = recordsTableBody.querySelectorAll('input[type="checkbox"]:checked');
    
    updateAllBtn.disabled = checkedBoxes.length === 0;
    updateAllUnselectedBtn.disabled = checkboxes.length === 0;
  }

  // 更新換領狀態
  async function updateRedeemStatus(email, records, actionType) {
    if (!Array.isArray(records) || records.length === 0) {
      messageEl.innerHTML = '<span style="color:orange">沒有記錄需要更新</span>';
      return;
    }

    try {
      messageEl.innerHTML = `<span style="color:blue">正在更新${actionType}記錄...</span>`;
      updateAllBtn.disabled = true;
      updateAllUnselectedBtn.disabled = true;

      await batchUpdateRedeemStatus(records, email);

      messageEl.innerHTML = `<span style="color:green">✓ ${actionType}記錄更新成功！</span>`;
      
      // 重新載入記錄
      const currentClass = classFilter.value;
      setTimeout(async () => {
        const user = getCurrentUser();
        if (user) {
          await loadUnredeemedRecords(user.email, currentClass);
        }
      }, 1000);
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">更新失敗：${err.message}</span>`;
      updateAllBtn.disabled = false;
      updateAllUnselectedBtn.disabled = false;
    }
  }

  // 格式化日期
  function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW');
  }
}