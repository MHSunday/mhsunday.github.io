# Firestore 整合設計 — 主日學 Portal

> 日期：2026-08-26
> 目的：解決現 GAS + Sheets 架構 class_portal load 過慢（>10s）嘅問題

## 1. 背景

現有問題：
- `getClassPortal` endpoint 同步 fetch 4 個 sheet（sheets 開 SP 多次）
- `getUserRoles` 每次 read permissions sheet
- 每次 load ~10s

## 2. 目標

- Class portal load < 1s
- Roll call save < 500ms（40人 batch）
- 全年矩陣 < 1s（40人 × 42日）
- 保留 Google Sheets 為 roster 編輯界面
- 沿用現有 Firebase Auth（無需新登入）

## 3. 資料模型（Firestore）

```
/schools/mhsunday (singleton doc - school metadata)
       │
       ├── /classes/{className}              # 班級 metadata
       │       { name, category, createdAt }
       │
       ├── /roster/{className}/members/{name}        # 學生/小導師/老師
       │       { serial, category, className, order }
       │
       ├── /sessions/{date}                  # 主日日曆
       │       { date, title, event, order }
       │
       ├── /rollcalls/{className}/{date}/{name}      # 點名記錄
       │       { present, category, recorder, timestamp }
       │
       ├── /studentDetails/{className}/{name}        # Form 補充資料
       │       { gender, school, birthYear, phone, updatedAt }
       │
       ├── /classLinks/{className}           # 表單連結
       │       { formLink, updatedAt }
       │
       └── /permissions/{email}              # 角色權限
               { role, classes }
```

## 4. 索引設計

| 查詢 | 索引 |
|---|---|
| 取得某班 roster | `roster/{className}/members` (collection) |
| 取得全 sessions | `sessions` (collection) |
| 取得某日點名 | `rollcalls/{className}/{date}` (collection) |
| 取得某班全年點名 | `rollcalls/{className}` (collection) — 然後 nested query |
| 取得 Form 資料 | `studentDetails/{className}` (collection) |

無需複合索引（簡單 collection queries）

## 5. Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // === Roster ===
    match /roster/{className}/members/{name} {
      allow read: if isAuthed();
      allow write: if isAdmin();
    }
    
    // === Sessions (admin only write, authed read) ===
    match /sessions/{date} {
      allow read: if isAuthed();
      allow write: if isAdmin();
    }
    
    // === Roll call (teacher 自己班) ===
    match /rollcalls/{className}/{date}/{name} {
      allow read: if isAuthed();
      allow write: if isAdmin() || isTeacherOf(className);
    }
    
    // === Student details ===
    match /studentDetails/{className}/{name} {
      allow read: if isAuthed();
      allow write: if isAdmin() || isTeacherOf(className);
    }
    
    // === Class links (form links) ===
    match /classLinks/{className} {
      allow read: if isAuthed();
      allow write: if isAdmin();
    }
    
    // === Permissions (read 自己 only) ===
    match /permissions/{email} {
      allow read: if isAuthed() && request.auth.token.email == email;
      allow write: if isAdmin();
    }
    
    // === Helpers ===
    function isAuthed() {
      return request.auth != null;
    }
    function isAdmin() {
      return exists(/databases/$(database)/documents/permissions/$(request.auth.token.email))
        && get(/databases/$(database)/documents/permissions/$(request.auth.token.email)).data.role == 'admin';
    }
    function isTeacherOf(className) {
      return exists(/databases/$(database)/documents/permissions/$(request.auth.token.email))
        && get(/databases/$(database)/documents/permissions/$(request.auth.token.email)).data.role == 'teacher'
        && className in get(/databases/$(database)/documents/permissions/$(request.auth.token.email)).data.classes;
    }
  }
}
```

## 6. Custom Claims vs Permissions Doc

**選擇**：用 Firestore `permissions/{email}` doc（不用 Firebase custom claims）

原因：
- GAS 唔可以 direct call Firebase Admin SDK（需 service account key）
- Custom claims 需 Cloud Functions 觸發
- Firestore rules 讀 doc 已足夠

Tradeoff：每次 `get()` call 有 read cost（但 rules cache 短時間）

## 7. Frontend 改動

### 7.1 新增 `js/db.js`（取代 api.js 部分）

```js
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, 
         setDoc, writeBatch, query, where, orderBy, limit } from 'firebase/firestore';

const app = initializeApp(APP_CONFIG.firebase);
const db = getFirestore(app);

