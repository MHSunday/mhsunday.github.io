// tests/lib/mocks.js — 測試用嘅 Firebase auth / data / api 替身
// 只會喺瀏覽器測試 context 用，唔會影響正式程式。

export const CLASS1 = '一年級';
export const CLASS2 = '二年級';
export const STUDENT_CAT = '學生';
export const TEACHER_CAT = '老師';

export const CLASSES = [CLASS1, CLASS2];

export const ROSTER = [
  { name: 'A Chan', category: STUDENT_CAT },
  { name: 'B Lee', category: STUDENT_CAT },
  { name: 'C Wong', category: TEACHER_CAT }
];

export const SESSIONS = [
  { date: '2026-09-20', title: 'Sunday 25', event: '' },
  { date: '2026-09-27', title: 'Sunday 26', event: 'holiday' }
];

/** 測試角色：teacher 只擁有 CLASS1；staff 冇班別 */
export const ROLES = {
  admin: { role: 'admin', classes: [CLASS1, CLASS2], email: 'admin@test.local' },
  teacher: { role: 'teacher', classes: [CLASS1], email: 'teacher@test.local' },
  staff: { role: 'staff', classes: [], email: 'staff@test.local' },
  anon: null
};

const j = (v) => JSON.stringify(v);

/** js/data.js 嘅替身（會記錄呼叫嘅 function 名，方便斷言） */
export const STUB_DATA = `
const track = (name, fn) => (...args) => {
  try { (window.__dataCalls || (window.__dataCalls = [])).push(name); } catch (e) {}
  return fn(...args);
};
const CLASSES = ${j(CLASSES)};
const ROSTER = ${j(ROSTER)};
const SESSIONS = ${j(SESSIONS)};
export const getAllClasses = track('getAllClasses', async () => CLASSES);
export const getSessions = track('getSessions', async () => SESSIONS);
export const saveSessions = track('saveSessions', async () => ({}));
export const getRoster = track('getRoster', async () => ROSTER);
export const getClassRoster = track('getClassRoster', async () => ROSTER.map(r => r.name));
export const getRollCall = track('getRollCall', async () => ({}));
export const saveRollCall = track('saveRollCall', async () => ({}));
export const getRollCallYear = track('getRollCallYear', async () => ({}));
export const getStudentDetails = track('getStudentDetails', async () => []);
export const getClassPortal = track('getClassPortal', async (c) => ({
  className: c, roster: ROSTER, rosterCount: ROSTER.length,
  todaySession: SESSIONS[0], sessions: SESSIONS,
  links: { studentList: '', receipt: '', attendanceSheet: '' },
  formLink: '', details: []
}));
export const resetSessions = track('resetSessions', async () => ({}));
export const importDefaultSessions = track('importDefaultSessions', async () => ({}));
export const getAttendanceStats = track('getAttendanceStats', async () => ({}));
export const syncAllFromGAS = track('syncAllFromGAS', async () => ({}));
export const syncSessionsFromGAS = track('syncSessionsFromGAS', async () => ({}));
export const syncPermissionsFromGAS = track('syncPermissionsFromGAS', async () => ({}));
export const exportRollcallsToGAS = track('exportRollcallsToGAS', async () => ({}));
export const invalidateRollcallYearCache = track('invalidateRollcallYearCache', () => {});
export const getClassTodos = track('getClassTodos', async () => []);
export const saveClassTodo = track('saveClassTodo', async () => ({}));
export const deleteClassTodo = track('deleteClassTodo', async () => ({}));
export const setClassTodoDone = track('setClassTodoDone', async () => ({}));
export const getNotices = track('getNotices', async () => []);
export const saveNotice = track('saveNotice', async () => ({}));
export const deleteNotice = track('deleteNotice', async () => ({}));
export const setNoticePinned = track('setNoticePinned', async () => ({}));
export const getCalendarConfigs = track('getCalendarConfigs', async () => []);
export const getCalendarConfig = track('getCalendarConfig', async () => ({}));
export const saveCalendarConfig = track('saveCalendarConfig', async () => ({}));
export const getClassCalendar = track('getClassCalendar', async () => ({}));
export const saveClassCalendar = track('saveClassCalendar', async () => ({}));
export const markClassCalendarPushed = track('markClassCalendarPushed', async () => ({}));
export const getRewardConfig = track('getRewardConfig', async (y) => ({
  schoolYear: y, threshold: 5, startDate: '2026-09-01', endDate: '2027-05-31',
  categories: [${j(STUDENT_CAT)}], rewardTiers: []
}));
export const saveRewardConfig = track('saveRewardConfig', async () => ({}));
export const getRewardClaims = track('getRewardClaims', async () => []);
export const saveRewardClaim = track('saveRewardClaim', async () => ({}));
export const saveRewardClaims = track('saveRewardClaims', async () => ({}));
export const voidRewardClaim = track('voidRewardClaim', async () => ({}));
export const getPrayerCount = track('getPrayerCount', async () => 0);
export const getAllPrayerCounts = track('getAllPrayerCounts', async () => ({}));
export const savePrayerCount = track('savePrayerCount', async () => ({}));
`;

