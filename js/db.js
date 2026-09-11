// js/db.js — Firestore 資料層（每班 Portal / 課堂點名 專用）
// 用 Firebase v8 namespaced SDK（與 auth.js 一致，無需 build step）。
// 路徑模型：見 plans/firestore_design.md + plans/firestore.rules
//
//   /classes/{className}
//   /roster/{className}/members/{name}
//   /sessions/{date}
//   /rollcalls/{className}/{date}/{name}
//   /studentDetails/{className}/students/{name}
//   /classLinks/{className}
//   /permissions/{email}
//
// 呢個檔案只畀 USE_FIRESTORE=true 時用（由 data.js 切換）。

import { APP_CONFIG } from './config.js';
import * as gas from './api.js';
import { sortClasses } from './classOrder.js';

if (!firebase.apps.length) {
  firebase.initializeApp(APP_CONFIG.firebase);
}
const db = firebase.firestore();

const SCHOOL_YEAR_START = '2026-09-06';
const SCHOOL_YEAR_END = '2027-06-20';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function recorderEmail() {
  return (firebase.auth().currentUser && firebase.auth().currentUser.email) || '';
}

// ==========================================
// 班級 + 名單
// ==========================================

export async function getAllClasses() {
  const snap = await db.collection('classes').get();
  return sortClasses(snap.docs.map(d => d.id));
}

