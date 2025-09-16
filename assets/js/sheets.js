// Sheets.gs（資料服務）
const USERS_SHEET_ID = PROPS.getProperty('USERS_SHEET_ID');
const ANN_SHEET_ID   = PROPS.getProperty('ANN_SHEET_ID');
const DOCS_SHEET_ID  = PROPS.getProperty('DOCS_SHEET_ID');
const REM_SHEET_ID   = PROPS.getProperty('REM_SHEET_ID');
const CLASSLINKS_SHEET_ID = PROPS.getProperty('CLASSLINKS_SHEET_ID');

const Sheets = {
  getUserProfile(email){
    const sh = SpreadsheetApp.openById(USERS_SHEET_ID).getSheets()[0];
    const { headers, rows, idx } = readAll(sh);
    for(const r of rows){
      const em = String(r[idx.Email]||"").toLowerCase().trim();
      if(em === email){
        const role = String(r[idx.Role]||"teacher").toLowerCase();
        const classes = String(r[idx.Classes]||"").split(/[,\s]+/).filter(Boolean);
        const defaultClass = String(r[idx.DefaultClass]||"").trim();
        return { role, classes, defaultClass };
      }
    }
    return { role:"teacher", classes:[], defaultClass:"" };
  },

  listAnnouncements(){
    const sh = SpreadsheetApp.openById(ANN_SHEET_ID).getSheets()[0];
    const { headers, rows, idx } = readAll(sh);
    return rows.map(r=>({
      ID: String(r[idx.ID]||""),
      Title: String(r[idx.Title]||""),
      Body: String(r[idx.Body]||""),
      StartDate: r[idx.StartDate] || "",
      EndDate: r[idx.EndDate] || "",
      Audience: String(r[idx.Audience]||"All"),
      Priority: String(r[idx.Priority]||"normal"),
      UpdatedBy: String(r[idx.UpdatedBy]||""),
      UpdatedAt: r[idx.UpdatedAt] || ""
    }));
  },

  upsertAnnouncement(obj){
    const sh = SpreadsheetApp.openById(ANN_SHEET_ID).getSheets()[0];
    const { headers, rows, idx } = readAll(sh);
    const now = new Date();
    if(obj.ID){
      for(let i=0;i<rows.length;i++){
        if(String(rows[i][idx.ID]||"")===obj.ID){
          const row = i+2;
          sh.getRange(row, idx.Title+1).setValue(obj.Title||"");
          sh.getRange(row, idx.Body+1).setValue(obj.Body||"");
          sh.getRange(row, idx.StartDate+1).setValue(obj.StartDate||"");
          sh.getRange(row, idx.EndDate+1).setValue(obj.EndDate||"");
          sh.getRange(row, idx.Audience+1).setValue(obj.Audience||"All");
          sh.getRange(row, idx.Priority+1).setValue(obj.Priority||"normal");
          if(idx.UpdatedBy>=0) sh.getRange(row, idx.UpdatedBy+1).setValue(obj.UpdatedBy||"");
          if(idx.UpdatedAt>=0) sh.getRange(row, idx.UpdatedAt+1).setValue(now);
          return obj.ID;
        }
      }
    }
    const id = "A-" + Date.now();
    const newRow = [
      id, obj.Title||"", obj.Body||"", obj.StartDate||"", obj.EndDate||"",
      obj.Audience||"All", obj.Priority||"normal", obj.UpdatedBy||"", now
    ];
    sh.appendRow(newRow.slice(0, headers.length));
    return id;
  },

  deleteAnnouncement(id){
    const sh = SpreadsheetApp.openById(ANN_SHEET_ID).getSheets()[0];
    const { rows, idx } = readAll(sh);
    for(let i=0;i<rows.length;i++){
      if(String(rows[i][idx.ID]||"")===id){
        sh.deleteRow(i+2);
        return true;
      }
    }
    return false;
  },

  listDocuments(){
    const sh = SpreadsheetApp.openById(DOCS_SHEET_ID).getSheets()[0];
    const { rows, idx } = readAll(sh);
    return rows.map(r=>({
      Title: String(r[idx.Title]||""),
      Description: String(r[idx.Description]||""),
      URL: String(r[idx.URL]||""),
      Visibility: String(r[idx.Visibility]||"All"),
      UpdatedAt: r[idx.UpdatedAt] || ""
    }));
  },

  listReminders(){
    const sh = SpreadsheetApp.openById(REM_SHEET_ID).getSheets()[0];
    const { rows, idx } = readAll(sh);
    return rows.map(r=>({
      Title: String(r[idx.Title]||""),
      Body: String(r[idx.Body]||""),
      StartDate: r[idx.StartDate] || "",
      EndDate: r[idx.EndDate] || "",
      Audience: String(r[idx.Audience]||"All")
    }));
  },

  getClassLinksMap(){
    const sh = SpreadsheetApp.openById(CLASSLINKS_SHEET_ID).getSheets()[0];
    const { rows, idx } = readAll(sh);
    const map = {};
    rows.forEach(r=>{
      const c = String(r[idx.Class]||"");
      if(!c) return;
      map[c] = {
        classInfoUrl: String(r[idx.ClassInfoUrl]||""),
        attendanceUrl: String(r[idx.AttendanceUrl]||"")
      };
    });
    return map;
  }
};

// 共用讀表工具
function readAll(sheet){
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const idx = {};
  headers.forEach((h,i)=> idx[h] = i);
  // 常用欄位預先映射
  ['ID','Title','Body','StartDate','EndDate','Audience','Priority','UpdatedBy','UpdatedAt','Class','ClassInfoUrl','AttendanceUrl','URL','Visibility','Description','Email','Role','Classes','DefaultClass'].forEach(k=>{
    if(idx[k]===undefined) idx[k] = -1;
  });
  return { headers, rows: values, idx };
}