// tests/e2e-roles.test.js — 用 mock 角色跑 Chrome，驗證頁面權限、導向、導覽可見性
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { startBrowser } from './lib/browser.js';
import { CLASS1, CLASS2 } from './lib/mocks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enc = encodeURIComponent;
const DETAILS_OWN = `details.html?class=${enc(CLASS1)}`;
const DETAILS_OTHER = `details.html?class=${enc(CLASS2)}`;

let B;

before(async () => {
  B = await startBrowser({
    root: ROOT,
    waitMs: Number(process.env.TEST_WAIT_MS || 2400)
  });
}, { timeout: 90_000 });

after(async () => {
  if (B) await B.stop();
}, { timeout: 30_000 });

// ---------- helpers ----------

function normHref(href) {
  return String(href || '')
    .split('#')[0]
    .split('?')[0]
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function visibleLink(r, href) {
  return r.links.some((l) => l.visible && normHref(l.href) === normHref(href));
}
function visibleAction(r, href) {
  return r.actions.some((a) => a.visible && normHref(a.href) === normHref(href));
}
function visibleId(r, id) {
  return r.visibleIds.includes(id);
}

function check(r, exp, issues) {
  const add = (msg) => issues.push(`${r.role.padEnd(7)} ${r.requested.padEnd(34)} → ${msg}`);

  if (exp.pathname && r.pathname !== exp.pathname) {
    add(`最終頁 ${r.pathname || '(空)'}，預期 ${exp.pathname}`);
  }
  if (exp.activeTab !== undefined && r.activeTab !== exp.activeTab) {
    add(`active tab = ${r.activeTab || '(無)'}，預期 ${exp.activeTab || '(無)'}`);
  }
  for (const id of exp.visibleIds || []) {
    if (!visibleId(r, id)) add(`#${id} 應該可見但隱藏了`);
  }
  for (const id of exp.hiddenIds || []) {
    if (visibleId(r, id)) add(`#${id} 應該隱藏但可見`);
  }
  for (const href of exp.visibleLinks || []) {
    if (!visibleLink(r, href)) add(`連結 ${href} 應該可見但隱藏了`);
  }
  for (const href of exp.absentLinks || []) {
    if (visibleLink(r, href)) add(`連結 ${href} 應該隱藏但可見`);
  }
  for (const href of exp.visibleActions || []) {
    if (!visibleAction(r, href)) add(`按鈕 ${href} 應該可見但隱藏了`);
  }
  for (const href of exp.absentActions || []) {
    if (visibleAction(r, href)) add(`按鈕 ${href} 應該隱藏但可見`);
  }
  if (exp.messageIncludes && !r.message.includes(exp.messageIncludes)) {
    add(`訊息「${r.message}」唔包含「${exp.messageIncludes}」`);
  }
  for (const fn of exp.apiCallsAbsent || []) {
    if (r.apiCalls.includes(fn)) add(`唔應該呼叫 api.${fn}`);
  }
  for (const fn of exp.apiCallsPresent || []) {
    if (!r.apiCalls.includes(fn)) add(`應該呼叫 api.${fn}`);
  }

  // 所有頁面都唔應該有 runtime error / 404 / 網絡失敗
  for (const e of r.pageErrors) add(`page error: ${e}`);
  for (const e of r.badResponses) add(`HTTP error: ${e}`);
  for (const e of r.netFails) add(`network failure: ${e}`);
}

async function runCases(role, cases) {
  const page = await B.role(role);
  const issues = [];
  try {
    for (const [requested, exp] of cases) {
      const r = await page.visit(requested);
      check(r, typeof exp === 'string' ? { pathname: exp } : exp, issues);
    }
  } finally {
    await page.close();
  }
  assert.deepEqual(issues, [], `\n${issues.join('\n')}\n`);
}

// ---------- 權限契約（修正後應該全部通過） ----------

test('admin：所有頁面都可進入，管理員導覽全部可見', async () => {
  await runCases('admin', [
    ['index.html', { pathname: '/class_portal.html' }],
    ['class_portal.html', {
      pathname: '/class_portal.html',
      visibleIds: ['formLink', 'adminSessionsLink', 'adminCalendarLink']
    }],
    ['staff.html', { pathname: '/staff.html' }],
    ['stat.html', {
      pathname: '/stat.html',
      activeTab: 'statsTab',
      visibleIds: ['statsTab', 'achievedTab', 'unredeemedTab'],
      visibleActions: ['form.html', 'redeem.html', 'combined_stats_report.html']
    }],
    ['combined_stats_report.html', {
      pathname: '/combined_stats_report.html',
      activeTab: 'unredeemedTab',
      visibleIds: ['statsTab', 'achievedTab', 'unredeemedTab'],
      visibleActions: ['form.html', 'redeem.html', 'unredeemed_print.html'],
      apiCallsPresent: ['getUnredeemedRecords']
    }],
    [DETAILS_OWN, { pathname: '/details.html' }],
    [DETAILS_OTHER, { pathname: '/details.html' }],
    ['rollcall.html', { pathname: '/rollcall.html' }],
    ['calendar.html', { pathname: '/calendar.html', visibleIds: ['rollcallLink', 'portalLink'] }],
    ['notices.html', { pathname: '/notices.html' }],
    ['reward.html', { pathname: '/reward.html', visibleIds: ['reportSection', 'inputSection', 'checkSection'] }],
    ['form.html', { pathname: '/form.html' }],
    ['redeem.html', { pathname: '/redeem.html' }],
    ['redeem_simplified.html', { pathname: '/redeem_simplified.html' }],
    ['unredeemed_print.html', { pathname: '/unredeemed_print.html' }],
    ['class_redemption_report.html', { pathname: '/class_redemption_report.html' }],
    ['admin_sessions.html', {
      pathname: '/admin_sessions.html',
      visibleLinks: ['admin_calendar.html']
    }],
    ['admin_calendar.html', { pathname: '/admin_calendar.html' }],
    ['admin_todos.html', { pathname: '/admin_todos.html' }],
    ['admin.html', { pathname: '/admin.html' }]
  ]);
}, { timeout: 180_000 });

test('teacher：只可進入教師可用頁面，管理員功能隱藏', async () => {
  await runCases('teacher', [
    ['index.html', { pathname: '/class_portal.html' }],
    ['class_portal.html', {
      pathname: '/class_portal.html',
      hiddenIds: ['formLink', 'adminSessionsLink', 'adminCalendarLink']
    }],
    ['staff.html', { pathname: '/class_portal.html' }],
    ['stat.html', {
      pathname: '/stat.html',
      activeTab: 'statsTab',
      visibleIds: ['statsTab', 'achievedTab'],
      hiddenIds: ['unredeemedTab'],
      visibleActions: ['combined_stats_report.html'],
      absentActions: ['form.html', 'redeem.html']
    }],
    ['combined_stats_report.html', {
      pathname: '/combined_stats_report.html',
      activeTab: 'statsTab',
      visibleIds: ['statsTab', 'achievedTab'],
      hiddenIds: ['unredeemedTab'],
      absentActions: ['form.html', 'redeem.html', 'unredeemed_print.html'],
      apiCallsAbsent: ['getUnredeemedRecords']
    }],
    [DETAILS_OWN, { pathname: '/details.html' }],
    [DETAILS_OTHER, { pathname: '/stat.html' }],
    ['rollcall.html', { pathname: '/rollcall.html' }],
    ['calendar.html', { pathname: '/calendar.html', visibleIds: ['rollcallLink', 'portalLink'] }],
    ['notices.html', { pathname: '/notices.html' }],
    ['reward.html', {
      pathname: '/reward.html',
      visibleIds: ['reportSection'],
      hiddenIds: ['inputSection', 'checkSection']
    }],
    ['form.html', { pathname: '/class_portal.html' }],
    ['redeem.html', { pathname: '/redeem.html', messageIncludes: '只有管理員' }],
    ['redeem_simplified.html', { pathname: '/redeem_simplified.html', messageIncludes: '只有管理員' }],
    ['unredeemed_print.html', { pathname: '/stat.html' }],
    ['class_redemption_report.html', { pathname: '/stat.html' }],
    ['admin_sessions.html', {
      pathname: '/admin_sessions.html',
      absentLinks: ['admin_calendar.html'],
      visibleLinks: ['class_portal.html', 'rollcall.html']
    }],
    ['admin_calendar.html', { pathname: '/class_portal.html' }],
    ['admin_todos.html', { pathname: '/class_portal.html' }],
    ['admin.html', { pathname: '/class_portal.html' }]
  ]);
}, { timeout: 180_000 });

test('staff：只可進入校務團頁面，其餘一律返 staff.html', async () => {
  await runCases('staff', [
    ['index.html', { pathname: '/staff.html' }],
    ['class_portal.html', { pathname: '/staff.html' }],
    ['staff.html', { pathname: '/staff.html' }],
    ['stat.html', { pathname: '/staff.html' }],
    ['combined_stats_report.html', { pathname: '/staff.html' }],
    [DETAILS_OWN, { pathname: '/staff.html' }],
    [DETAILS_OTHER, { pathname: '/staff.html' }],
    ['rollcall.html', { pathname: '/staff.html' }],
    ['calendar.html', { pathname: '/calendar.html', hiddenIds: ['rollcallLink'] }],
    ['notices.html', { pathname: '/notices.html' }],
    ['reward.html', {
      pathname: '/reward.html',
      visibleIds: ['reportSection'],
      hiddenIds: ['inputSection', 'checkSection']
    }],
    ['form.html', { pathname: '/staff.html' }],
    ['redeem.html', { pathname: '/redeem.html', messageIncludes: '只有管理員' }],
    ['redeem_simplified.html', { pathname: '/redeem_simplified.html', messageIncludes: '只有管理員' }],
    ['unredeemed_print.html', { pathname: '/staff.html' }],
    ['class_redemption_report.html', { pathname: '/staff.html' }],
    ['admin_sessions.html', { pathname: '/staff.html' }],
    ['admin_calendar.html', { pathname: '/staff.html' }],
    ['admin_todos.html', { pathname: '/staff.html' }],
    ['admin.html', { pathname: '/staff.html' }]
  ]);
}, { timeout: 180_000 });

test('互動：teacher 仍可切換統計／達成名單，且唔會呼叫 admin-only API', async () => {
  const page = await B.role('teacher');
  const issues = [];
  try {
    let s = await page.visit('stat.html');
    check(s, { pathname: '/stat.html' }, issues);

    await page.click('achievedTab');
    await sleep(500);
    s = { ...s, ...(await page.snapshot()) };
    check(s, {
      apiCallsPresent: ['getAchievedStudents'],
      apiCallsAbsent: ['getUnredeemedRecords']
    }, issues);

    s = await page.visit('combined_stats_report.html');
    check(s, {
      pathname: '/combined_stats_report.html',
      apiCallsAbsent: ['getUnredeemedRecords']
    }, issues);

    await page.click('achievedTab');
    await sleep(500);
    s = { ...s, ...(await page.snapshot()) };
    check(s, {
      apiCallsPresent: ['getAchievedStudents'],
      apiCallsAbsent: ['getUnredeemedRecords']
    }, issues);
  } finally {
    await page.close();
  }
  assert.deepEqual(issues, [], `\n${issues.join('\n')}\n`);
}, { timeout: 60_000 });

test('互動：admin 仍可載入未頒發名單', async () => {
  const page = await B.role('admin');
  const issues = [];
  try {
    let s = await page.visit('stat.html');
    check(s, { pathname: '/stat.html' }, issues);

    await page.click('unredeemedTab');
    await sleep(500);
    s = { ...s, ...(await page.snapshot()) };
    check(s, { apiCallsPresent: ['getUnredeemedRecords'] }, issues);
  } finally {
    await page.close();
  }
  assert.deepEqual(issues, [], `\n${issues.join('\n')}\n`);
}, { timeout: 60_000 });

test('anon：未登入一律返 index.html', async () => {
  await runCases('anon', [
    ['index.html', { pathname: '/index.html' }],
    ['class_portal.html', { pathname: '/index.html' }],
    ['stat.html', { pathname: '/index.html' }],
    [DETAILS_OWN, { pathname: '/index.html' }],
    ['admin.html', { pathname: '/index.html' }]
  ]);
}, { timeout: 60_000 });