export async function getRoster(className) {
  const snap = await db.collection('roster').doc(className).collection('members').get();
  return snap.docs
    .map(d => ({ name: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function getClassRoster(className) {
  return getRoster(className);
}

// ==========================================
// 上堂日曆（sessions）
// ==========================================

export async function getSessions() {
  const snap = await db.collection('sessions').get();
  return snap.docs
    .map(d => ({ date: d.id, ...d.data() }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function saveSessions(records) {
  const list = Array.isArray(records) ? records : [];
  const batch = db.batch();
  for (const s of list) {
    if (!s.date) continue;
    batch.set(db.collection('sessions').doc(s.date), {
      date: s.date,
      title: String(s.title || '').trim(),
      event: String(s.event || '').trim()
    }, { merge: true });
  }
  await batch.commit();
  return { success: true, count: list.length };
}

/** 一鍵重置：學年範圍內全部週日（title/event 留空） */
export async function resetSessions() {
  const rows = [];
  const start = new Date(SCHOOL_YEAR_START + 'T00:00:00');
  const end = new Date(SCHOOL_YEAR_END + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) {
      rows.push({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, title: '', event: '' });
    }
  }
  return saveSessions(rows);
}

/** import 2026-27 預設日曆（原本喺 GAS 編輯器 RUN_ImportSessionsCalendar） */
export async function importDefaultSessions() {
  const calendar = [
    { date: '2026-09-06', title: '常年期第23主日', event: '' },
    { date: '2026-09-13', title: '常年期第24主日', event: '' },
    { date: '2026-09-20', title: '常年期第25主日', event: '開學禮/課堂須知/班名解釋' },
    { date: '2026-09-27', title: '常年期第26主日', event: '' },
    { date: '2026-10-04', title: '常年期第27主日', event: '' },
    { date: '2026-10-11', title: '常年期第28主日', event: '青少年彌撒' },
    { date: '2026-10-18', title: '常年期第29主日', event: '假期：重陽節' },
    { date: '2026-10-25', title: '常年期第30主日', event: '' },
    { date: '2026-11-01', title: '諸聖節', event: '諸聖節' },
    { date: '2026-11-08', title: '常年期第32主日', event: '' },
    { date: '2026-11-15', title: '常年期第33主日', event: '兒童彌撒' },
    { date: '2026-11-22', title: '基督普世君王節', event: '' },
    { date: '2026-11-29', title: '將臨期第1主日', event: '' },
    { date: '2026-12-06', title: '將臨期第2主日', event: '本堂堂慶' },
    { date: '2026-12-13', title: '將臨期第3主日', event: '' },
    { date: '2026-12-20', title: '將臨期第4主日', event: '假期：聖誕假期' },
    { date: '2026-12-27', title: '聖家節', event: '假期：聖誕假期' },
    { date: '2027-01-03', title: '主顯節', event: '慶祝會' },
    { date: '2027-01-10', title: '主受洗節', event: '' },
    { date: '2027-01-17', title: '常年期第2主日', event: '青少年彌撒' },
    { date: '2027-01-24', title: '常年期第3主日', event: '' },
    { date: '2027-01-31', title: '常年期第4主日', event: '' },
    { date: '2027-02-07', title: '常年期第5主日', event: '假期：農曆新年' },
    { date: '2027-02-14', title: '四旬期第1主日', event: '' },
    { date: '2027-02-21', title: '四旬期第2主日', event: '兒童彌撒' },
    { date: '2027-02-28', title: '四旬期第3主日', event: '' },
    { date: '2027-03-07', title: '四旬期第4主日', event: '青少年彌撒' },
    { date: '2027-03-14', title: '四旬期第5主日', event: '戶外活動' },
    { date: '2027-03-21', title: '基督苦難主日（聖枝主日）', event: '聖枝主日' },
    { date: '2027-03-28', title: '復活主日', event: '假期：復活節' },
    { date: '2027-04-04', title: '復活期第2主日', event: '' },
    { date: '2027-04-11', title: '復活期第3主日', event: '' },
    { date: '2027-04-18', title: '復活期第4主日', event: '兒童彌撒' },
    { date: '2027-04-25', title: '復活期第5主日', event: '' },
    { date: '2027-05-02', title: '復活期第6主日', event: '' },
    { date: '2027-05-09', title: '耶穌升天節', event: '母親節/交所有成績及得獎名單' },
    { date: '2027-05-16', title: '聖神降臨節', event: '領堅振' },
    { date: '2027-05-23', title: '天主聖三主日', event: '結業禮' },
    { date: '2027-05-30', title: '耶穌聖體聖血節', event: '初領聖體' },
    { date: '2027-06-06', title: '常年期第10主日', event: '' },
    { date: '2027-06-13', title: '常年期第11主日', event: '' },
    { date: '2027-06-20', title: '常年期第12主日', event: '父親節' }
  ];
  return saveSessions(calendar);
}

// ==========================================
// 課堂點名（rollcalls）
// Schema：rollcalls/{className}/dates/{date}
//   { date, className, updatedAt, recorder,
//     marks: { "陳小明": { present, mass, category }, ... } }
// 好處：1 write/save、1 read/year、可行 collection group query
// ==========================================

export async function getRollCall(className, date) {
  if (!className || !date) return [];
  const snap = await db.collection('rollcalls').doc(className).collection('dates').doc(date).get();
  const marks = snap.exists ? (snap.data().marks || {}) : {};
  const roster = await getRoster(className);
  return roster.map(s => {
    const m = marks[s.name];
    return {
      ...s,
      present: m ? m.present === true : null,
      mass: m ? m.mass === true : null
    };
  });
}

export async function saveRollCall(className, date, records) {
  if (!className || !date || !Array.isArray(records)) throw new Error('缺少必要參數');
  const recorder = recorderEmail();
  const marks = {};
  let updated = 0;
  for (const r of records) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    marks[name] = {
      present: r.present === true,
      mass: r.mass === true,
      category: r.category || '學生',
      className: r.className || className
    };
    updated++;
  }
  const ref = db.collection('rollcalls').doc(className).collection('dates').doc(date);
  await ref.set({
    date: date,
    className: className,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    recorder: recorder,
    marks: marks
  }, { merge: true });

  // 物化 parent doc（令 collection 可枚舉 + lastDate 方便查詢）
  await db.collection('rollcalls').doc(className).set({
    className: className,
    lastDate: date,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true, updated: updated, added: 0 };
}

const ROLLCALL_YEAR_CACHE_KEY = 'rollcallYearCache';
const ROLLCALL_YEAR_CACHE_TTL = 5 * 60 * 1000;

function yearCacheGet(className) {
  try {
    const raw = sessionStorage.getItem(ROLLCALL_YEAR_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    const entry = cache[className];
    if (!entry) return null;
    if (Date.now() - entry.ts > ROLLCALL_YEAR_CACHE_TTL) {
      delete cache[className];
      sessionStorage.setItem(ROLLCALL_YEAR_CACHE_KEY, JSON.stringify(cache));
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function yearCacheSet(className, data) {
  try {
    const raw = sessionStorage.getItem(ROLLCALL_YEAR_CACHE_KEY);
    const cache = raw ? JSON.parse(raw) : {};
    cache[className] = { ts: Date.now(), data };
    sessionStorage.setItem(ROLLCALL_YEAR_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // sessionStorage full or unavailable; fail silently
  }
}

export function invalidateRollcallYearCache(className) {
  try {
    const raw = sessionStorage.getItem(ROLLCALL_YEAR_CACHE_KEY);
    if (!raw) return;
    const cache = JSON.parse(raw);
    delete cache[className];
    sessionStorage.setItem(ROLLCALL_YEAR_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // silently ignore
  }
}

export async function getRollCallYear(className) {
  const cached = yearCacheGet(className);
  if (cached) return cached;
  const result = {};
  const snap = await db.collection('rollcalls').doc(className).collection('dates').get();
  snap.forEach(d => {
    const dt = d.data();
    const dayMarks = {};
    Object.keys(dt.marks || {}).forEach(name => {
      const m = dt.marks[name];
      dayMarks[name] = { present: m.present === true, mass: m.mass === true };
    });
    result[d.id] = dayMarks;
  });
  yearCacheSet(className, result);
  return result;
}

// ==========================================
// 學生補充資料 + 班級連結（portal 用）
// ==========================================

export async function getStudentDetails(className) {
  const snap = await db.collection('studentDetails').doc(className).collection('students').get();
  return snap.docs.map(d => ({ name: d.id, ...d.data() }));
}

export async function getClassLink(className) {
  const docRef = db.collection('classLinks').doc(className);
  const snap = await docRef.get();
  return snap.exists ? snap.data() : null;
}

export async function getClassPortal(className) {
  if (!className) throw new Error('缺少必要參數');
  const [roster, sessions, details, classLink] = await Promise.all([
    getRoster(className),
    getSessions(),
    getStudentDetails(className),
    getClassLink(className)
  ]);
  const today = todayStr();
  return {
    className: className,
    links: classLink ? {
      studentList: classLink.studentList || '',
      receipt: classLink.receipt || '',
      attendanceSheet: classLink.attendanceSheet || ''
    } : { studentList: '', receipt: '', attendanceSheet: '' },
    formLink: classLink ? (classLink.formLink || '') : '',
    roster: roster,
    rosterCount: roster.length,
    sessions: sessions,
    todaySession: sessions.find(s => s.date === today) || null,
    details: details
  };
}

// ==========================================
// 出席%（點名最後要可以輸出返 GAS spreadsheet）
// ==========================================

function isClassDay(s) {
  return !(s.event || '').startsWith('假期');
}

/**
 * 計算某班出席統計（截至今日）。
 * 定義（可改）：分母 = 已過嘅「上堂/活動」日（非假期）；分子 = 出席人次。
 * @returns { { eligibleDays, presentCount, totalCount, rate } }
 */
export async function getAttendanceStats(className) {
  const [roster, sessions] = await Promise.all([getRoster(className), getSessions()]);
  const today = todayStr();
  const classDays = sessions.filter(s => isClassDay(s) && s.date <= today).sort((a, b) => a.date < b.date ? -1 : 1);

  const snap = await db.collection('rollcalls').doc(className).collection('dates').get();
  const allMarks = {};
  snap.forEach(d => {
    const dt = d.data();
    Object.keys(dt.marks || {}).forEach(name => {
      if (!allMarks[d.id]) allMarks[d.id] = {};
      allMarks[d.id][name] = dt.marks[name];
    });
  });

  let presentCount = 0;
  let totalCount = 0;
  for (const s of classDays) {
    const dayMarks = allMarks[s.date] || {};
    roster.forEach(m => {
      if (dayMarks[m.name] && dayMarks[m.name].present === true) presentCount++;
      totalCount++;
    });
  }
  return {
    eligibleDays: classDays.length,
    presentCount,
    totalCount,
    rate: totalCount ? Math.round((presentCount / totalCount) * 100) : 0
  };
}

// ==========================================
// 班級待辦（classTodos，管理員頁用）
// ==========================================

export async function getClassTodos(className) {
  if (!className) return [];
  const snap = await db.collection('classTodos').doc(className).collection('todos').get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return String(a.date || '9999').localeCompare(String(b.date || '9999'));
    });
}

export async function saveClassTodo(className, todo) {
  if (!className || !todo || !todo.title) throw new Error('缺少必要參數');
  const id = todo.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.collection('classTodos').doc(className).collection('todos').doc(id).set({
    title: String(todo.title).trim(),
    date: todo.date || '',
    done: todo.done === true,
    link: String(todo.link || '').trim(),
    createdAt: new Date().toISOString(),
    createdBy: recorderEmail()
  }, { merge: true });
  return { id };
}

export async function deleteClassTodo(className, id) {
  if (!className || !id) throw new Error('缺少必要參數');
  await db.collection('classTodos').doc(className).collection('todos').doc(id).delete();
  return { success: true };
}

export async function setClassTodoDone(className, id, done) {
  if (!className || !id) throw new Error('缺少必要參數');
  await db.collection('classTodos').doc(className).collection('todos').doc(id).update({ done: done === true });
  return { success: true };
}

// ==========================================
// 公告 / 檔案（notices）
// ==========================================

export async function getNotices() {
  const snap = await db.collection('notices').get();
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return list.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return String(b.date || '').localeCompare(String(a.date || ''));
  });
}

export async function saveNotice(notice) {
  if (!notice || !notice.title) throw new Error('缺少標題');
  const id = notice.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.collection('notices').doc(id).set({
    title: String(notice.title).trim(),
    body: String(notice.body || '').trim(),
    category: notice.category || '公告',
    date: notice.date || todayStr(),
    link: String(notice.link || '').trim(),
    fileName: String(notice.fileName || '').trim(),
    pinned: notice.pinned === true,
    createdAt: notice.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: recorderEmail()
  }, { merge: true });
  return { id };
}

export async function deleteNotice(id) {
  if (!id) throw new Error('缺少必要參數');
  await db.collection('notices').doc(id).delete();
  return { success: true };
}

export async function setNoticePinned(id, pinned) {
  if (!id) throw new Error('缺少必要參數');
  await db.collection('notices').doc(id).update({ pinned: pinned === true });
  return { success: true };
}

// ==========================================
// 管理員：同步（Sheets ⇄ Firestore）
// ==========================================

async function writeBatchToFirestore_(ref, list, key) {
  const batch = db.batch();
  list.forEach(item => {
    batch.set(ref.doc(item[key]), item, { merge: true });
  });
  if (list.length) await batch.commit();
}

/**
 * 一次過將 Sheets（經 GAS API）同步去 Firestore：
 * 班級清單、每班名單、上堂日曆、班級連結、補充資料、全年點名。
 * 只限 admin（頁面已 gate）。
 */
export async function syncAllFromGAS() {
  const classes = await gas.getAllClasses();
  const classSnapshot = await db.collection('classes').get();
  const existing = new Set(classSnapshot.docs.map(d => d.id));

  for (const cls of classes) {
    await db.collection('classes').doc(cls).set({ name: cls, createdAt: new Date().toISOString() }, { merge: true });

    const roster = await gas.getClassRoster(cls);
    await writeBatchToFirestore_(
      db.collection('roster').doc(cls).collection('members'),
      roster.map((m, i) => ({ name: m.name, serial: m.serial, category: m.category, className: m.className || cls, order: Number(m.serial) || (i + 1) })),
      'name'
    );

    const portal = await gas.getClassPortal(cls);
    if (portal && portal.formLink) {
      await db.collection('classLinks').doc(cls).set({
        formLink: portal.formLink,
        studentList: portal.links.studentList || '',
        receipt: portal.links.receipt || '',
        attendanceSheet: portal.links.attendanceSheet || ''
      }, { merge: true });
    }
    if (Array.isArray(portal.details) && portal.details.length) {
      await writeBatchToFirestore_(db.collection('studentDetails').doc(cls).collection('students'), portal.details.map(d => ({ name: d.name, gender: d.gender || '', school: d.school || '', birthYear: d.birthYear || '', phone: d.phone || '' })), 'name');
    }
  }

  const sessions = await gas.getSessions();
  await writeBatchToFirestore_(db.collection('sessions'), sessions, 'date');

  // 清理已刪班級
  const batch = db.batch();
  classSnapshot.docs.forEach(d => { if (!classes.includes(d.id)) batch.delete(d.ref); });
  if (classSnapshot.docs.length) await batch.commit();

  // 全年點名（逐班，分批避免一次過太大）
  for (const cls of classes) {
    const year = await gas.getRollCallYear(cls);
    for (const [date, marks] of Object.entries(year)) {
      const records = Object.entries(marks).map(([name, present]) => ({ name, present, mass: false }));
      await writeBatchToFirestore_(db.collection('rollcalls').doc(cls).collection(date), records, 'name');
    }
  }

  return { classes: classes.length, sessions: sessions.length };
}

/**
 * 將 Firestore 嘅點名匯出返去 GAS spreadsheet（rollcalls 表）。
 * 管理員喺 admin_sessions.html 撳「匯出點名」觸發。
 */
export async function exportRollcallsToGAS() {
  const classes = await getAllClasses();
  let total = 0;
  for (const cls of classes) {
    const year = await getRollCallYear(cls);
    for (const [date, marks] of Object.entries(year)) {
      const records = [];
      for (const [name, present] of Object.entries(marks)) {
        const snap = await db.collection('rollcalls').doc(cls).collection(date).doc(name).get();
        const data = snap.exists ? snap.data() : {};
        records.push({
          name,
          category: data.category || '學生',
          className: data.className || cls,
          present,
          mass: data.mass === true
        });
      }
      if (records.length) {
        const out = await gas.saveRollCall(cls, date, records);
        total += (out.added || 0) + (out.updated || 0);
      }
    }
  }
  return { exported: total };
}

/**
 * 將 GAS permissions 表同步去 Firestore permissions/{email}（管理員撳掣）。
 * 令老師喺 Firestore 都可以寫自己班點名（rules isTeacherOf 會讀呢度）。
 * @returns { { users: number } }
 */
export async function syncPermissionsFromGAS() {
  const rows = await gas.getPermissions();
  const byEmail = new Map();
  for (const r of rows) {
    if (!r.email) continue;
    if (!byEmail.has(r.email)) byEmail.set(r.email, { email: r.email, role: r.role || '', classes: [] });
    const e = byEmail.get(r.email);
    if (r.class && !e.classes.includes(r.class)) e.classes.push(r.class);
  }
  const batch = db.batch();
  for (const e of byEmail.values()) {
    batch.set(db.collection('permissions').doc(e.email), {
      role: e.role,
      classes: e.classes
    }, { merge: true });
  }
  await batch.commit();
  return { users: byEmail.size };
}
