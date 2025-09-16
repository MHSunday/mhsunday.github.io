// Code.gs（控制器 / 端點）
function doGet(e){ return cors(json({ ok:true, msg:"主日學 API" }), e); }
function doPost(e){
  let payload = {};
  try{ payload = JSON.parse(e.postData.contents || "{}"); }catch(_){}
  const action = (e.parameter.action || "").trim();
  try{
    switch(action){
      case 'whoami': return cors(json(whoami(payload)), e);
      case 'getAnnouncements': return cors(json(getAnnouncementsCtrl(payload)), e);
      case 'saveAnnouncement': return cors(json(saveAnnouncementCtrl(payload)), e);
      case 'deleteAnnouncement': return cors(json(deleteAnnouncementCtrl(payload)), e);
      case 'getDocuments': return cors(json(getDocumentsCtrl(payload)), e);
      case 'getReminders': return cors(json(getRemindersCtrl(payload)), e);
      case 'getClassIframes': return cors(json(getClassIframesCtrl(payload)), e);
      default: return cors(text("Unknown action"), e, 400);
    }
  }catch(err){
    return cors(json({ ok:false, error:String(err) }), e, 500);
  }
}