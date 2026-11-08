// tests/unit.test.js — 純邏輯單元測試（唔需要瀏覽器 / Firebase）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REWARD_THRESHOLD,
  REWARD_CATEGORIES,
  getCurrentSchoolYear,
  getSchoolYearStart,
  listSchoolYears,
  getDefaultRewardConfig,
  normalizeRewardConfig,
  buildRewardClaimId,
  groupClaims,
  getMassTickDates,
  computeStudentReward,
  buildClassRewardRows,
  summarizeRewardRows,
  getNextClaimNos,
  formatClaimNos,
  claimWarning
} from '../js/reward-calc.js';

import { sortClasses, massAppliesTo, oneMonthLaterStr } from '../js/classOrder.js';

const C1 = '一年級';
const C2 = '二年級';

// ---------- reward-calc：學年 ----------

test('getCurrentSchoolYear：9 月開始新學年', () => {
  assert.equal(getCurrentSchoolYear(new Date(2026, 7, 31)), '2025-26'); // 8 月 31 日
  assert.equal(getCurrentSchoolYear(new Date(2026, 8, 1)), '2026-27');  // 9 月 1 日
  assert.equal(getCurrentSchoolYear(new Date(2027, 0, 15)), '2026-27'); // 翌年 1 月
});

test('getCurrentSchoolYear：無效日期唔會 throw', () => {
  const out = getCurrentSchoolYear('not-a-date');
  assert.match(out, /^\d{4}-\d{2}$/);
});

test('getSchoolYearStart / listSchoolYears', () => {
  assert.equal(getSchoolYearStart('2026-27'), 2026);
  assert.equal(getSchoolYearStart('bad'), new Date().getFullYear());

  const current = getSchoolYearStart(getCurrentSchoolYear());
  assert.deepEqual(listSchoolYears(3), [
    `${current}-${String(current + 1).slice(-2)}`,
    `${current - 1}-${String(current).slice(-2)}`,
    `${current - 2}-${String(current - 1).slice(-2)}`
  ]);
  assert.deepEqual(listSchoolYears(1).length, 1);
});

// ---------- reward-calc：config ----------

test('getDefaultRewardConfig / normalizeRewardConfig', () => {
  const def = getDefaultRewardConfig('2026-27');
  assert.equal(def.threshold, REWARD_THRESHOLD);
  assert.equal(def.startDate, '2026-09-01');
  assert.equal(def.endDate, '2027-05-31');
  assert.deepEqual(def.categories, REWARD_CATEGORIES);

  const normalized = normalizeRewardConfig({ threshold: 0, categories: [] }, '2025-26');
  assert.equal(normalized.threshold, REWARD_THRESHOLD);
  assert.deepEqual(normalized.categories, REWARD_CATEGORIES);
  assert.equal(normalized.startDate, '2025-09-01');
  assert.equal(normalized.endDate, '2026-05-31');

  const custom = normalizeRewardConfig({ threshold: '3', categories: ['學生', '小導師'] }, '2026-27');
  assert.equal(custom.threshold, 3);
  assert.deepEqual(custom.categories, ['學生', '小導師']);
});

test('buildRewardClaimId：固定格式 / 向後兼容 / prayer 分開', () => {
  const enc = (s) => encodeURIComponent(s);
  assert.equal(
    buildRewardClaimId(C1, 'A Chan', 'prayer', 2),
    `${enc(C1)}~A%20Chan~prayer~2`
  );
  assert.equal(
    buildRewardClaimId(C1, 'A Chan', 3),
    `${enc(C1)}~A%20Chan~mass~3`
  );
  assert.equal(buildRewardClaimId(' x ', ' y ', 'mass', '4'), 'x~y~mass~4');
});

test('groupClaims：忽略 voided / 空白，按班及學生分組', () => {
  const map = groupClaims([
    { className: C1, studentName: 'A', claimNo: 1 },
    { className: C1, studentName: 'A', claimNo: 2 },
    { className: C1, studentName: 'B', claimNo: 1 },
    { className: C2, studentName: 'C', claimNo: 1 },
    { className: C1, studentName: 'D', claimNo: 1, voided: true },
    { className: '', studentName: 'E', claimNo: 1 }
  ]);
  assert.equal(map.size, 2);
  assert.equal(map.get(C1).size, 2);
  assert.equal(map.get(C1).get('A').length, 2);
  assert.equal(map.get(C1).get('B').length, 1);
  assert.equal(map.get(C2).get('C').length, 1);
  assert.equal(map.get(C1).has('D'), false);
});

