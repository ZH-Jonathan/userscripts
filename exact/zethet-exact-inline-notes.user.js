// ==UserScript==
// @name         ZetHet Exact Inline Notes
// @namespace    https://zethet.nl/
// @version      1.0.0
// @description  Interne ZetHet-aanpassing voor inline notities in Exact Online
// @match        https://start.exactonline.nl/*
// @run-at       document-idle
// @allFrames    true
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ZH-Jonathan/userscripts/main/exact/zethet-exact-inline-notes.user.js
// @downloadURL  https://raw.githubusercontent.com/ZH-Jonathan/userscripts/main/exact/zethet-exact-inline-notes.user.js
// ==/UserScript==

(function () {
   function injectStyles(doc) {
     if (doc.getElementById("zh-exact-inline-notes-style")) return;

     const style = doc.createElement("style");
     style.id = "zh-exact-inline-notes-style";
     style.textContent = `
       .zh-inline-note-row td {
         background: #f8f9fa !important;
         border-top: 0 !important;
         padding: 6px 8px 10px 8px !important;
         border-left: 3px solid #d97048 !important;
       }

       .zh-inline-note-wrapper {
         display: grid;
         grid-template-columns: 90px 1fr;
         gap: 8px;
         align-items: start;
         font-family: inherit;
       }

       .zh-inline-note-label {
         font-weight: 600;
         color: #4d4f4f;
         padding-top: 6px;
         display: flex;
         align-items: center;
         gap: 6px;
       }

       .zh-inline-note-label::after {
         content: "ZetHet";
         display: inline-block;
         color: #d97048;
         border: 1px solid #d97048;
         border-radius: 999px;
         padding: 1px 6px;
         font-size: 10px;
         font-weight: 600;
         line-height: 1.4;
         opacity: 0.85;
       }

       .zh-inline-note-textarea {
         width: 100%;
         min-height: 76px;
         box-sizing: border-box;
         resize: none;
         border: 1px solid #c8c8c8;
         border-radius: 4px;
         padding: 6px 8px;
         font: inherit;
         background: #fff;
         border-left: 2px solid #d97048;
       }

       .zh-inline-note-textarea:focus {
         outline: 2px solid rgba(217, 112, 72, 0.35);
         outline-offset: 1px;
       }

       .ui-dialog:has(iframe[src*="SysPopupMemo.aspx"]) .ui-dialog-titlebar {
         display: none !important;
       }

       .ui-dialog:has(iframe[src*="SysPopupMemo.aspx"]) {
         opacity: 0 !important;
         pointer-events: none !important;
         position: absolute !important;
         left: -9999px !important;
       }

       .ui-widget-overlay {
         display: none !important;
       }
     `;
     doc.documentElement.appendChild(style);
   }

   function updateNoteIcons(rowId, hiddenInput, doc) {
     const hasValue = hiddenInput.value && hiddenInput.value.trim().length > 0;

     const filledIcon = doc.getElementById(`i1${rowId}_Notes`);
     const emptyIcon = doc.getElementById(`i2${rowId}_Notes`);

     if (filledIcon && emptyIcon) {
       filledIcon.style.display = hasValue ? "" : "none";
       emptyIcon.style.display = hasValue ? "none" : "";
     }
   }

   function createInlineNoteForRow(row, doc) {
     if (!row || !row.id || !row.id.startsWith("grd_r")) return;

     const rowId = row.id;
     const hiddenInput = doc.getElementById(`${rowId}_Notes`);
     if (!hiddenInput) return;

     const existing = doc.getElementById(`zh-inline-note-${rowId}`);
     if (existing) {
       const textarea = existing.querySelector("textarea");
       if (textarea && textarea.value !== hiddenInput.value) {
         textarea.value = hiddenInput.value || "";
         textarea.style.height = "auto";
         textarea.style.height = `${textarea.scrollHeight}px`;
       }
       return;
     }

     const noteRow = doc.createElement("tr");
     noteRow.id = `zh-inline-note-${rowId}`;
     noteRow.className = "zh-inline-note-row";
     noteRow.dataset.forRow = rowId;

     const td = doc.createElement("td");
     td.colSpan = 100;

     const wrapper = doc.createElement("div");
     wrapper.className = "zh-inline-note-wrapper";

     const label = doc.createElement("div");
     label.className = "zh-inline-note-label";
     label.textContent = "Notitie";

     const textarea = doc.createElement("textarea");
     textarea.className = "zh-inline-note-textarea";
     textarea.placeholder = "Notitie voor deze orderregel";
     textarea.value = hiddenInput.value || "";
     textarea.rows = 3;

     const autoResizeTextarea = () => {
       textarea.style.height = "auto";
       textarea.style.height = `${textarea.scrollHeight}px`;
     };

     requestAnimationFrame(autoResizeTextarea);

     textarea.addEventListener("input", () => {
       autoResizeTextarea();
       hiddenInput.value = textarea.value;
       hiddenInput.setAttribute("value", textarea.value);

       hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
       hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));

       updateNoteIcons(rowId, hiddenInput, doc);
     });

     textarea.addEventListener("keydown", (event) => {
       event.stopPropagation();
     });

     wrapper.appendChild(label);
     wrapper.appendChild(textarea);
     td.appendChild(wrapper);
     noteRow.appendChild(td);

     row.insertAdjacentElement("afterend", noteRow);

     updateNoteIcons(rowId, hiddenInput, doc);
   }

   function enhanceOrderGrid(doc) {
     injectStyles(doc);

     const rows = Array.from(doc.querySelectorAll("tr.GridRow[id^='grd_r']"));
     rows.forEach((row) => createInlineNoteForRow(row, doc));
   }

   function hideMemoPopups(doc) {
     injectStyles(doc);

     doc.querySelectorAll('iframe[src*="SysPopupMemo.aspx"]').forEach((frame) => {
       const dialog = frame.closest(".ui-dialog");
       if (dialog) {
         dialog.style.opacity = "0";
         dialog.style.pointerEvents = "none";
         dialog.style.position = "absolute";
         dialog.style.left = "-9999px";
       }
     });

     doc.querySelectorAll(".ui-widget-overlay").forEach((overlay) => {
       overlay.style.display = "none";
     });
   }

   function runInDocument(doc) {
     if (!doc || !doc.documentElement) return;

     enhanceOrderGrid(doc);
     hideMemoPopups(doc);
   }

   function runEverywhere() {
     runInDocument(document);

     document.querySelectorAll("iframe").forEach((iframe) => {
       try {
         const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
         runInDocument(iframeDoc);
       } catch {
         // Cross-origin iframe, overslaan.
       }
     });
   }

   const observer = new MutationObserver(() => {
     runEverywhere();
   });

   observer.observe(document.documentElement, {
     childList: true,
     subtree: true
   });

   window.addEventListener("load", runEverywhere);
   setInterval(runEverywhere, 1500);
   runEverywhere();
 })();
