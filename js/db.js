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
  return snap.docs.map(d => d.id).sort();
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
// ==========================================

export async function getRollCall(className, date) {
  if (!className || !date) return [];
  const snap = await db.collection('rollcalls').doc(className).collection(date).get();
  const marks = {};
  snap.forEach(d => { marks[d.id] = d.data(); });
  const roster = await getRoster(className);
  return roster.map(s => ({
    ...s,
    present: marks[s.name] ? marks[s.name].present : null,
    mass: marks[s.name] ? marks[s.name].mass : null
  }));
}

export async function saveRollCall(className, date, records) {
  if (!className || !date || !Array.isArray(records)) throw new Error('缺少必要參數');
  const batch = db.batch();
  const recorder = recorderEmail();
  const ts = new Date().toISOString();
  let added = 0;
  for (const r of records) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    const ref = db.collection('rollcalls').doc(className).collection(date).doc(name);
    batch.set(ref, {
      present: r.present === true,
      mass: r.mass === true,
      category: r.category || '學生',
      className: r.className || className,
      recorder: recorder,
      timestamp: ts
    }, { merge: true });
    added++;
  }
  await batch.commit();
  return { success: true, updated: added, added: 0 };
}

export async function getRollCallYear(className) {
  // web SDK 冇 listCollections()，改為對 sessions 嘅每個日期逐日查
  const sessions = await getSessions();
  const result = {};
  await Promise.all(sessions.map(async (s) => {
    const snap = await db.collection('rollcalls').doc(className).collection(s.date).get();
    if (snap.empty) return;
    result[s.date] = {};
    snap.forEach(d => {
      const dt = d.data();
      result[s.date][d.id] = { present: dt.present === true, mass: dt.mass === true };
    });
  }));
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
  const [roster, sessions, yearMarks] = await Promise.all([
    getRoster(className),
    getSessions(),
    getRollCallYear(className)
  ]);
  const today = todayStr();
  const classDays = sessions.filter(s => isClassDay(s) && s.date <= today).sort((a, b) => a.date < b.date ? -1 : 1);

  let presentCount = 0;
  let totalCount = 0;
  for (const s of classDays) {
    const marks = yearMarks[s.date] || {};
    roster.forEach(m => {
      if (marks[m.name] && marks[m.name].present === true) presentCount++;
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