// ---------- reward-calc：點名 / 獎勵計算 ----------

const sixMassDates = [
  '2026-09-06', '2026-09-13', '2026-09-20',
  '2026-09-27', '2026-10-04', '2026-10-11'
];

function marksFor(name, dates, extra = {}) {
  const out = {};
  for (const d of dates) out[d] = { [name]: { present: true, mass: true, ...extra } };
  return out;
}

test('getMassTickDates：只計範圍內 mass=true 嘅主日', () => {
  const sessions = [
    ...sixMassDates.map((date) => ({ date })),
    { date: '2026-08-30' }
  ];
  const yearMarks = marksFor('A Chan', sixMassDates);
  const dates = getMassTickDates({
    sessions,
    yearMarks,
    studentName: 'A Chan',
    startDate: '2026-09-01',
    endDate: '2026-10-31'
  });
  assert.deepEqual(dates, sixMassDates);
});

test('computeStudentReward：6 次彌撒、1 個已領 → 尚餘 0、進度 1/5', () => {
  const r = computeStudentReward({
    student: { name: 'A Chan', category: '學生' },
    className: C1,
    sessions: sixMassDates.map((date) => ({ date })),
    yearMarks: marksFor('A Chan', sixMassDates),
    claims: [{ className: C1, studentName: 'A Chan', claimNo: 1, type: 'mass', claimedAt: '2026-10-01' }],
    config: { threshold: 5, startDate: '2026-09-01', endDate: '2027-05-31' }
  });
  assert.equal(r.massCount, 6);
  assert.equal(r.presentCount, 6);
  assert.equal(r.earned, 1);
  assert.equal(r.claimed, 1);
  assert.equal(r.pending, 0);
  assert.equal(r.progress, 1);
  assert.equal(r.toNext, 4);
  assert.equal(r.nextMilestone, 10);
  assert.equal(r.nextClaimNo, 2);
  assert.equal(r.lastClaimedAt, '2026-10-01');
});

test('computeStudentReward：重複 claimNo 只計一次，prayer 唔影響 mass', () => {
  const r = computeStudentReward({
    student: { name: 'A Chan', category: '學生' },
    className: C1,
    sessions: sixMassDates.map((date) => ({ date })),
    yearMarks: marksFor('A Chan', sixMassDates),
    claims: [
      { className: C1, studentName: 'A Chan', claimNo: 1, type: 'mass' },
      { className: C1, studentName: 'A Chan', claimNo: 1, type: 'mass' },
      { className: C1, studentName: 'A Chan', claimNo: 3, type: 'mass' },
      { className: C1, studentName: 'A Chan', claimNo: 1, type: 'prayer' },
      { className: C1, studentName: 'A Chan', claimNo: 1, type: 'prayer' },
      { className: C1, studentName: 'A Chan', claimNo: 1, type: 'mass', voided: true }
    ],
    config: { threshold: 5, startDate: '2026-09-01', endDate: '2027-05-31' }
  });
  assert.equal(r.claimed, 2);
  assert.equal(r.overClaimed, 1);
  assert.equal(r.pending, 0);
  assert.equal(r.nextClaimNo, 2);
  assert.equal(r.prayerClaimed, 1);
  assert.equal(r.nextPrayerClaimNo, 2);
});