/** js/api.js 嘅替身（會記錄呼叫嘅 function 名，方便斷言） */
export const STUB_API = `
const track = (name, fn) => (...args) => {
  try { (window.__apiCalls || (window.__apiCalls = [])).push(name); } catch (e) {}
  return fn(...args);
};
const CLASSES = ${j(CLASSES)};
export const getAllClasses = track('getAllClasses', async () => CLASSES);
export const getStats = track('getStats', async (email, cls) => ({
  totalRecords: 0, achievedStudents: 0, redeemedCount: 0, class: cls || '*'
}));
export const getAchievedStudents = track('getAchievedStudents', async () => []);
export const getUnredeemedRecords = track('getUnredeemedRecords', async () => []);
export const getClassBasedPendingRedemptionReport = track('getClassBasedPendingRedemptionReport', async () => ({}));
export const getGlobalRedemptionStats = track('getGlobalRedemptionStats', async () => ({
  total: 0, mass: 0, redeemed: 0, pending: 0, redeemedCount: 0, outstandingCount: 0
}));
export const fetchAttendanceDetails = track('fetchAttendanceDetails', async () => []);
export const getAllStudents = track('getAllStudents', async () => []);
export const getStudentsByClass = track('getStudentsByClass', async () => []);
export const recordAttendance = track('recordAttendance', async () => ({ success: true }));
export const updateRedeemStatus = track('updateRedeemStatus', async () => ({ success: true }));
export const batchUpdateRedeemStatus = track('batchUpdateRedeemStatus', async () => ({ success: true }));
export const backupFirestoreToDrive = track('backupFirestoreToDrive', async () => ({
  docCount: 0, gzippedBytes: 0, fileName: 'test.json.gz'
}));
export const importClassCalendarDoc = track('importClassCalendarDoc', async () => ({}));
export const publishClassCalendarDoc = track('publishClassCalendarDoc', async () => ({}));
export const seedCalendarConfigs = track('seedCalendarConfigs', async () => ({}));
`;

