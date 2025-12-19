// js/main-form.js
import { getCurrentUser, getUserRole, logout, onRoleLoaded } from './auth.js';
import { getAllClasses, getStudentsByClass, recordAttendance } from './api.js';

// 僅在 form.html 執行
if (!document.getElementById('attendanceForm')) {
  console.warn('main-form.js 被載入到非 form.html 頁面');
} else {
  initFormPage();
}

function initFormPage() {
  const classSelect = document.getElementById('classSelect');
  const studentSelect = document.getElementById('studentSelect');
  const dateInputGroup = document.getElementById('dateInputGroup');
  const dateInput = document.getElementById('dateInput'); // 用於管理 required
  const supplementMode = document.getElementById('supplementMode');
  const redeemedCheck = document.getElementById('redeemedCheck');
  const redeemDateLabel = document.getElementById('redeemDateLabel');
  const submitBtn = document.getElementById('submitBtn');
  const messageEl = document.getElementById('message');

  // 安全檢查：所有必要元素必須存在
  if (!(
    classSelect && studentSelect && dateInputGroup && dateInput &&
    supplementMode && redeemedCheck && redeemDateLabel && submitBtn
  )) {
    console.error('main-form.js: 缺少必要 DOM 元素，請檢查 form.html');
    return;
  }

  // 初始化：普通模式（日期必填）
  dateInput.setAttribute('required', 'required');
  submitBtn.disabled = true;

  // 登出
  document.getElementById('logoutBtn').onclick = logout;

  // 補領模式切換
  supplementMode.onchange = () => {
    if (supplementMode.checked) {
      // 補領模式：隱藏日期，移除必填
      dateInputGroup.style.display = 'none';
      dateInput.removeAttribute('required');
      redeemedCheck.checked = true;
      redeemDateLabel.style.display = 'flex';
    } else {
      // 普通模式：顯示日期，設為必填
      dateInputGroup.style.display = 'block';
      dateInput.setAttribute('required', 'required');
      redeemedCheck.checked = false;
      redeemDateLabel.style.display = 'none';
    }
  };

  // 切換「已換領」
  redeemedCheck.onchange = function () {
    redeemDateLabel.style.display = this.checked ? 'flex' : 'none';
  };

  // 表單提交
  document.getElementById('attendanceForm').onsubmit = async (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) {
      alert('請先登入');
      return;
    }

    try {
      const isSupplement = supplementMode.checked;
      let data;

      if (isSupplement) {
        // 補領模式：不需要參與日期
        const redeemDate = document.getElementById('redeemDateInput').value;
        if (!redeemDate) {
          throw new Error("補領登記必須填寫換領日期");
        }
        data = {
          className: classSelect.value,
          studentName: studentSelect.value,
          attendanceDate: "", // 留空
          redeemed: true,
          redeemDate: redeemDate,
          email: user.email
        };
      } else {
        // 普通模式
        const attendanceDate = dateInput.value;
        if (!attendanceDate) {
          throw new Error("請選擇參與日期");
        }
        data = {
          className: classSelect.value,
          studentName: studentSelect.value,
          attendanceDate: attendanceDate,
          redeemed: redeemedCheck.checked,
          redeemDate: redeemedCheck.checked ? document.getElementById('redeemDateInput').value : '',
          email: user.email
        };
      }

      await recordAttendance(data);
      messageEl.innerHTML = '<span style="color:green">✓ 登記成功！</span>';
      
      // 清空表單（保留班級/學生）
      if (!isSupplement) {
        dateInput.value = '';
      }
      document.getElementById('redeemDateInput').value = '';
      redeemedCheck.checked = false;
      redeemDateLabel.style.display = 'none';
      // 重置模式
      supplementMode.checked = false;
      dateInputGroup.style.display = 'block';
      dateInput.setAttribute('required', 'required');
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">⚠️ ${err.message}</span>`;
    }
  };

  // 監聽權限載入完成
  onRoleLoaded(async (role) => {
    const user = getCurrentUser();
    if (!user) return;

    try {
      updateStatus('載入班級中…', true);
      const classes = await getAllClasses();

      if (role.role === 'admin') {
        classSelect.innerHTML = '';
        classes.forEach(cls => {
          const opt = document.createElement('option');
          opt.value = cls;
          opt.textContent = cls;
          classSelect.appendChild(opt);
        });
        classSelect.disabled = false;
        if (classes.length > 0) {
          await loadStudentsForClass(classes[0]);
        }
      } else if (role.role === 'teacher') {
        const cls = role.classes[0];
        classSelect.innerHTML = `<option value="${cls}">${cls}</option>`;
        classSelect.disabled = true;
        if (cls) await loadStudentsForClass(cls);
      }

      submitBtn.disabled = false;
    } catch (err) {
      messageEl.innerHTML = `<span style="color:red">初始化失敗：${err.message}</span>`;
      classSelect.disabled = true;
    }
  });

  // 班級切換
  classSelect.addEventListener('change', async () => {
    if (classSelect.value) {
      await loadStudentsForClass(classSelect.value);
    }
  });

  // 載入學生
  async function loadStudentsForClass(className) {
    studentSelect.disabled = true;
    studentSelect.innerHTML = '<option value="">載入中…</option>';

    try {
      const students = await getStudentsByClass(className);
      studentSelect.innerHTML = students.length
        ? students.map(name => `<option>${name}</option>`).join('')
        : '<option value="">無學生資料</option>';
    } catch (err) {
      studentSelect.innerHTML = '<option value="">載入失敗</option>';
    } finally {
      studentSelect.disabled = false;
    }
  }

  // 全局狀態提示
  function updateStatus(text, disableSubmit = false) {
    classSelect.innerHTML = `<option>${text}</option>`;
    classSelect.disabled = true;
    studentSelect.innerHTML = '<option>請先選擇班級</option>';
    studentSelect.disabled = true;
    if (disableSubmit) {
      submitBtn.disabled = true;
    }
  }
}