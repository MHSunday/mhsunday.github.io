// api.js
import { APP_CONFIG } from './config.js';

const API_URL = APP_CONFIG.appsScriptUrl;

export async function getAllClasses() {
  const res = await fetch(`${API_URL}?action=getAllClasses`);
  return await res.json();
}

export async function getStudentsByClass(className) {
  const res = await fetch(`${API_URL}?action=getStudentsByClass&class=${encodeURIComponent(className)}`);
  return await res.json();
}

export async function recordAttendance(data) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result;
}

export async function getStats(className = "*") {
  const user = firebase.auth().currentUser;
  const res = await fetch(`${API_URL}?action=getStats&email=${encodeURIComponent(user.email)}&class=${encodeURIComponent(className)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}