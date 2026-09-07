// js/classOrder.js — 班級排序 + 彌撒活動對應班級
// 排序：幼兒, 聖體(1-3), 聖體後, 堅振(1-3)

function classSortKey(name) {
  const n = String(name || '');
  if (/幼兒/.test(n)) return '00';
  if (/聖體後/.test(n)) return '04';
  if (/聖體/.test(n)) {
    const m = n.match(/\((\d+)\)/);
    return '0' + (m ? Math.min(Number(m[1]), 9) : 0);
  }
  if (/堅振/.test(n)) {
    const m = n.match(/\((\d+)([A-Za-z]?)\)/);
    const num = m ? Number(m[1]) : 0;
    const suf = m && m[2] ? m[2].toUpperCase() : '';
    return '1' + num + suf;
  }
  return 'z' + n;
}

export function sortClasses(list) {
  return [...(list || [])].sort((a, b) => (classSortKey(a) < classSortKey(b) ? -1 : 1));
}

/** 彌撒活動對應邊啲班級：青少年彌撒→堅振；兒童彌撒→聖體（含聖體後） */
export function massAppliesTo(event, className) {
  if (/青少年彌撒/.test(event || '')) return /堅振/.test(className);
  if (/兒童彌撒/.test(event || '')) return /聖體/.test(className);
  return true;
}

/** 今日 + 30 日（未來一個月）嘅日期字串 */
export function oneMonthLaterStr(todayStr) {
  const d = new Date(todayStr + 'T00:00:00');
  d.setDate(d.getDate() + 30);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
