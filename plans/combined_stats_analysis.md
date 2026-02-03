# Combined Stats Report Analysis

## Issues Identified

### Issue 1: Classes Not Sorted by Classname

**Location**: [`js/main-combined-stats.js`](js/main-combined-stats.js:309-337)

**Problem Description**:
In the `displayAchievedStudents()` and `displayUnredeemedStudents()` functions, classes are displayed in the order they appear in the `groupedStudents` object. JavaScript objects don't maintain a specific order for string keys, so the classes appear unsorted.

**Current Code Flow**:
```javascript
// Line 310-311 in displayAchievedStudents
for (const className in groupedStudents) {
  const classStudents = groupedStudents[className];
```

**Root Cause**:
- Classes are grouped into an object: `groupedStudents[student.class] = []`
- The `for...in` loop iterates over object keys in insertion order (or undefined order)
- No explicit sorting is applied to the class names before display

**Affected Functions**:
1. [`displayAchievedStudents()`](js/main-combined-stats.js:293-341) - line 310
2. [`displayUnredeemedStudents()`](js/main-combined-stats.js:351-391) - line 369

---

### Issue 2: "統計摘要" (Statistics Summary) Tab Not Showing Figures

**Location**: [`js/main-combined-stats.js`](js/main-combined-stats.js:28-31) and [`js/main-combined-stats.js`](js/main-combined-stats.js:192-193)

**Problem Description**:
When the page initializes, the "統計摘要" (Statistics Summary) tab container is hidden and statistics are never loaded on initial page load. The statistics are only loaded when a user changes the class selection.

**Current Code Flow**:

1. **Initialization** (lines 28-31):
```javascript
// Default display - hides stats container
statsContainer.style.display = 'none';
achievedStudentsContainer.style.display = 'none';
unredeemedStudentsContainer.style.display = 'block';
```

2. **Initial Data Load** (lines 192-193):
```javascript
// Only loads unredeemed students list, NOT stats
await loadUnredeemedStudentsList();
```

3. **Stats Only Load on Class Change** (lines 200-228):
```javascript
classSelect.addEventListener('change', async () => {
  // loadStats is only called here
  await loadStats(user.email, classSelect.value);
  // ...
});
```

**Root Cause**:
- The initial page setup displays the "未頒發禮物" (Unredeemed) tab by default (line 259 in HTML: `class="tab-btn active"`)
- On initialization, only `loadUnredeemedStudentsList()` is called (line 193)
- `loadStats()` is never called during initialization
- Statistics remain at default "0" values until user manually changes class selection
- When user clicks "統計摘要" tab, it only shows/hides containers but doesn't trigger `loadStats()`

**Why User Doesn't See Figures**:
1. User loads page → Statistics not loaded
2. User clicks "統計摘要" tab → Only shows the container with "0" values
3. Statistics only load when user changes class dropdown
4. If teacher (no class selection available), statistics never load at all

---

## Solution Plan

### Solution 1: Sort Classes by Classname

**Approach**: 
Sort the class names alphabetically before iterating through them

**Implementation Steps**:
1. After grouping students by class, extract class names into an array
2. Sort the array using `localeCompare()` for proper Chinese sorting
3. Iterate through sorted array instead of using `for...in`

**Example Code Pattern**:
```javascript
// Get class names and sort them
const classNames = Object.keys(groupedStudents).sort((a, b) => 
  a.localeCompare(b, 'zh-TW')
);

// Iterate through sorted class names
for (const className of classNames) {
  const classStudents = groupedStudents[className];
  // ... rest of the code
}
```

**Files to Modify**:
- [`js/main-combined-stats.js`](js/main-combined-stats.js)
  - Function: `displayAchievedStudents()` (~line 310)
  - Function: `displayUnredeemedStudents()` (~line 369)

---

### Solution 2: Load Statistics on Initial Page Load

**Approach**: 
Call `loadStats()` during initialization, after class selection is set up

**Implementation Steps**:
1. After setting up the class selector (lines 158-196), call `loadStats()`
2. Ensure statistics load even for teachers (who have no class selection)
3. Load statistics in parallel with unredeemed students list for better UX

**Implementation Location**:
In the `onRoleLoaded()` callback (lines 158-196), after the class selection is set up:

```javascript
onRoleLoaded(async (role) => {
  // ... existing class setup code ...
  
  // NEW: Load initial statistics
  if (role.role === 'admin') {
    await loadStats(user.email, '*'); // Load all classes stats
  } else if (role.role === 'teacher') {
    await loadStats(user.email, role.classes[0]); // Load teacher's class stats
  }
  
  // Load unredeemed students list (existing code)
  await loadUnredeemedStudentsList();
});
```

**Alternative Approach**: 
When "統計摘要" tab is clicked, check if stats are loaded and load them if needed:

```javascript
statsTab.addEventListener('click', async () => {
  // ... existing tab switching code ...
  
  // NEW: Load stats if not already loaded
  const totalRecords = document.getElementById('totalRecords').textContent;
  if (totalRecords === '0') {
    const user = getCurrentUser();
    if (user && classSelect.value) {
      await loadStats(user.email, classSelect.value);
    }
  }
});
```

**Files to Modify**:
- [`js/main-combined-stats.js`](js/main-combined-stats.js)
  - Function: `initCombinedStatsPage()` initialization (lines 158-196)
  - OR event listener for `statsTab` (lines 115-122)

---

## Recommended Implementation Order

1. **Fix Issue 1 (Class Sorting)** - Simple change, low risk
   - Modify `displayAchievedStudents()` line ~310
   - Modify `displayUnredeemedStudents()` line ~369

2. **Fix Issue 2 (Statistics Display)** - Slightly more complex
   - Option A (Recommended): Load stats on initialization
   - Option B (Alternative): Load stats when tab is clicked

---

## Testing Checklist

After implementing fixes:

- [ ] Classes appear in alphabetical order in "曾達成目標" tab
- [ ] Classes appear in alphabetical order in "未頒發禮物" tab
- [ ] Statistics show correct figures when page loads (for admin viewing all classes)
- [ ] Statistics show correct figures when page loads (for teacher viewing their class)
- [ ] Statistics update correctly when class selection changes
- [ ] "統計摘要" tab shows figures immediately when clicked
- [ ] All three tabs work correctly after switching between them
- [ ] Global statistics ("全局視圖") display correct values

---

## Risk Assessment

**Issue 1 (Sorting)**: 
- **Risk**: Low
- **Impact**: Visual/UX improvement only
- **Reversibility**: Easy to revert

**Issue 2 (Statistics Display)**:
- **Risk**: Low-Medium
- **Impact**: Functional improvement, better UX
- **Reversibility**: Easy to revert
- **Consideration**: May slightly increase initial page load time (negligible)

---

## Additional Notes

### Chinese Sorting
Using `localeCompare(a, b, 'zh-TW')` ensures proper sorting for Chinese characters according to Traditional Chinese locale rules.

### Performance Considerations
- Sorting class names adds minimal overhead (likely < 10 classes)
- Loading stats on initialization adds one extra API call but improves UX significantly
- Consider loading stats and unredeemed list in parallel for faster perceived performance
