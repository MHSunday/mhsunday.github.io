// js/data.js — 資料層 adapter：按 USE_FIRESTORE 切換 Firestore / GAS
// Portal + 課堂點名 + 上堂日曆 一律由呢度 import，rollback = 改 config.js 個 flag。
import { APP_CONFIG } from './config.js';
import * as fb from './db.js';
import * as gas from './api.js';

const src = APP_CONFIG.USE_FIRESTORE ? fb : gas;

export const getAllClasses = src.getAllClasses;
export const getSessions = src.getSessions;
export const saveSessions = src.saveSessions;
export const getRoster = src.getRoster;
export const getClassRoster = src.getClassRoster;
export const getRollCall = src.getRollCall;
export const saveRollCall = src.saveRollCall;
export const getRollCallYear = src.getRollCallYear;
export const getStudentDetails = src.getStudentDetails;
export const getClassPortal = src.getClassPortal;

// 以下只存在於 Firestore 版（admin 同步 / 出席%）
export const resetSessions = fb.resetSessions;
export const importDefaultSessions = fb.importDefaultSessions;
export const getAttendanceStats = fb.getAttendanceStats;
export const syncAllFromGAS = fb.syncAllFromGAS;
export const syncPermissionsFromGAS = fb.syncPermissionsFromGAS;
export const exportRollcallsToGAS = fb.exportRollcallsToGAS;
