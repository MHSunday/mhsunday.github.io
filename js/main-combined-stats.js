// js/main-combined-stats.js
import { getCurrentUser, getUserRole, logout, onRoleLoaded } from './auth.js';
import { getAllClasses, getStats, getAchievedStudents, getUnredeemedRecords, getClassBasedPendingRedemptionReport, getGlobalRedemptionStats } from './api.js';

// 僅在 combined_stats_report.html 執行
if (!document.getElementById('statsContainer')) {
  console.warn('main-combined-stats.js 被載入到非 combined_stats_report.html 頁面');
} else {
  initCombinedStatsPage();
}

function initCombinedStatsPage() {
  const classSelect = document.getElementById('classSelect');
  const statsContainer = document.getElementById('statsContainer');
  const achievedStudentsContainer = document.getElementById('achievedStudentsContainer');
  const achievedStudentsList = document.getElementById('achievedStudentsList');
  const unredeemedStudentsContainer = document.getElementById('unredeemedStudentsContainer');
  const unredeemedStudentsList = document.getElementById('unredeemedStudentsList');
  const messageEl = document.getElementById('message');
  
  const statsTab = document.getElementById('statsTab');
  const achievedTab = document.getElementById('achievedTab');
  const unredeemedTab = document.getElementById('unredeemedTab');

  // 登出
  document.getElementById('logoutBtn').onclick = logout;

  // 預設顯示統計區，因為初始頁籤是統計摘要
  statsContainer.style.display = 'block';
  achievedStudentsContainer.style.display = 'none';
  unredeemedStudentsContainer.style.display = 'none';
  messageEl.innerHTML = '';

  // 載入達成學生列表的函數（可重複使用）
  async function loadAchievedStudentsList(showLoading = true) {
    const user = getCurrentUser();
    if (!user) return;

    try {
      if (showLoading) {
        messageEl.innerHTML = '<div class="loading">載入達成換領條件的學生名單中…</div>';
      }
      const className = classSelect.value;
      const achievedStudents = await getAchievedStudents(user.email, className);
      
      // 確保在非同步操作完成後正確更新界面
      displayAchievedStudents(achievedStudents);
    } catch (err) {
      if (showLoading) {
        messageEl.innerHTML = `<span style="color:red">載入達成換領條件的學生名單失敗：${err.message}</span>`;
      } else {
        achievedStudentsList.innerHTML = '<p style="text-align: center; color: #7f8c8d; font-style: italic;">載入失敗</p>';
      }
      return; // 發生錯誤時提前返回
    } finally {
      // 無論成功或失敗，都要清除加載信息（如果之前顯示了）
      if (showLoading) {
        messageEl.innerHTML = '';
      }
    }
  }

  // 載入未補領禮物學生列表的函數
  async function loadUnredeemedStudentsList(showLoading = true) {
    const user = getCurrentUser();
    if (!user) return;

    try {
      if (showLoading) {
        messageEl.innerHTML = '<div class="loading">載入未補領禮物的學生名單中…</div>';
      }
      const unredeemedStudents = await getUnredeemedRecords(user.email);
      
      // Filter by selected class if not showing all
      const selectedClass = classSelect.value;
      let filteredStudents = unredeemedStudents;
      if (selectedClass !== '*' && selectedClass) {
        filteredStudents = unredeemedStudents.filter(student => student.class === selectedClass);
      }
      
      // 確保在非同步操作完成後正確更新界面
      displayUnredeemedStudents(filteredStudents);
      
      // 更新未補領總數
      const unredeemedSummary = document.getElementById('unredeemedSummary');
      const unredeemedTotalCount = document.getElementById('unredeemedTotalCount');
      if (unredeemedSummary && unredeemedTotalCount) {
        unredeemedSummary.style.display = 'block';
        unredeemedTotalCount.textContent = filteredStudents.length;
      }
    } catch (err) {
      if (showLoading) {
        messageEl.innerHTML = `<span style="color:red">載入未補領禮物的學生名單失敗：${err.message}</span>`;
      } else {
        unredeemedStudentsList.innerHTML = '<p style="text-align: center; color: #7f8c8d; font-style: italic;">載入失敗</p>';
        
        // 還是顯示總數區域，但為0
        const unredeemedSummary = document.getElementById('unredeemedSummary');
        const unredeemedTotalCount = document.getElementById('unredeemedTotalCount');
        if (unredeemedSummary && unredeemedTotalCount) {
          unredeemedSummary.style.display = 'block';
          unredeemedTotalCount.textContent = '0';
        }
      }
      return; // 發生錯誤時提前返回
    } finally {
      // 無論成功或失敗，都要清除加載信息（如果之前顯示了）
      if (showLoading) {
        messageEl.innerHTML = '';
      }
    }
  }

  // 頁籤切換功能
  statsTab.addEventListener('click', () => {
    statsTab.classList.add('active');
    achievedTab.classList.remove('active');
    unredeemedTab.classList.remove('active');
    statsContainer.style.display = 'block';
    achievedStudentsContainer.style.display = 'none';
    unredeemedStudentsContainer.style.display = 'none';
  });

  achievedTab.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!user) return;

    // 切換頁籤樣式
    achievedTab.classList.add('active');
    statsTab.classList.remove('active');
    unredeemedTab.classList.remove('active');
    statsContainer.style.display = 'none';
    achievedStudentsContainer.style.display = 'block';
    unredeemedStudentsContainer.style.display = 'none';

    // 載入達成換領條件的學生名單
    await loadAchievedStudentsList();
  });

  // 新增未補領禮物名單頁籤切換功能
  unredeemedTab.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!user) return;

    // 切換頁籤樣式
    unredeemedTab.classList.add('active');
    statsTab.classList.remove('active');
    achievedTab.classList.remove('active');
    statsContainer.style.display = 'none';
    achievedStudentsContainer.style.display = 'none';
    unredeemedStudentsContainer.style.display = 'block';

    // 載入未補領禮物的學生名單
    await loadUnredeemedStudentsList();
  });

  // 監聽權限載入
  onRoleLoaded(async (role) => {
    const user = getCurrentUser();
    if (!user) return;

    try {
      const classes = await getAllClasses();
      classSelect.disabled = false;
      classSelect.innerHTML = '';

      if (role.role === 'admin') {
        // 校務：可選所有班級 + 「全部」
        const allOpt = document.createElement('option');
        allOpt.value = '*';
        allOpt.textContent = '全部班級';
        classSelect.appendChild(allOpt);
        classes.forEach(cls => {
          const opt = document.createElement('option');
          opt.value = cls;
          opt.textContent = cls;
          classSelect.appendChild(opt);
        });
        // 預設選「全部」
        classSelect.value = '*';
      } else if (role.role === 'teacher') {
        // 老師：只顯示自己班級
        const cls = role.classes[0];
        const opt = document.createElement('option');
        opt.value = cls;
        opt.textContent = cls;
        classSelect.appendChild(opt);
        classSelect.disabled = true;
        classSelect.value = cls;
      }

      // 首次載入統計
      await loadStats(user.email, classSelect.value);
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">初始化失敗：${err.message}</span>`;
    }
  });

  // 班級切換
  classSelect.addEventListener('change', async () => {
    const user = getCurrentUser();
    if (user && classSelect.value) {
      await loadStats(user.email, classSelect.value);
      
      // 無論當前在哪個標籤頁，都應當預先載入達成學生列表的最新數據
      // 這樣當用戶切換到達成標籤頁時，會看到正確的數據
      if (achievedTab.classList.contains('active')) {
        // 如果當前就在達成標籤頁，確保容器可見，並顯示加載信息
        achievedStudentsContainer.style.display = 'block';
        await loadAchievedStudentsList(true);
      } else {
        // 如果不在達成標籤頁，也預先載入數據並更新列表內容
        // 但不顯示加載信息，這樣當用戶切換過去時會立即看到正確結果
        await loadAchievedStudentsList(false);
      }
      
      // 同樣處理未補領禮物標籤頁的數據更新
      if (unredeemedTab.classList.contains('active')) {
        // 如果當前就在未補領禮物標籤頁，確保容器可見，並顯示加載信息
        unredeemedStudentsContainer.style.display = 'block';
        await loadUnredeemedStudentsList(true);
      } else {
        // 如果不在未補領禮物標籤頁，也預先載入數據並更新列表內容
        // 但不顯示加載信息，這樣當用戶切換過去時會立即看到正確結果
        await loadUnredeemedStudentsList(false);
      }
    }
  });

  // 載入統計數據
  async function loadStats(email, className) {
    messageEl.innerHTML = '<div class="loading">載入統計中…</div>';
    
    // 確保在載入時顯示正確的容器
    if (statsTab.classList.contains('active')) {
      statsContainer.style.display = 'block';
    } else {
      statsContainer.style.display = 'none';
    }
    // 只有當統計標籤頁是活動狀態時才隱藏達成學生容器
    // 如果當前在達成標籤頁，則不要改變達成學生容器的顯示狀態
    if (statsTab.classList.contains('active')) {
      achievedStudentsContainer.style.display = 'none';
    }
    // 如果當前在未補領禮物標籤頁，則不要改變未補領禮物容器的顯示狀態
    if (statsTab.classList.contains('active')) {
      unredeemedStudentsContainer.style.display = 'none';
    }

    try {
      const stats = await getStats(email, className);
      
      // 普通統計數據
      document.getElementById('totalRecords').textContent = stats.totalRecords;
      document.getElementById('achievedStudents').textContent = stats.achievedStudents;
      document.getElementById('redeemedCount').textContent = stats.redeemedCount;
      document.getElementById('displayClass').textContent = stats.class === '*' ? '全部' : stats.class;
      
      // 計算未換領數量
      const outstandingCount = stats.totalRecords - stats.redeemedCount;
      document.getElementById('outstandingCount').textContent = outstandingCount;
      
      // 獲取全局統計數據
      const globalStats = await getGlobalRedemptionStats(email);
      document.getElementById('globalRedeemedCount').textContent = globalStats.redeemedCount;
      
      // 計算全局未換領數量
      const globalOutstandingCount = globalStats.outstandingCount;
      document.getElementById('globalOutstandingCount').textContent = globalOutstandingCount;

      messageEl.innerHTML = '';
      
      // 只有當統計標籤是活動狀態時才顯示統計容器
      if (statsTab.classList.contains('active')) {
        statsContainer.style.display = 'block';
      } else {
        statsContainer.style.display = 'none';
      }
      // 只有當統計標籤頁是活動狀態時才隱藏達成學生容器
      if (statsTab.classList.contains('active')) {
        achievedStudentsContainer.style.display = 'none';
      }
      // 只有當統計標籤頁是活動狀態時才隱藏未補領禮物學生容器
      if (statsTab.classList.contains('active')) {
        unredeemedStudentsContainer.style.display = 'none';
      }
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">載入失敗：${err.message}</span>`;
    }
  }

  // 顯示達成換領條件的學生名單
  function displayAchievedStudents(students) {
    
    if (!students || students.length === 0) {
      achievedStudentsList.innerHTML = '<p style="text-align: center; color: #7f8c8d; font-style: italic;">沒有學生符合條件</p>';
      return;
    }

    // 按班級分組學生
    const groupedStudents = {};
    students.forEach(student => {
      if (!groupedStudents[student.class]) {
        groupedStudents[student.class] = [];
      }
      groupedStudents[student.class].push(student);
    });

    // 生成HTML
    let html = '';
    for (const className in groupedStudents) {
      const classStudents = groupedStudents[className];
      classStudents.sort((a, b) => a.studentName.localeCompare(b.studentName, 'zh-TW'));
      
      html += `
        <div class="class-section">
          <div class="class-name">${className} - 達成目標學生 (${classStudents.length} 人)</div>
          ${classStudents.map(student => `
            <div class="student-item">
              <div class="student-header">
                <span>${student.studentName}</span>
                <span class="redemption-badge ${student.isFullyRedeemed ? 'completed' : 'pending'}">
                  ${student.isFullyRedeemed ? '✓' : '○'}
                  <span class="tooltip">${student.redemptionStatus} (${student.isFullyRedeemed ? '已完成' : '未完成'})</span>
                </span>
              </div>
              <div class="student-details">達成次數: ${student.attendanceCount}</div>
              ${student.attendanceDates ? `<div class="student-details">達成日期: ${student.attendanceDates.map(date => formatDate(date)).join(', ')}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }
    
    achievedStudentsList.innerHTML = html;
  }

  // 格式化日期
  function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW');
  }

  // 顯示未補領禮物的學生名單
  function displayUnredeemedStudents(students) {
    
    if (!students || students.length === 0) {
      unredeemedStudentsList.innerHTML = '<p style="text-align: center; color: #7f8c8d; font-style: italic;">沒有學生未補領禮物</p>';
      return;
    }

    // 按班級分組學生
    const groupedStudents = {};
    students.forEach(student => {
      if (!groupedStudents[student.class]) {
        groupedStudents[student.class] = [];
      }
      groupedStudents[student.class].push(student);
    });

    // 生成HTML，按班級分組，以逗號分隔的名字列表形式顯示
    let html = '';
    for (const className in groupedStudents) {
      const classStudents = groupedStudents[className];
      // 按姓名排序
      classStudents.sort((a, b) => a.studentName.localeCompare(b.studentName, 'zh-TW'));
      
      // 提取姓名并用逗號分隔
      const names = classStudents.map(student => student.studentName).join('、');
      
      html += `
        <div class="class-section">
          <div class="class-name">${className} - 未補領禮物學生 (${classStudents.length} 人)</div>
          <div class="unredeemed-names-list">${names}</div>
        </div>
      `;
    }
    
    unredeemedStudentsList.innerHTML = html;
  }
}