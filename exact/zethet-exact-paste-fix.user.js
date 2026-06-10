// ==UserScript==
// @name         ZetHet Exact Plakken Fix
// @namespace    https://zethet.nl/
// @version      1.0.2
// @description  Interne ZetHet-aanpassing: maakt Ctrl+V / Cmd+V mogelijk in velden die dat blokkeren
// @match        https://start.exactonline.nl/*
// @run-at       document-start
// @allFrames    true
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ZH-Jonathan/userscripts/main/exact/zethet-exact-paste-fix.user.js
// @downloadURL  https://raw.githubusercontent.com/ZH-Jonathan/userscripts/main/exact/zethet-exact-paste-fix.user.js
// ==/UserScript==

(function () {
  // Exact blokkeert Ctrl+V via een keydown-handler die preventDefault() aanroept,
  // waardoor het paste-event nooit vuurt. Rechtermuisknop → Plakken werkt wél
  // omdat dat direct het paste-event triggert.
  //
  // Fix: onderschep de keydown in capture-fase (vóór Exact) met
  // stopImmediatePropagation — maar GEEN preventDefault — zodat de browser
  // daarna het paste-event genereert, precies als bij rechtermuisknop.
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'v') return;
    const el = e.target;
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
    e.stopImmediatePropagation();
    // Geen preventDefault → browser vuurt paste-event normaal
  }, true);
})();
