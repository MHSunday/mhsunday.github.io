// assets/js/state.js
(function(global){
  const State = {
    auth: {
      idToken: null,
      email: null,
      role: null,
      classes: [],
      defaultClass: ""
    },
    editAnnId: null,
    get currentClass(){
      const sel = document.getElementById("class");
      if(sel && !sel.classList.contains("hidden") && sel.value) return sel.value;
      return this.auth.defaultClass || (this.auth.classes[0] || "");
    }
  };
  global.AppState = State;
})(window);