export async function getRoster(className) {
  const snap = await getDocs(collection(db, 'roster', className, 'members'));
  return snap.docs.map(d => ({ name: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function getSessions() {
  const snap = await getDocs(collection(db, 'sessions'));
  return snap.docs
    .map(d => ({ date: d.id, ...d.data() }))
    .sort((a, b) => a.date < b.date ? -1 : 1);
}

export async function getRollCall(className, date) {
  const snap = await getDocs(collection(db, 'rollcalls', className, date));
  return snap.docs.map(d => ({ name: d.id, ...d.data() }));
}

export async function saveRollCall(className, date, records, recorder) {
  const batch = writeBatch(db);
  for (const r of records) {
    const ref = doc(db, 'rollcalls', className, date, r.name);
    batch.set(ref, {
      present: r.present,
      category: r.category,
      className: r.className,
      recorder: recorder,
      timestamp: new Date().toISOString()
    }, { merge: true });
  }
  await batch.commit();
}

export async function getRollCallYear(className) {
  const daysSnap = await getDocs(collection(db, 'rollcalls', className));
  const result = {};
  const promises = daysSnap.docs.map(async dayDoc => {
    const date = dayDoc.id;
    const membersSnap = await getDocs(collection(db, 'rollcalls', className, date));
    result[date] = {};
    membersSnap.forEach(m => {
      result[date][m.id] = m.data().present;
    });
  });
  await Promise.all(promises);
  return result;
}

export async function getStudentDetails(className) {
  const snap = await getDocs(collection(db, 'studentDetails', className));
  return snap.docs.map(d => ({ name: d.id, ...d.data() }));
}

export async function getClassLink(className) {
  const docSnap = await getDoc(doc(db, 'classLinks', className));
  return docSnap.exists() ? docSnap.data() : null;
}

export async function saveSession(date, data) {
  await setDoc(doc(db, 'sessions', date), data);
}
```

### 7.2 保留 GAS API（給 `js/api.js` 唔變）

- 保留：`getAllClasses`（從 Sheets 讀，因 GAS cached）
- 保留：`recordAttendance`（彌撒+換領，唔郁）
- 保留：`getStats` / `getAchievedStudents`（統計）
- **移除**：`getClassPortal` / `getRollCall` / `saveRollCall` / `getRollCallYear` / `getStudentDetails` / `getClassRoster` / `getSessions` / `saveSessions`（改用 Firestore）

### 7.3 新版 `class_portal.html` 用 Firestore

```js
// 平行 fetch
const [roster, sessions, details, classLink] = await Promise.all([
  getRoster(currentClass),
  getSessions(),
  getStudentDetails(currentClass),
  getClassLink(currentClass)
]);
```

預期 load time: 1-2s

## 8. GAS Sync 工具

保留 GAS 為 Sheets ↔ Firestore bridge：

```js
// 將 Roster (Sheets) → Firestore
function RUN_SyncRosterToFirestore() {
  const classes = getAllClasses();
  for (const className of classes) {
    const members = getClassRoster_Flat(className); // 簡化版，只取序號/類別/姓名
    const promises = members.map(m => 
      firestoreSet(`roster/${className}/members/${m.name}`, {
        serial: m.serial,
        category: m.category,
        className: m.className,
        order: m.serial
      })
    );
    Promise.all(promises);
  }
}

// 將 Sessions (Sheets) → Firestore
function RUN_SyncSessionsToFirestore() {
  const sessions = getSessions_FromSheet();
  const promises = sessions.map((s, i) => 
    firestoreSet(`sessions/${s.date}`, {
      date: s.date,
      title: s.title,
      event: s.event,
      order: i
    })
  );
  Promise.all(promises);
}

// Firestore REST API（不需 Admin SDK）
function firestoreSet(path, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
  UrlFetchApp.fetch(url, {
    method: 'PATCH',
    contentType: 'application/json',
    payload: JSON.stringify({ fields: firestoreEncodeFields(data) }),
    headers: { 'Authorization': 'Bearer ' + getFirestoreIdToken() }  // 用 OAuth service account
  });
}
```

**注意**：Firestore REST API 需要 OAuth bearer token。GAS 可以用 `ScriptApp.getOAuthToken()` 取得，但需要 IAM 權限。

## 9. Performance 預期

| 操作 | 現（GAS + Sheets）| 新（Firestore）|
|---|---|---|
| Class portal load | ~10s | ~1-2s |
| Save roll call (40人) | ~3-5s | ~300ms |
| 全年矩陣 (40人 × 42日) | ~5s | ~800ms |
| Sessions list | ~2s | ~100ms |
| Student details | ~2s | ~200ms |

## 10. 限制

- **Write 後 read**: Firestore 有 `writeBatch` + `commit()`，無 transaction
- **Cost**: 40人 × 42日 roll call = 1680 docs = 極少
  - 寫入: 1680 (1次) = 1680 writes
  - 讀取: 1680 reads × 50日 = 84,000 reads/year (極少)
  - Free tier: 50,000 reads/day 完全足夠
- **Offline**: Firestore SDK 內建 offline persistence (enableIndexedDbPersistence)

## 11. Migration Plan

### Phase 1: 設置（1-2小時）
1. Firebase Console → 啟用 Firestore
2. 建立 first admin doc: `permissions/sfxsunday@gmail.com`
3. 設定 Security Rules
4. 設定 budget alert

### Phase 2: Sync 工具（1-2小時）
1. 寫 GAS `firestoreSync.js`
2. 測試 `RUN_SyncRosterToFirestore`
3. 測試 `RUN_SyncSessionsToFirestore`

### Phase 3: Frontend（2-3小時）
1. 寫 `js/db.js`
2. 改 `class_portal.html` 用 Firestore
3. 改 `rollcall.html` 用 Firestore
4. 改 `admin_sessions.html` 用 Firestore
5. 保留 `form.html` / `redeem.html` / `details.html` 用 GAS

### Phase 4: Rollback Plan
- 前端 feature flag: `USE_FIRESTORE = true/false`
- 切返 GAS endpoint 即時 revert
- Firestore 資料保留作 future use

## 12. 待確認

- [ ] 確認 Firestore region (asia-east1 / asia-east2)
- [ ] 確認 `sfxsunday@gmail.com` 為 first admin
- [ ] 確認保留 form.html / redeem.html 用 GAS（唔郁）
- [ ] Security Rules 細節：teacher 睇得到其他班 roster？（依家規則：isAuthed() 可讀）
