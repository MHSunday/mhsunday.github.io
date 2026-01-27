// js/main-form.js
import { getCurrentUser, getUserRole, logout, onRoleLoaded } from './auth.js';
// 假設 api.js 已經新增了 updateRedeemStatus 方法
import { getAllClasses, getStudentsByClass, recordAttendance, updateRedeemStatus, getAllStudents } from './api.js';

// 僅在 form.html 執行
if (!document.getElementById('attendanceForm')) {
  console.warn('main-form.js 被載入到非 form.html 頁面');
} else {
  initFormPage();
}

function initFormPage() {
  const studentInput = document.getElementById('studentInput');
  const studentSuggestions = document.getElementById('studentSuggestions');
  const selectedStudent = document.getElementById('selectedStudent');
  const studentClass = document.getElementById('studentClass');  // Hidden input for student's class
  const dateInputGroup = document.getElementById('dateInputGroup');
  const dateInput = document.getElementById('dateInput');
  const redeemedCheck = document.getElementById('redeemedCheck');
  const redeemDateLabel = document.getElementById('redeemDateLabel');
  const submitBtn = document.getElementById('submitBtn');
  const messageEl = document.getElementById('message');
  const redeemDateInput = document.getElementById('redeemDateInput');

  // 安全檢查
 if (!(
    studentInput && studentSuggestions && selectedStudent && dateInputGroup && dateInput &&
    redeemedCheck && redeemDateLabel && submitBtn && redeemDateInput
  )) {
    console.error('main-form.js: 缺少必要 DOM 元素');
    return;
  }

  // 初始化
  dateInput.setAttribute('required', 'required');
  submitBtn.disabled = true;

  // 登出
  document.getElementById('logoutBtn').onclick = logout;

  // Set default date to today or the most recent Sunday
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 is Sunday
  let defaultDate = new Date(today);
  
  if (dayOfWeek !== 0) { // If today is not Sunday
    // Calculate the most recent Sunday
    const daysToSubtract = dayOfWeek === 0 ? 0 : dayOfWeek;
    defaultDate.setDate(today.getDate() - daysToSubtract);
  }
  
  // Format date as YYYY-MM-DD
  const formattedDate = defaultDate.toISOString().split('T')[0];
  dateInput.value = formattedDate;

  // 切換「已換領」勾選框
  redeemedCheck.onchange = function () {
    if (this.checked) {
      redeemDateLabel.style.display = 'flex';
      redeemDateInput.setAttribute('required', 'required');
    } else {
      redeemDateLabel.style.display = 'none';
      redeemDateInput.removeAttribute('required');
    }
  };

  // 表單提交
  document.getElementById('attendanceForm').onsubmit = async (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) {
      alert('請先登入');
      return;
    }

    // 基礎資料收集
    const studentName = selectedStudent.value || studentInput.value;
    const className = studentClass.value; // Get class from student selection
    const attendanceDate = dateInput.value;
    const redeemDate = redeemDateInput.value;

    if (!attendanceDate) {
      alert("請選擇參與日期（星期日）");
      return;
    }

    // Validate that the selected date is a Sunday
    const dateObj = new Date(attendanceDate);
    if (dateObj.getDay() !== 0) {
      alert("交咭日期必須為星期日！");
      return;
    }

    submitBtn.disabled = true;
    messageEl.innerHTML = '處理中...';

    try {
      // --- 動作：新出席登記 ---
      const payload = {
        className,
        studentName,
        attendanceDate,
        redeemed: redeemedCheck.checked,
        redeemDate: redeemedCheck.checked ? redeemDate : '',
        email: user.email
      };

      await recordAttendance(payload);
      messageEl.innerHTML = '<span style="color:green">✓ 出席登記成功！</span>';
      
      // 成功後重置部分表單
      resetFormAfterSuccess();
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">⚠️ ${err.message}</span>`;
    } finally {
      submitBtn.disabled = false;
    }
  };

  function resetFormAfterSuccess() {
    // Reset date to default (today or most recent Sunday) but keep student selection
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 is Sunday
    let defaultDate = new Date(today);
    
    if (dayOfWeek !== 0) { // If today is not Sunday
      // Calculate the most recent Sunday
      const daysToSubtract = dayOfWeek === 0 ? 0 : dayOfWeek;
      defaultDate.setDate(today.getDate() - daysToSubtract);
    }
    
    // Format date as YYYY-MM-DD
    const formattedDate = defaultDate.toISOString().split('T')[0];
    dateInput.value = formattedDate;
    
    redeemDateInput.value = '';
    redeemedCheck.checked = false;
    redeemDateLabel.style.display = 'none';
  }

  // 監聽權限載入完成
  onRoleLoaded(async (role) => {
    const user = getCurrentUser();
    if (!user) return;

    try {
      // 不使用 updateStatus，直接設置載入狀態
      studentInput.disabled = true;
      studentInput.placeholder = '載入中…';
      submitBtn.disabled = true;
      
      // For admin, load all students; for teacher, load their class students
      if (role.role === 'admin') {
        // 預加載所有班級的學生數據
        try {
          const user = getCurrentUser();
          allStudents = await getAllStudents(user.email);
        } catch (err) {
          console.error('載入所有學生失敗:', err);
          // 回退到逐個載入班級學生的方式
          const allClassStudents = [];
          const classes = await getAllClasses();
          for (const cls of classes) {
            try {
              const classStudents = await getStudentsByClass(cls);
              allClassStudents.push(...classStudents.map(student => ({
                name: typeof student === 'string' ? student : student.name,
                class: cls,
                className: typeof student === 'object' ? student.className : null // Include 班名 if available
              })));
            } catch (err) {
              console.error(`載入班級 ${cls} 學生失敗:`, err);
            }
          }
          allStudents = allClassStudents;
        }
        
        // 更新UI
        studentInput.placeholder = '請輸入或選擇學生姓名';
        studentInput.disabled = false;
        // 確保在預加載完成後，輸入框是可用的
        setTimeout(() => {
          studentInput.disabled = false;
        }, 10);
      } else if (role.role === 'teacher') {
        // 教師只能看到自己的班級
        const cls = role.classes[0];
        
        // 加載教師班級的學生
        await loadStudentsForClass(cls);
        // 確保在教師模式下，所有相關元素都是可用的
        setTimeout(() => {
          studentInput.disabled = false;
        }, 10);
      }

      submitBtn.disabled = false;
      messageEl.innerHTML = ''; // 清除載入中文字
      
      // 確保在初始化完成後，學生輸入框是可用的
      setTimeout(() => {
        studentInput.disabled = false;
      }, 10);
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">初始化失敗：${err.message}</span>`;
    }
  });
  
  // 自動完成功能相關變量
  let currentFocus = -1; // 用於追蹤當前選中的建議項
  
  // 隱藏建議列表
  function hideSuggestions() {
    studentSuggestions.classList.remove('show');
    currentFocus = -1;
    // 移除旋轉類別以恢復箭頭方向
    const dropdownArrow = document.querySelector('.dropdown-arrow');
    if (dropdownArrow) {
      dropdownArrow.classList.remove('rotate');
    }
  }
  
  // 顯示建議列表
  function showSuggestions(matches) {
    studentSuggestions.innerHTML = '';
    
    if (matches.length === 0) {
      const noResultItem = document.createElement('div');
      noResultItem.className = 'autocomplete-no-results';
      noResultItem.textContent = '沒有找到匹配的學生';
      studentSuggestions.appendChild(noResultItem);
    } else {
      matches.forEach((student, index) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        // Show student name with either 班名 or class in parentheses
        const displayClass = student.className || student.class || classSelect.value;
        item.innerHTML = `${student.name} <small>(${displayClass})</small>`;
        item.addEventListener('click', () => {
          studentInput.value = student.name;
          selectedStudent.value = student.name;
          // 自動設置班級為該學生所在的班級
          if (student.class) {
            classSelect.value = student.class;
          }
          hideSuggestions();
        });
        studentSuggestions.appendChild(item);
      });
    }
    
    studentSuggestions.classList.add('show');
    // 添加旋轉類別以旋轉箭頭向下
    const dropdownArrow = document.querySelector('.dropdown-arrow');
    if (dropdownArrow) {
      dropdownArrow.classList.add('rotate');
    }
  }
  
  // 自動完成搜索邏輯
  function autocompleteSearch() {
    const inputValue = studentInput.value.toLowerCase();
    
    // Filter all students based on input
    let filteredStudents = [];
    if (!inputValue) {
      // 如果輸入為空，顯示所有學生
      filteredStudents = allStudents;
    } else {
      // 如果有輸入，進行過濾
      filteredStudents = allStudents.filter(student =>
        student && student.name && student.name.toLowerCase().includes(inputValue)
      );
    }
    
    showSuggestions(filteredStudents);
  }
  
  // 為學生輸入框添加事件監聽器
  studentInput.addEventListener('input', () => {
     autocompleteSearch();
   });
   
   // 顯示所有學生選項當點擊或聚焦且輸入框為空時
   studentInput.addEventListener('focus', () => {
     if (!studentInput.value) {
       autocompleteSearch(); // 這會觸發顯示所有學生（根據當前班級選擇）
     }
   });
   
   // 添加點擊事件以顯示所有選項
   studentInput.addEventListener('click', () => {
     if (!studentInput.value) {
       autocompleteSearch(); // 這會觸發顯示所有學生（根據當前班級選擇）
     }
   });
   
   // 添加點擊下拉箭頭事件以顯示所有選項 - 使用事件委託
   document.addEventListener('click', (e) => {
     if (e.target.closest('.dropdown-arrow')) {
       if (studentSuggestions.classList.contains('show')) {
         // 如果建議列表已顯示，則隱藏它
         hideSuggestions();
       } else {
         // 如果建議列表未顯示，則顯示所有學生
         studentInput.focus();
         if (!studentInput.value) {
           autocompleteSearch(); // 顯示所有學生
         } else {
           autocompleteSearch(); // 顯示匹配的學生
         }
       }
     }
   });
   
   studentInput.addEventListener('keydown', (e) => {
     const items = studentSuggestions.querySelectorAll('.autocomplete-item');
     
     if (!items.length) return; // 如果沒有項目，直接返回
     
     if (e.key === 'ArrowDown') {
       e.preventDefault();
       currentFocus = currentFocus < items.length - 1 ? currentFocus + 1 : 0;
       updateActiveItem(items);
       scrollToActiveItem(items);
     } else if (e.key === 'ArrowUp') {
       e.preventDefault();
       currentFocus = currentFocus > 0 ? currentFocus - 1 : items.length - 1;
       updateActiveItem(items);
       scrollToActiveItem(items);
     } else if (e.key === 'PageDown') {
       e.preventDefault();
       // 移動到下一個可視區域的項目（假設每頁顯示約5個項目）
       currentFocus = Math.min(currentFocus + 5, items.length - 1);
       updateActiveItem(items);
       scrollToActiveItem(items);
     } else if (e.key === 'PageUp') {
       e.preventDefault();
       // 移動到上一個可視區域的項目（假設每頁顯示約5個項目）
       currentFocus = Math.max(currentFocus - 5, 0);
       updateActiveItem(items);
       scrollToActiveItem(items);
     } else if (e.key === 'Enter') {
       e.preventDefault();
       if (currentFocus > -1 && items[currentFocus]) {
         items[currentFocus].click();
       }
     } else if (e.key === 'Escape') {
       hideSuggestions();
     }
   });
   
   // 滾動到當前選中的項目
   function scrollToActiveItem(items) {
     if (currentFocus >= 0 && items[currentFocus]) {
       items[currentFocus].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
     }
   }
   
   // 更新當前選中的項目樣式
  function updateActiveItem(items) {
     items.forEach((item, index) => {
       if (index === currentFocus) {
         item.classList.add('active');
       } else {
         item.classList.remove('active');
       }
     });
   }
   

  // 載入學生
  let allStudents = []; // 用於存儲當前班級或所有班級的學生
  
  async function loadStudentsForClass(className) {
    studentInput.disabled = true;
    selectedStudent.value = '';
    studentInput.value = '';
    hideSuggestions();
    
    try {
      const students = await getStudentsByClass(className);
      // Handle the new structure where students contain more fields
      allStudents = students.map(student => ({
        name: typeof student === 'string' ? student : student.name,
        class: className,
        className: typeof student === 'object' ? student.className : null // Include 班名 if available
      })); // 保存學生列表（對象格式）
      
      if (students.length === 0) {
        studentInput.placeholder = '該班級無學生資料';
      } else {
        studentInput.placeholder = '請輸入或選擇學生姓名';
      }
      
      // 啟用輸入框
      studentInput.disabled = false;
    } catch (err) {
      studentInput.placeholder = '載入學生資料失敗';
      allStudents = [];
    } finally {
      studentInput.disabled = false;
    }
  }
 
  // 點擊外部區域隱藏建議
  document.addEventListener('click', (e) => {
    if (!studentInput.contains(e.target) && !studentSuggestions.contains(e.target)) {
      hideSuggestions();
    }
  });

  function updateStatus(text, disableSubmit = false) {
    studentInput.disabled = true;
    studentInput.placeholder = text;
    selectedStudent.value = '';
    hideSuggestions();
    if (disableSubmit) submitBtn.disabled = true;
  }
}