/** 喺任何 page script 之前執行：設定角色 cache、firebase 替身、實用嘅測試 hook */
export function rolePreload(roleKey) {
  const roleData = ROLES[roleKey] || null;
  return `(() => {
    const roleData = ${j(roleData)};
    const roleKey = ${j(roleKey)};
    try {
      if (roleData) {
        localStorage.setItem('userRoleCache', JSON.stringify({ role: roleData, ts: Date.now(), email: roleData.email }));
        sessionStorage.setItem('userRole', JSON.stringify(roleData));
      } else {
        localStorage.removeItem('userRoleCache');
        sessionStorage.removeItem('userRole');
      }
    } catch (e) {}
    window.__testRole = roleKey;

    // 用測試 hook 取代 blocking dialog，令流程穩定同可斷言
    window.__alerts = [];
    window.alert = (msg) => { try { window.__alerts.push(String(msg)); } catch (e) {} };
    window.confirm = () => true;
    window.prompt = () => '2026-11-08';

    // 極簡 visibility CSS：tailwind CDN 喺測試入面係空檔，唔會提供 .hidden
    const applyCss = () => {
      if (!document.documentElement) return;
      if (document.getElementById('__test_visibility_css')) return;
      const style = document.createElement('style');
      style.id = '__test_visibility_css';
      style.textContent = '.hidden{display:none !important}[hidden]{display:none !important}';
      (document.head || document.documentElement).appendChild(style);
    };
    applyCss();
    if (document.documentElement) {
      new MutationObserver(applyCss).observe(document.documentElement, { childList: true, subtree: true });
    }

    const fakeUser = roleData ? {
      email: roleData.email,
      uid: 'test-uid',
      displayName: 'Test User',
      photoURL: '',
      getIdToken: async () => 'test-id-token'
    } : null;

    const authObj = {
      currentUser: fakeUser,
      setPersistence: () => Promise.resolve(),
      getRedirectResult: () => Promise.resolve({ user: null }),
      onAuthStateChanged: (cb) => {
        setTimeout(() => { try { cb(fakeUser); } catch (e) { console.error('authcb', e); } }, 40);
        return () => {};
      },
      signInWithPopup: () => Promise.resolve({ user: fakeUser }),
      signOut: () => Promise.resolve()
    };

    const firebaseStub = {
      apps: [],
      initializeApp: () => ({}),
      auth: Object.assign(() => authObj, {
        Auth: { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } },
        GoogleAuthProvider: function () { this.setCustomParameters = () => {}; }
      })
    };
    Object.defineProperty(window, 'firebase', { value: firebaseStub, configurable: true, writable: true });
  })();`;
}

/** 喺頁面收集 snapshot 嘅 JS expression（browser.js 會 evaluate） */
export const SNAPSHOT_EXPR = `(() => {
  const isVisible = (el) => {
    if (!el) return false;
    if (el.closest('.hidden, [hidden]')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  };
  const visibleIds = [];
  const hiddenIds = [];
  document.querySelectorAll('[id]').forEach(el => {
    (isVisible(el) ? visibleIds : hiddenIds).push(el.id);
  });
  const links = [];
  document.querySelectorAll('a[href]').forEach(a => {
    links.push({
      id: a.id || '',
      href: a.getAttribute('href') || '',
      text: (a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
      visible: isVisible(a)
    });
  });
  const actions = [];
  document.querySelectorAll('[onclick]').forEach(el => {
    const oc = el.getAttribute('onclick') || '';
    if (!/location\\.(?:href|replace)/.test(oc)) return;
    const m = oc.match(/['"]([^'"]+\\.html[^'"]*)['"]/);
    actions.push({
      id: el.id || '',
      href: m ? m[1] : '',
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
      visible: isVisible(el)
    });
  });
  const activeTab = (document.querySelector('.tab-btn.active') || {}).id || '';
  const classSelect = document.getElementById('classSelect');
  return {
    pathname: location.pathname,
    search: location.search,
    title: document.title,
    readyState: document.readyState,
    visibleIds: [...new Set(visibleIds)],
    hiddenIds: [...new Set(hiddenIds)],
    links,
    actions,
    activeTab,
    message: ((document.getElementById('message') || {}).innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 300),
    bodyText: ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').trim().slice(0, 400),
    classOptionCount: classSelect ? classSelect.options.length : null,
    classSelectValue: classSelect ? classSelect.value : null,
    classSelectDisabled: classSelect ? classSelect.disabled : null,
    alerts: Array.isArray(window.__alerts) ? window.__alerts.slice(0, 20) : [],
    apiCalls: Array.isArray(window.__apiCalls) ? [...new Set(window.__apiCalls)] : [],
    dataCalls: Array.isArray(window.__dataCalls) ? [...new Set(window.__dataCalls)] : []
  };
})()`;
