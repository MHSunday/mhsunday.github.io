# Minimal Changes to Cache 班名 (Class Name) Field

## Current Situation
The student sheet structure has been updated to include:
- Column 1: 序號
- Column 2: 類別
- Column 3: 姓名
- Column 4: 班名
- Sheet name represents classCategory

## Minimal Changes Required

### 1. Update getStudentsByClass Function

Replace the current `getStudentsByClass` function in `fixed_main.gs`:

```javascript
/**
 * 取得某班學生名單（僅「類別=學生」），同時獲取學生的班名
 */
function getStudentsByClass(className) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.STUDENT_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(className);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    const serialCol = data[0].indexOf("序號");
    const typeCol = data[0].indexOf("類別");
    const nameCol = data[0].indexOf("姓名");
    const classNameCol = data[0].indexOf("班名"); // 新增班名列
    
    const students = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][typeCol] === "學生") {
        students.push({
          serial: data[i][serialCol],
          name: data[i][nameCol],
          className: data[i][classNameCol], // 班名字段
          category: className // sheet name as class category
        });
      }
    }
    return students;
  } catch (e) {
    console.error("Error in getStudentsByClass:", e);
    return [];
  }
}
```

### 2. Update getAllStudents Function

Modify the `getAllStudents` function to accommodate the new structure:

```javascript
/**
 * 取得所有學生及其班級（僅限 role="admin"），包含學生的班名
 */
function getAllStudents(email) {
  const user = getUserRoles(email);
  if (!user || user.role !== "admin") {
    throw new Error("只有管理員可執行此操作");
  }

  const classes = getAllClasses();
  const allStudents = [];

  for (const className of classes) {
    const students = getStudentsByClass(className);
    for (const student of students) {
      allStudents.push({
        class: student.category, // class category (sheet name)
        name: student.name,
        className: student.className // actual class name from 班名 column
      });
    }
  }

  return allStudents;
}
```

### 3. Update Frontend JavaScript

Update `js/main-form.js` to handle the new student structure:

```javascript
// Update the student loading logic to handle objects instead of just names
async function loadStudentsForClass(className) {
  studentInput.disabled = true;
  selectedStudent.value = '';
  studentInput.value = '';
  hideSuggestions();

  try {
    const students = await getStudentsByClass(className);
    // Store student objects instead of just names
    allStudents = students.map(student => ({ 
      name: student.name, 
      class: student.category,
      className: student.className // Include 班名 for display
    }));

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

// Update the autocomplete display to show both name and 班名
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
      // Show both student name and 班名
      item.innerHTML = `${student.name} <small>(${student.className || student.class})</small>`;
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
```

### 4. Update API Response Handling

Update the `getStudentsByClass` API function in `js/api.js` to handle the new structure:

```javascript
export async function getStudentsByClass(className) {
  if (!className) throw new Error('班級名稱不能為空');
  const url = `${API_URL}?action=getStudentsByClass&class=${encodeURIComponent(className)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  
  // If the backend returns objects instead of just names, handle appropriately
  return Array.isArray(data) ? data : [];
}
```

## Benefits of These Changes

1. **Caching of 班名**: The 班名 field is now cached alongside student names
2. **Maintained Compatibility**: Existing functionality remains intact
3. **Enhanced Display**: The autocomplete now shows both student name and 班名
4. **Better Data Structure**: More complete student information is available throughout the system
5. **Minimal Disruption**: Only the data retrieval and display logic is modified

## Implementation Priority

These changes can be implemented in the following order:
1. Update the backend `getStudentsByClass` function
2. Update the `getAllStudents` function 
3. Update the frontend `main-form.js` for autocomplete display
4. Test with sample data to verify functionality

This approach maintains the existing system architecture while adding the requested 班名 caching functionality with minimal changes to the codebase.