test('buildClassRewardRows：只列指定類別，按 pending / mass 排序', () => {
  const roster = [
    { name: 'A Chan', category: '學生' },
    { name: 'Teacher Wong', category: '老師' },
    { name: 'B Lee', category: '學生' }
  ];
  const sessions = [
    ...sixMassDates.map((date) => ({ date })),
    { date: '2026-10-18' }, { date: '2026-10-25' }, { date: '2026-11-01' }, { date: '2026-11-08' }
  ];
  const yearMarks = {};
  for (const date of sessions.map((s) => s.date)) yearMarks[date] = {};
  for (const date of sixMassDates) yearMarks[date]['A Chan'] = { present: true, mass: true };
  for (const date of sessions.map((s) => s.date)) yearMarks[date]['B Lee'] = { present: true, mass: true };
  const rows = buildClassRewardRows({
    className: C1,
    roster,
    sessions,
    yearMarks,
    claims: [],
    config: { threshold: 5, startDate: '2026-09-01', endDate: '2027-05-31', categories: ['學生'] }
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].studentName, 'B Lee'); // 10 次 → pending 2
  assert.equal(rows[0].pending, 2);
  assert.equal(rows[1].studentName, 'A Chan'); // 6 次 → pending 1
  assert.equal(rows[1].pending, 1);
});

test('summarizeRewardRows：總數 / 比率 / 進度分佈', () => {
  const summary = summarizeRewardRows([
    { massCount: 5, earned: 1, claimed: 0, pending: 1, overClaimed: 0, prayerClaimed: 0, progress: 0 },
    { massCount: 7, earned: 1, claimed: 1, pending: 0, overClaimed: 0, prayerClaimed: 2, progress: 2 }
  ], 5);
  assert.equal(summary.studentCount, 2);
  assert.equal(summary.massTotal, 12);
  assert.equal(summary.earnedTotal, 2);
  assert.equal(summary.claimedTotal, 1);
  assert.equal(summary.pendingTotal, 1);
  assert.equal(summary.prayerTotal, 2);
  assert.equal(summary.pendingStudents, 1);
  assert.equal(summary.fullyClaimedStudents, 1);
  assert.equal(summary.noMassStudents, 0);
  assert.equal(summary.rate, 50);
  assert.deepEqual(summary.progressCounts, [1, 0, 1, 0, 0]);
});

test('getNextClaimNos / formatClaimNos', () => {
  assert.deepEqual(getNextClaimNos([1, 3], 3), [2, 4, 5]);
  assert.deepEqual(getNextClaimNos([], 2), [1, 2]);
  assert.equal(formatClaimNos([2, 3]), '第 2、3 個');
  assert.equal(formatClaimNos([]), '—');
});

test('claimWarning：未點名 / 超出應得數', () => {
  assert.match(claimWarning({ massCount: 0, earned: 0 }, [1]), /未有彌撒紀錄/);
  assert.match(claimWarning({ massCount: 6, earned: 1 }, [2]), /超出應得數/);
  assert.equal(claimWarning({ massCount: 6, earned: 2 }, [1, 2]), '');
  assert.equal(claimWarning(null, [1]), '');
});

// ---------- classOrder ----------

test('sortClasses：幼兒 → 聖體 → 聖體後 → 堅振', () => {
  const input = ['堅振(2)', '聖體(2)', '幼兒', '聖體後', '聖體(1)', '堅振(1)'];
  assert.deepEqual(sortClasses(input), [
    '幼兒', '聖體(1)', '聖體(2)', '聖體後', '堅振(1)', '堅振(2)'
  ]);
});

test('sortClasses：唔會改動原本陣列', () => {
  const input = ['聖體(1)', '幼兒'];
  const copy = [...input];
  sortClasses(input);
  assert.deepEqual(input, copy);
});

test('massAppliesTo：青少年 / 兒童彌撒對應班級', () => {
  assert.equal(massAppliesTo('青少年彌撒', '堅振(1)'), true);
  assert.equal(massAppliesTo('青少年彌撒', '聖體(1)'), false);
  assert.equal(massAppliesTo('兒童彌撒', '聖體(1)'), true);
  assert.equal(massAppliesTo('兒童彌撒', '聖體後'), true);
  assert.equal(massAppliesTo('兒童彌撒', '堅振(1)'), false);
  assert.equal(massAppliesTo('主日', '任何班'), true);
});

test('oneMonthLaterStr：跨月 / 跨年 / 閏年', () => {
  assert.equal(oneMonthLaterStr('2026-12-15'), '2027-01-14');
  assert.equal(oneMonthLaterStr('2026-01-31'), '2026-03-02');
  assert.equal(oneMonthLaterStr('2028-02-01'), '2028-03-02');
});
