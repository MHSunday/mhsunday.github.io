// Auth.gs（驗證與授權）
const PROPS = PropertiesService.getScriptProperties();
const OAUTH_CLIENT_ID = PROPS.getProperty('OAUTH_CLIENT_ID'); // 例如 1234567890-xxxx
const CORS_ORIGINS = (PROPS.getProperty('CORS_ORIGINS') || 'https://yourname.github.io').split(',');

function whoami(payload){
  const { email } = verifyIdToken(payload.idToken);
  const prof = Sheets.getUserProfile(email);
  return { ok:true, email, ...prof };
}

function verifyIdToken(idToken){
  if(!idToken) throw new Error("缺少 idToken");
  const url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions:true });
  if(res.getResponseCode() !== 200) throw new Error("無效的 idToken");
  const data = JSON.parse(res.getContentText());
  // 接受完整 aud 或僅前綴（視你設定）
  if(data.aud !== OAUTH_CLIENT_ID + ".apps.googleusercontent.com" && data.aud !== OAUTH_CLIENT_ID){
    throw new Error("不相符的 OAuth audience");
  }
  return { email: String(data.email||"").toLowerCase().trim(), sub: data.sub||"", name: data.name||"" };
}

function authorize(email){
  const prof = Sheets.getUserProfile(email);
  return prof;
}

// CORS / 輸出工具
function cors(out, e, status){
  if(status) out.setStatusCode(status);
  const allow = CORS_ORIGINS[0];
  out.setHeader('Access-Control-Allow-Origin', allow);
  out.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  out.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return out;
}
function json(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function text(txt){ return ContentService.createTextOutput(txt); }