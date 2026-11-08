// js/reward-calc.js — 彌撒獎勵（每 5 次）純計算邏輯
// 只做數學同資料整理，唔直接讀 Firestore，方便測試同重用。

export const REWARD_THRESHOLD = 5;
export const REWARD_CATEGORIES = ['學生'];

/** 由日期取得學年，例如 2026-10-25 → "2026-27"（9 月為學年開始） */
export function getCurrentSchoolYear(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const valid = !Number.isNaN(d.getTime());
  const y = valid ? d.getFullYear() : new Date().getFullYear();
  const m = valid ? d.getMonth() + 1 : 1;
  const startYear = m >= 9 ? y : y - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

/** 由學年 ID 取得開始年份，例如 "2026-27" → 2026 */
export function getSchoolYearStart(schoolYear) {
  const m = String(schoolYear || '').match(/^(\d{4})/);
  return m ? Number(m[1]) : new Date().getFullYear();
}

/** 學年選項（當前學年 + 之前 N 個） */
export function listSchoolYears(count = 3) {
  const current = getCurrentSchoolYear();
  const start = getSchoolYearStart(current);
  const total = Math.max(1, Math.floor(Number(count) || 3));
  return Array.from({ length: total }, (_, i) => {
    const y = start - i;
    return `${y}-${String(y + 1).slice(-2)}`;
  });
}

export function getDefaultRewardConfig(schoolYear = getCurrentSchoolYear()) {
  const start = getSchoolYearStart(schoolYear);
  return {
    schoolYear,
    threshold: REWARD_THRESHOLD,
    startDate: `${start}-09-01`,
    endDate: `${start + 1}-05-31`,
    categories: [...REWARD_CATEGORIES],
    rewardTiers: []
  };
}

export function normalizeRewardConfig(raw, schoolYear = getCurrentSchoolYear()) {
  const def = getDefaultRewardConfig(schoolYear);
  const data = raw && typeof raw === 'object' ? raw : {};
  const threshold = Math.max(1, Math.floor(Number(data.threshold) || def.threshold));
  const categories = Array.isArray(data.categories) && data.categories.length
    ? data.categories.map(c => String(c))
    : def.categories;
  return {
    ...def,
    ...data,
    schoolYear,
    threshold,
    startDate: String(data.startDate || def.startDate),
    endDate: String(data.endDate || def.endDate),
    categories,
    rewardTiers: Array.isArray(data.rewardTiers) ? data.rewardTiers : []
  };
}

/** 固定 claimId：同一班、同一學生、同一類型、同一獎勵序號只會有一份 */
export function buildRewardClaimId(className, studentName, typeOrClaimNo, claimNoMaybe) {
  const safe = (s) => encodeURIComponent(String(s == null ? '' : s).trim());
  let type = 'mass';
  let claimNo = 0;
  if (claimNoMaybe === undefined) {
    // backward compatible: (className, studentName, claimNo)
    claimNo = Number(typeOrClaimNo);
  } else {
    type = typeOrClaimNo === 'prayer' ? 'prayer' : 'mass';
    claimNo = Number(claimNoMaybe);
  }
  return `${safe(className)}~${safe(studentName)}~${type}~${Number(claimNo) || 0}`;
}

/** 將全部有效 claim 按班別／學生分組 */
export function groupClaims(claims) {
  const byClass = new Map();
  for (const c of claims || []) {
    if (!c || c.voided === true) continue;
    const className = String(c.className || '').trim();
    const studentName = String(c.studentName || '').trim();
    if (!className || !studentName) continue;
    if (!byClass.has(className)) byClass.set(className, new Map());
    const byStudent = byClass.get(className);
    if (!byStudent.has(studentName)) byStudent.set(studentName, []);
    byStudent.get(studentName).push(c);
  }
  return byClass;
}

/** 取得有 mass=true 的主日日期清單（只限學年範圍內） */
export function getMassTickDates({ sessions, yearMarks, studentName, startDate = '', endDate = '' }) {
  const dates = [];
  for (const sess of sessions || []) {
    if (!sess || !sess.date) continue;
    if (startDate && sess.date < startDate) continue;
    if (endDate && sess.date > endDate) continue;
    const mark = yearMarks && yearMarks[sess.date] && yearMarks[sess.date][studentName];
    if (mark && mark.mass === true) {
      dates.push(sess.date);
    }
  }
  dates.sort((a, b) => a.localeCompare(b));
  return dates;
}

/**
 * 計算一位學生在指定學年的獎勵狀況。
 * @param {Object} opts
 * @param {Object} opts.student   roster member（name, category, className）
 * @param {string} opts.className
 * @param {Array} opts.sessions   sessions（會按 config 日期過濾）
 * @param {Object} opts.yearMarks getRollCallYear() 回傳
 * @param {Array} opts.claims     該學年全部 claim
 * @param {Object} opts.config    reward config
 */
export function computeStudentReward({ student, className, sessions, yearMarks, claims, config }) {
  const threshold = Math.max(1, Number(config && config.threshold) || REWARD_THRESHOLD);
  const startDate = (config && config.startDate) || '';
  const endDate = (config && config.endDate) || '';
  const name = String((student && student.name) || '').trim();
  const cls = String(className || (student && student.className) || '').trim();
  const category = (student && student.category) || '';

  let massCount = 0;
  let presentCount = 0;
  for (const sess of sessions || []) {
    if (!sess || !sess.date) continue;
    if (startDate && sess.date < startDate) continue;
    if (endDate && sess.date > endDate) continue;
    const mark = yearMarks && yearMarks[sess.date] && yearMarks[sess.date][name];
    if (!mark) continue;
    if (mark.mass === true) massCount++;
    if (mark.present === true) presentCount++;
  }

  const usedClaimNos = new Set();
  const studentClaims = [];
  const prayerClaims = [];
  const usedPrayerNos = new Set();

  for (const c of claims || []) {
    if (!c || c.voided === true) continue;
    if (String(c.className || '').trim() !== cls) continue;
    if (String(c.studentName || '').trim() !== name) continue;

    const n = Number(c.claimNo);
    if (!Number.isInteger(n) || n < 1) continue;

    // 祈禱獎勵同彌撒獎勵分開計，避免互相影響
    if (c.type === 'prayer') {
      if (usedPrayerNos.has(n)) continue;
      usedPrayerNos.add(n);
      prayerClaims.push(c);
      continue;
    }

    if (usedClaimNos.has(n)) continue;
    usedClaimNos.add(n);
    studentClaims.push(c);
  }

  studentClaims.sort((a, b) => Number(a.claimNo) - Number(b.claimNo));
  prayerClaims.sort((a, b) => Number(a.claimNo) - Number(b.claimNo));

  const claimed = usedClaimNos.size;
  const earned = Math.floor(massCount / threshold);
  const pending = Math.max(0, earned - claimed);
  const overClaimed = Math.max(0, claimed - earned);
  const progress = massCount % threshold;
  const toNext = threshold - progress;
  const lastClaimedAt = studentClaims.reduce(
    (max, c) => (String(c.claimedAt || '') > max ? String(c.claimedAt || '') : max),
    ''
  );
  const lastPrayerClaimedAt = prayerClaims.reduce(
    (max, c) => (String(c.claimedAt || '') > max ? String(c.claimedAt || '') : max),
    ''
  );

  let nextClaimNo = 1;
  while (usedClaimNos.has(nextClaimNo)) nextClaimNo++;

  let nextPrayerClaimNo = 1;
  while (usedPrayerNos.has(nextPrayerClaimNo)) nextPrayerClaimNo++;

  return {
    className: cls,
    studentName: name,
    category,
    massCount,
    presentCount,
    threshold,
    earned,
    claimed,
    pending,
    overClaimed,
    progress,
    toNext,
    nextMilestone: massCount + toNext,
    nextClaimNo,
    lastClaimedAt,
    claims: studentClaims,
    prayerClaims,
    prayerClaimed: prayerClaims.length,
    lastPrayerClaimedAt,
    nextPrayerClaimNo
  };
}

/** 建立一班全部合資格學生的 reward rows */
export function buildClassRewardRows({ className, roster, sessions, yearMarks, claims, config }) {
  const allowed = new Set((config && config.categories) || REWARD_CATEGORIES);
  const rows = (roster || [])
    .filter(s => s && s.name && allowed.has(s.category || '學生'))
    .map(s => computeStudentReward({ student: { ...s, category: s.category || '學生' }, className, sessions, yearMarks, claims, config }));
  rows.sort((a, b) =>
    b.pending - a.pending ||
    b.massCount - a.massCount ||
    a.studentName.localeCompare(b.studentName, 'zh-Hant')
  );
  return rows;
}

/** 班別／整體 summary */
export function summarizeRewardRows(rows, threshold = REWARD_THRESHOLD) {
  const list = Array.isArray(rows) ? rows : [];
  const buckets = Array.from({ length: Math.max(1, Number(threshold) || REWARD_THRESHOLD) }, () => 0);
  let massTotal = 0;
  let earnedTotal = 0;
  let claimedTotal = 0;
  let pendingTotal = 0;
  let overClaimedTotal = 0;
  let pendingStudents = 0;
  let fullyClaimedStudents = 0;
  let noMassStudents = 0;
  let prayerTotal = 0;

  for (const r of list) {
    massTotal += r.massCount;
    earnedTotal += r.earned;
    claimedTotal += r.claimed;
    pendingTotal += r.pending;
    overClaimedTotal += r.overClaimed;
    prayerTotal += Number(r.prayerClaimed) || 0;
    if (r.pending > 0) pendingStudents++;
    if (r.earned > 0 && r.pending === 0 && r.overClaimed === 0) fullyClaimedStudents++;
    if (r.massCount === 0) noMassStudents++;
    const idx = Math.min(buckets.length - 1, Math.max(0, Number(r.progress) || 0));
    buckets[idx]++;
  }

  return {
    studentCount: list.length,
    massTotal,
    earnedTotal,
    claimedTotal,
    pendingTotal,
    overClaimedTotal,
    prayerTotal,
    pendingStudents,
    fullyClaimedStudents,
    noMassStudents,
    progressCounts: buckets,
    rate: earnedTotal ? Math.round((claimedTotal / earnedTotal) * 100) : 0
  };
}

/** 由已用 claimNo 找出下 N 個未用序號（容許中間有吉位） */
export function getNextClaimNos(usedClaimNos, count = 1) {
  const used = new Set(
    (usedClaimNos || [])
      .map(n => Number(n))
      .filter(n => Number.isInteger(n) && n > 0)
  );
  const want = Math.max(1, Math.floor(Number(count) || 1));
  const out = [];
  let n = 1;
  while (out.length < want) {
    if (!used.has(n)) out.push(n);
    n++;
  }
  return out;
}

/** 將 claimNo 陣列變成「第 2、3 個」字串 */
export function formatClaimNos(claimNos) {
  const list = (claimNos || []).map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (!list.length) return '—';
  return `第 ${list.join('、')} 個`;
}

/** 檢查 claim 是否符合現時應得數（回傳警告字串，空字串代表冇問題） */
export function claimWarning(row, claimNos) {
  if (!row) return '';
  const list = (claimNos || []).map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (!list.length) return '';
  if (row.massCount === 0) {
    return '這位學生目前未有彌撒紀錄，請先確認點名資料。';
  }
  const maxClaimNo = Math.max(...list);
  if (maxClaimNo > row.earned) {
    return `目前彌撒 ${row.massCount} 次，只夠 ${row.earned} 個獎勵；今次會登記到第 ${maxClaimNo} 個，超出應得數。`;
  }
  return '';
}
