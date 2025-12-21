// js/main-stats.js
import { getCurrentUser, getUserRole, logout, onRoleLoaded } from './auth.js';
import { getAllClasses, getStats, getAchievedStudents } from './api.js';

// 僅在 stat.html 執行
if (!document.getElementById('statsContainer')) {
  console.warn('main-stats.js 被載入到非 stat.html 頁面');
} else {
  initStatsPage();
}

function initStatsPage() {
  const classSelect = document.getElementById('classSelect');
  const statsContainer = document.getElementById('statsContainer');
  const achievedStudentsContainer = document.getElementById('achievedStudentsContainer');
  const achievedStudentsList = document.getElementById('achievedStudentsList');
  const messageEl = document.getElementById('message');
  const achievedCard = document.getElementById('achievedCard');
  const statsTab = document.getElementById('statsTab');
  const achievedTab = document.getElementById('achievedTab');

  // 登出
  document.getElementById('logoutBtn').onclick = logout;

  // 預設隱藏統計區
  statsContainer.style.display = 'none';
  messageEl.innerHTML = '';

  // 初始化卡片狀態（不可點）
  achievedCard.style.cursor = 'default';
  achievedCard.title = '';

  // 頁籤切換功能
  statsTab.addEventListener('click', () => {
    statsTab.classList.add('active');
    achievedTab.classList.remove('active');
    statsContainer.style.display = 'block';
    achievedStudentsContainer.style.display = 'none';
  });

  achievedTab.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!user) return;

    // 切換頁籤樣式
    achievedTab.classList.add('active');
    statsTab.classList.remove('active');
    statsContainer.style.display = 'none';
    achievedStudentsContainer.style.display = 'block';

    // 載入達成換領條件的學生名單
    try {
      messageEl.innerHTML = '<div class="loading">載入達成換領條件的學生名單中…</div>';
      const className = classSelect.value;
      const achievedStudents = await getAchievedStudents(user.email, className);
      
      displayAchievedStudents(achievedStudents);
      messageEl.innerHTML = '';
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">載入達成換領條件的學生名單失敗：${err.message}</span>`;
    }
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
      
      // 如果當前在達成換領條件學生名單頁籤，也重新載入該頁面的數據
      if (achievedTab.classList.contains('active')) {
        try {
          messageEl.innerHTML = '<div class="loading">載入達成換領條件的學生名單中…</div>';
          const achievedStudents = await getAchievedStudents(user.email, classSelect.value);
          displayAchievedStudents(achievedStudents);
          messageEl.innerHTML = '';
        } catch (err) {
          messageEl.innerHTML = `<span style="color:red">載入達成換領條件的學生名單失敗：${err.message}</span>`;
        }
      }
    }
  });

  // 載入統計數據
  async function loadStats(email, className) {
    messageEl.innerHTML = '<div class="loading">載入統計中…</div>';
    statsContainer.style.display = 'none';

    // 暫時禁用卡片點擊
    achievedCard.onclick = null;
    achievedCard.style.cursor = 'default';
    achievedCard.title = '';

    try {
      const stats = await getStats(email, className);
      document.getElementById('totalRecords').textContent = stats.totalRecords;
      document.getElementById('achievedStudents').textContent = stats.achievedStudents;
      document.getElementById('redeemedCount').textContent = stats.redeemedCount;
      document.getElementById('displayClass').textContent = stats.class === '*' ? '全部' : stats.class;

      // ✅ 關鍵修正：從 classSelect 讀取當前班級，而非 stats
      achievedCard.onclick = () => {
        const currentClass = classSelect.value;
        if (currentClass === '*') {
          alert('請先選擇單一班級以查看明細');
          return;
        }
        window.location.href = `details.html?class=${encodeURIComponent(currentClass)}`;
      };
      achievedCard.style.cursor = 'pointer';
      achievedCard.title = '點擊查看明細';

      messageEl.innerHTML = '';
      statsContainer.style.display = 'block';
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">載入失敗：${err.message}</span>`;
      statsContainer.style.display = 'none';

      // 錯誤時確保卡片不可點
      achievedCard.onclick = null;
      achievedCard.style.cursor = 'default';
      achievedCard.title = '';
    }
  }

  // 顯示達成換領條件的學生名單
  function displayAchievedStudents(students) {
    if (!students || students.length === 0) {
      achievedStudentsList.innerHTML = '<p style="text-align: center; color: #7f8c8d; font-style: italic;">沒有達成換領條件的學生</p>';
      return;
    }

    // 根據班級和學生姓名排序
    students.sort((a, b) => {
      if (a.class !== b.class) {
        return a.class.localeCompare(b.class, 'zh-TW');
      }
      return a.studentName.localeCompare(b.studentName, 'zh-TW');
    });

    const html = students.map(student => `
      <div class="achieved-student-item">
        <div class="achieved-student-header">${student.class} - ${student.studentName}</div>
        <div class="achieved-student-details">達成日期: ${formatDate(student.achievedDate)} | 出席次數: ${student.attendanceCount}</div>
        ${student.attendanceDates ? `<div class="achieved-student-details">出席日期: ${student.attendanceDates.map(date => formatDate(date)).join(', ')}</div>` : ''}
      </div>
    `).join('');

    achievedStudentsList.innerHTML = html;
  }

  // 格式化日期
  function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW');
  }
}