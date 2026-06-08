// ==UserScript==
// @name         ZetHet Exact Duplicate Row
// @namespace    https://zethet.nl/
// @version      1.0.0
// @description  Interne ZetHet-aanpassing voor het dupliceren van orderregels in Exact Online
// @match        https://start.exactonline.nl/*
// @run-at       document-idle
// @allFrames    true
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ZH-Jonathan/userscripts/main/exact/zethet-exact-duplicate-row.user.js
// @downloadURL  https://raw.githubusercontent.com/ZH-Jonathan/userscripts/main/exact/zethet-exact-duplicate-row.user.js
// ==/UserScript==

(function () {
  const SKIP_FIELD_SUFFIXES = new Set([
    'K', 'Deleted',
    'AmountFCDisplay', 'AmountVATShow', 'AmountIncludingVATFCDisplay',
    'CostPriceFC', 'CostPriceFCDisplay',
    'Margin', 'MarginAmount', 'AmountFC', 'AmountVATHidden',
    'DiscountAmountFC', 'AmountIncludingVATFC',
    'DescriptionMode', 'VATCodeType',
    'ItemDivisable', 'GLAccountUseCostcenter', 'GLAccountUseCostunit',
    'ActionCreateOpportunity', 'ActionUpdateOpportunityAmount', 'UnitHidden',
  ]);

  function isOfferteOrOrder(doc) {
    const titleElement = doc.querySelector('span.HdrTitle');
    if (!titleElement) return false;
    const titleText = titleElement.textContent || '';
    return titleText.includes('Offerte') || titleText.includes('Verkooporder');
  }

  function collectRowData(rowId, doc) {
    const prefix = rowId + '_';
    const data = [];

    doc.querySelectorAll(`#${rowId} input, #${rowId} select, #${rowId} a[id]`).forEach((el) => {
      if (!el.id || !el.id.startsWith(prefix)) return;
      const suffix = el.id.slice(prefix.length);
      if (SKIP_FIELD_SUFFIXES.has(suffix)) return;

      if (el.tagName === 'SELECT') {
        data.push({
          suffix,
          type: 'select',
          value: el.value,
          options: [...el.options].map((o) => ({ value: o.value, text: o.text })),
        });
      } else if (el.tagName === 'A') {
        data.push({ suffix, type: 'anchor', value: el.textContent });
      } else {
        data.push({ suffix, type: 'input', value: el.value });
      }
    });

    return data;
  }

  function applyRowData(targetId, data, doc) {
    data.forEach(({ suffix, type, value, options }) => {
      const el = doc.getElementById(`${targetId}_${suffix}`);
      if (!el) return;

      if (type === 'select') {
        if (el.options.length === 0 && options.length > 0) {
          options.forEach((o) => {
            const opt = doc.createElement('option');
            opt.value = o.value;
            opt.text = o.text;
            el.appendChild(opt);
          });
        }
        el.value = value;
        el.disabled = false;
      } else if (type === 'anchor') {
        el.textContent = value;
      } else {
        el.value = value;
      }
    });

    try { OnChangePriceEntry(targetId); } catch (e) {}
  }

  function duplicateRow(sourceRow, doc) {
    const sourceId = sourceRow.id;
    const data = collectRowData(sourceId, doc);

    const existingIds = new Set(
      Array.from(doc.querySelectorAll("tr[id^='grd_r']")).map((r) => r.id)
    );

    const gridBody = doc.querySelector('table.Grid tbody') || doc.querySelector('table.Grid');
    const observer = new MutationObserver(() => {
      const newRow = Array.from(doc.querySelectorAll("tr[id^='grd_r']")).find(
        (r) => !existingIds.has(r.id)
      );
      if (!newRow) return;
      observer.disconnect();
      setTimeout(() => applyRowData(newRow.id, data, doc), 50);
    });
    observer.observe(gridBody, { childList: true, subtree: true });

    const insertBtn = doc.getElementById(`${sourceId}_insert`);
    if (insertBtn) insertBtn.click();
  }

  function addDuplicateButton(row, doc) {
    const rowId = row.id;
    if (doc.getElementById(`${rowId}_duplicate`)) return;

    const insertBtn = doc.getElementById(`${rowId}_insert`);
    if (!insertBtn) return;

    const btn = doc.createElement('button');
    btn.id = `${rowId}_duplicate`;
    btn.className = 'Image';
    btn.title = 'Regel dupliceren';
    btn.tabIndex = -1;
    btn.type = 'button';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      duplicateRow(row, doc);
    });

    insertBtn.insertAdjacentElement('afterend', btn);
  }

  function setupDuplicateObserver(doc) {
    const gridContainer = doc.querySelector('table.Grid');
    if (!gridContainer || gridContainer.dataset.zhDuplicateObserverSetup) return;
    gridContainer.dataset.zhDuplicateObserverSetup = 'true';

    const gridBody = gridContainer.querySelector('tbody') || gridContainer;
    let timeout = null;

    new MutationObserver((mutations) => {
      const hasNewRow = mutations.some((m) =>
        m.type === 'childList' &&
        [...m.addedNodes].some(
          (n) => n.nodeType === Node.ELEMENT_NODE && n.id && n.id.startsWith('grd_r')
        )
      );
      if (hasNewRow) {
        clearTimeout(timeout);
        timeout = setTimeout(() => enhanceDuplicateButtons(doc), 50);
      }
    }).observe(gridBody, { childList: true, subtree: true });
  }

  function enhanceDuplicateButtons(doc) {
    if (!isOfferteOrOrder(doc)) return;
    setupDuplicateObserver(doc);
    Array.from(doc.querySelectorAll('tr.GridRow[id^="grd_r"]'))
      .forEach((row) => addDuplicateButton(row, doc));
  }

  function runInDocument(doc) {
    if (!doc || !doc.documentElement) return;
    enhanceDuplicateButtons(doc);
  }

  function runEverywhere() {
    if (!isOfferteOrOrder(document)) return;
    runInDocument(document);
    document.querySelectorAll('iframe').forEach((iframe) => {
      try {
        runInDocument(iframe.contentDocument || iframe.contentWindow.document);
      } catch {
        // Cross-origin iframe, overslaan.
      }
    });
  }

  window.addEventListener('load', runEverywhere);
  setInterval(runEverywhere, 5000);
  runEverywhere();
})();
