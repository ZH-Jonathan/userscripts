// ==UserScript==
// @name         ZetHet Exact Sneltoetsen
// @namespace    https://zethet.nl/
// @version      1.0.1
// @description  Interne ZetHet-aanpassing: configureerbare sneltoetsen voor Exact Online
// @match        https://start.exactonline.nl/*
// @run-at       document-idle
// @allFrames    true
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ZH-Jonathan/userscripts/main/exact/zethet-exact-shortcuts.user.js
// @downloadURL  https://raw.githubusercontent.com/ZH-Jonathan/userscripts/main/exact/zethet-exact-shortcuts.user.js
// ==/UserScript==

(function () {
  const STORAGE_KEY = 'zh-exact-shortcuts';
  const CONFIG_COMBO = 'Alt+,';

  const PRESETS = [
    {
      id: 'fill-from-above',
      label: 'Rij erboven kopiëren',
      description: 'Vult de huidige rij met de data van de rij erboven',
      defaultKeys: 'Ctrl+B',
      action: 'fill-from-above',
    },
  ];

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
  const LOG = (...args) => console.log('[ZH-SC]', ...args);

  LOG('Script gestart in frame:', window.location.href);

  // Bijhouden welke rij het laatst focus had (in elk frame)
  document.addEventListener('focusin', (e) => {
    if (!e.target?.id) return;
    const m = e.target.id.match(/^(grd_r\d+)_/);
    if (!m) return;
    try { window.top.zhLastActiveRowId = m[1]; } catch {}
    LOG('Actieve rij bijgewerkt:', m[1]);
  });

  // ── Storage ──────────────────────────────────────────────────────────────────

  function loadShortcuts() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveShortcuts(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function buildCombo(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    const k = e.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(k)) {
      parts.push(k.length === 1 ? k.toUpperCase() : k);
    }
    return parts.length >= 2 ? parts.join('+') : '';
  }

  function describeElement(el) {
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const title = (el.title || '').trim();
    const id = el.id || '';
    if (id) return { displayLabel: text || id, matchType: 'id', matchValue: id };
    if (title) return { displayLabel: title, matchType: 'title', matchValue: title };
    if (text) return { displayLabel: text, matchType: 'text', matchValue: text };
    return { displayLabel: el.tagName.toLowerCase(), matchType: 'text', matchValue: '' };
  }

  function getAllDocs() {
    const docs = [document];
    try {
      Array.from(window.top.document.querySelectorAll('iframe')).forEach((f) => {
        try { docs.push(f.contentDocument); } catch {}
      });
    } catch {}
    return docs;
  }

  function isRowButtonId(matchType, matchValue) {
    return matchType === 'id' && /^grd_r\d+_.+$/.test(matchValue);
  }

  function findRowTargetButton(suffix, rowStrategy, docs) {
    LOG('Rij zoeken — strategie:', rowStrategy);

    if (rowStrategy === 'active') {
      let rowId = null;
      try { rowId = window.top.zhLastActiveRowId || null; } catch {}
      LOG('Bijgehouden actieve rij:', rowId);

      if (!rowId) {
        LOG('Geen bijgehouden rij, activeElement proberen');
        for (const doc of docs) {
          if (!doc) continue;
          try {
            const m = doc.activeElement?.id?.match(/^(grd_r\d+)_/);
            if (m) { rowId = m[1]; LOG('Actieve rij via activeElement:', rowId); break; }
          } catch {}
        }
      }

      if (!rowId) { LOG('WAARSCHUWING: geen actieve rij gevonden'); return null; }

      for (const doc of docs) {
        if (!doc) continue;
        const el = doc.getElementById(`${rowId}_${suffix}`);
        if (el) { LOG('Knop gevonden op actieve rij:', rowId, el); return el; }
      }
      LOG('Knop niet gevonden voor rij:', rowId, 'suffix:', suffix);
      return null;
    }

    // 'first' of 'last': zoek over alle docs
    for (const doc of docs) {
      if (!doc) continue;
      const rows = Array.from(doc.querySelectorAll('tr.GridRow[id^="grd_r"]'))
        .filter((r) => r.offsetParent !== null);
      if (!rows.length) continue;
      const targetRow = rowStrategy === 'last' ? rows[rows.length - 1] : rows[0];
      const el = doc.getElementById(`${targetRow.id}_${suffix}`);
      if (el) { LOG('Knop gevonden via strategie "' + rowStrategy + '" op rij:', targetRow.id); return el; }
    }

    LOG('Geen rij gevonden via strategie:', rowStrategy);
    return null;
  }

  function findClickTarget(matchType, matchValue, rowStrategy) {
    const docs = getAllDocs();
    LOG('Zoeken in', docs.length, 'document(en)');

    if (isRowButtonId(matchType, matchValue) && rowStrategy) {
      const suffix = matchValue.match(/^grd_r\d+_(.+)$/)[1];
      LOG('Rij-knop gedetecteerd, suffix:', suffix, '— strategie:', rowStrategy);
      const el = findRowTargetButton(suffix, rowStrategy, docs);
      if (el) return el;
      LOG('Terugvallen op opgeslagen ID:', matchValue);
    }

    for (const doc of docs) {
      if (!doc) continue;
      LOG('Zoeken in:', doc.location?.href || '(geen URL)');
      let el = null;
      if (matchType === 'id') {
        el = doc.getElementById(matchValue);
      } else if (matchType === 'title') {
        try { el = doc.querySelector(`[title="${matchValue.replace(/"/g, '\\"')}"]`); } catch {}
      } else if (matchType === 'text') {
        el = Array.from(
          doc.querySelectorAll('button, a, input[type="submit"], input[type="button"]')
        ).find((b) =>
          (b.textContent || '').trim().replace(/\s+/g, ' ') === matchValue ||
          b.value === matchValue
        );
      }
      if (el) { LOG('Gevonden in dit document:', el); return el; }
    }
    return null;
  }

  function collectRowData(rowId, doc) {
    const prefix = rowId + '_';
    const data = [];
    doc.querySelectorAll(`#${rowId} input, #${rowId} select, #${rowId} a[id]`).forEach((el) => {
      if (!el.id || !el.id.startsWith(prefix)) return;
      const suffix = el.id.slice(prefix.length);
      if (SKIP_FIELD_SUFFIXES.has(suffix)) return;
      if (el.tagName === 'SELECT') {
        data.push({ suffix, type: 'select', value: el.value, options: [...el.options].map((o) => ({ value: o.value, text: o.text })) });
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
        if (el.options.length === 0 && options?.length > 0) {
          options.forEach((o) => { const opt = doc.createElement('option'); opt.value = o.value; opt.text = o.text; el.appendChild(opt); });
        }
        el.value = value;
        el.disabled = false;
      } else if (type === 'anchor') {
        el.textContent = value;
      } else {
        el.value = value;
      }
    });
    try { OnChangePriceEntry(targetId); } catch {}
  }

  function executeFillFromAbove() {
    let currentRowId = null;
    try { currentRowId = window.top.zhLastActiveRowId; } catch {}
    LOG('fill-from-above: actieve rij:', currentRowId);
    if (!currentRowId) return;

    for (const doc of getAllDocs()) {
      if (!doc) continue;
      const currentRow = doc.getElementById(currentRowId);
      if (!currentRow) continue;

      let above = currentRow.previousElementSibling;
      while (above && (
        !above.id?.startsWith('grd_r') ||
        above.offsetParent === null ||
        !above.classList.contains('GridRow')
      )) {
        above = above.previousElementSibling;
      }

      if (!above) { LOG('fill-from-above: geen rij erboven'); return; }

      LOG('fill-from-above: kopiëren van', above.id, 'naar', currentRowId);
      const data = collectRowData(above.id, doc);
      applyRowData(currentRowId, data, doc);
      return;
    }
    LOG('fill-from-above: huidige rij niet gevonden');
  }

  function executeShortcut(s) {
    LOG('Sneltoets uitvoeren:', s.label, s.action);
    if (s.action === 'navigate') {
      LOG('Navigeren naar:', s.value);
      window.top.location.href = s.value;
    } else if (s.action === 'click') {
      LOG('Element zoeken — matchType:', s.matchType, 'matchValue:', s.matchValue, 'rowStrategy:', s.rowStrategy);
      const el = findClickTarget(s.matchType, s.matchValue, s.rowStrategy);
      if (el) {
        LOG('Element gevonden, klikken:', el);
        el.click();
      } else {
        LOG('WAARSCHUWING: element niet gevonden voor matchType:', s.matchType, 'matchValue:', s.matchValue);
      }
    } else if (s.action === 'fill-from-above') {
      executeFillFromAbove();
    }
  }

  // ── Keyboard listener (every frame) ─────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    const combo = buildCombo(e);
    if (!combo) return;

    LOG('Toetscombinatie:', combo, '| frame:', window.location.href);

    if (combo === CONFIG_COMBO) {
      e.preventDefault();
      LOG('Config openen via toetsenbord');
      try { window.top.zhExactShortcutsOpen(); } catch (err) { LOG('FOUT bij openen config:', err); }
      return;
    }

    const shortcuts = loadShortcuts();
    LOG('Beschikbare sneltoetsen:', shortcuts.map((s) => s.keys));
    const match = shortcuts.find((s) => s.keys === combo);
    if (match) {
      LOG('Match gevonden:', match.label);
      e.preventDefault();
      executeShortcut(match);
    }
  });

  // ── Picker (every frame) ─────────────────────────────────────────────────────

  let pickerCleanup = null;

  function activatePickerHere() {
    LOG('Picker activeren in frame:', window.location.href);
    if (pickerCleanup) { LOG('Picker al actief, overslaan'); return; }
    let hovered = null;

    const onOver = (e) => {
      const el = e.target.closest('button, a[href], input[type="submit"], input[type="button"]');
      if (hovered !== el) {
        if (hovered) hovered.style.outline = '';
        hovered = el;
        if (el) el.style.outline = '2px solid #d97048';
      }
    };

    const onClick = (e) => {
      const el = e.target.closest('button, a[href], input[type="submit"], input[type="button"]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      const desc = describeElement(el);
      LOG('Element gekozen:', desc);
      window.top.postMessage({ type: 'zh-pick-result', ...desc }, '*');
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        window.top.postMessage({ type: 'zh-pick-cancel' }, '*');
      }
    };

    const cleanup = () => {
      if (hovered) hovered.style.outline = '';
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
      pickerCleanup = null;
    };

    pickerCleanup = cleanup;
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
  }

  function deactivatePickerHere() {
    if (pickerCleanup) pickerCleanup();
  }

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.type === 'zh-pick-start') { LOG('Picker-start bericht ontvangen'); activatePickerHere(); }
    if (e.data.type === 'zh-pick-stop') { LOG('Picker-stop bericht ontvangen'); deactivatePickerHere(); }
  });

  // ── Top frame only ───────────────────────────────────────────────────────────

  if (window !== window.top) { LOG('Iframe gedetecteerd — UI wordt niet geladen'); return; }

  LOG('Top frame — UI wordt geladen');
  window.zhExactShortcutsOpen = (restore) => openConfig(restore || null);

  let pickCallback = null;
  let pendingForm = null;

  function startPicker(onResult) {
    pickCallback = onResult;
    const iframes = Array.from(document.querySelectorAll('iframe'));
    LOG('Picker starten — top frame + ', iframes.length, 'iframe(s)');
    activatePickerHere();
    iframes.forEach((f) => {
      try { f.contentWindow.postMessage({ type: 'zh-pick-start' }, '*'); } catch (err) { LOG('Kon picker niet sturen naar iframe:', err); }
    });
  }

  function stopAllPickers() {
    deactivatePickerHere();
    Array.from(document.querySelectorAll('iframe')).forEach((f) => {
      try { f.contentWindow.postMessage({ type: 'zh-pick-stop' }, '*'); } catch {}
    });
  }

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.type !== 'zh-pick-result' && e.data.type !== 'zh-pick-cancel') return;
    LOG('Picker resultaat ontvangen:', e.data.type, e.data);
    stopAllPickers();
    const cb = pickCallback;
    pickCallback = null;
    if (cb) cb(e.data.type === 'zh-pick-result' ? e.data : null);
  });

  // ── Styles ────────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('zh-sc-style')) return;
    const s = document.createElement('style');
    s.id = 'zh-sc-style';
    s.textContent = `
      #zh-sc-fab {
        position: fixed; bottom: 16px; right: 16px; z-index: 99999;
        width: 38px; height: 38px; border-radius: 50%;
        background: #d97048; color: #fff; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25); padding: 0;
      }
      #zh-sc-fab:hover { background: #c0603c; }

      #zh-sc-pick-banner {
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        z-index: 100001; background: #111; color: #fff;
        padding: 10px 18px; border-radius: 6px; font-size: 13px;
        font-family: -apple-system, sans-serif;
        display: flex; gap: 14px; align-items: center;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
      }
      #zh-sc-pick-banner button {
        background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
        color: #fff; padding: 4px 12px; border-radius: 4px; cursor: pointer;
        font-size: 12px; font-family: inherit;
      }
      #zh-sc-pick-banner button:hover { background: rgba(255,255,255,0.25); }

      #zh-sc-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.4);
        z-index: 100000; display: flex; align-items: center; justify-content: center;
      }

      #zh-sc-modal {
        background: #fff; border-radius: 6px; width: 500px;
        max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column;
        box-shadow: 0 8px 30px rgba(0,0,0,0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px; color: #111;
      }

      .zh-sc-head {
        padding: 14px 18px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
        display: flex; justify-content: space-between; align-items: center;
        font-weight: 600; font-size: 14px;
      }
      .zh-sc-head button { background: none; border: none; cursor: pointer; font-size: 18px; color: #9ca3af; padding: 0; line-height: 1; }
      .zh-sc-head button:hover { color: #111; }

      .zh-sc-body { padding: 16px 18px; overflow-y: auto; flex: 1; }

      .zh-sc-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }

      .zh-sc-item {
        display: grid; grid-template-columns: 1fr 100px 30px;
        align-items: center; gap: 8px;
        padding: 8px 10px; background: #f9fafb;
        border: 1px solid #e5e7eb; border-radius: 4px;
      }
      .zh-sc-item-lbl { font-weight: 500; font-size: 13px; }
      .zh-sc-item-sub { font-size: 11px; color: #6b7280; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .zh-sc-keys { font-family: monospace; font-size: 12px; background: #fff; border: 1px solid #d1d5db; border-radius: 3px; padding: 2px 6px; text-align: center; }
      .zh-sc-del { background: none; border: none; cursor: pointer; color: #d1d5db; font-size: 15px; padding: 0; }
      .zh-sc-del:hover { color: #ef4444; }
      .zh-sc-empty { text-align: center; color: #9ca3af; padding: 20px 0; }

      .zh-sc-form { border-top: 1px solid #e5e7eb; padding-top: 16px; display: flex; flex-direction: column; gap: 12px; }
      .zh-sc-form-title { font-weight: 600; font-size: 13px; margin: 0; }
      .zh-sc-row { display: flex; flex-direction: column; gap: 3px; }
      .zh-sc-row label { font-size: 11px; font-weight: 500; color: #374151; }
      .zh-sc-row input, .zh-sc-row select {
        padding: 6px 9px; border: 1px solid #d1d5db; border-radius: 4px;
        font-size: 13px; width: 100%; box-sizing: border-box; font-family: inherit;
      }
      .zh-sc-row input:focus, .zh-sc-row select:focus { outline: 2px solid rgba(217,112,72,0.3); border-color: #d97048; }
      .zh-sc-row input[readonly] { background: #f9fafb; }

      .zh-sc-with-btn { display: flex; gap: 8px; }
      .zh-sc-with-btn input { flex: 1; }

      .zh-sc-hint { font-size: 11px; color: #9ca3af; }

      .zh-sc-recorder { display: flex; gap: 8px; }
      .zh-sc-recorder input { flex: 1; }

      .zh-sc-pick-area {
        border: 1px dashed #d1d5db; border-radius: 4px; padding: 12px;
        text-align: center; cursor: pointer; color: #6b7280; font-size: 12px;
        background: #fafafa;
      }
      .zh-sc-pick-area:hover { border-color: #d97048; color: #d97048; background: #fff8f5; }

      .zh-sc-picked {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 10px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px;
      }
      .zh-sc-picked-lbl { flex: 1; color: #166534; font-weight: 500; font-size: 12px; }
      .zh-sc-picked-clear { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 13px; padding: 0; }
      .zh-sc-picked-clear:hover { color: #374151; }

      .zh-sc-actions { display: flex; justify-content: flex-end; }

      .zh-btn { padding: 6px 14px; border-radius: 4px; border: none; cursor: pointer; font-size: 12px; font-weight: 500; font-family: inherit; }
      .zh-btn-primary { background: #d97048; color: #fff; }
      .zh-btn-primary:hover { background: #c0603c; }
      .zh-btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
      .zh-btn-secondary:hover { background: #e5e7eb; }

      .zh-sc-presets { border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 4px; display: flex; flex-direction: column; gap: 8px; }
      .zh-sc-preset-item {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px;
      }
      .zh-sc-preset-item > div { flex: 1; }
      .zh-sc-preset-keys { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .zh-sc-preset-keys input { width: 90px; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; font-family: monospace; background: #fff; }
      .zh-sc-preset-added { font-size: 11px; color: #16a34a; font-weight: 500; white-space: nowrap; }
      .zh-key-conflict { color: #ef4444; font-size: 11px; margin-top: 3px; }
      input.zh-key-error { border-color: #ef4444 !important; background: #fef2f2 !important; }
    `;
    document.head.appendChild(s);
  }

  function showKeyConflict(input, excludeId) {
    const keys = input.value;
    const conflict = loadShortcuts().find((s) => s.keys === keys && s.id !== excludeId);
    let warn = input.parentElement.querySelector('.zh-key-conflict');
    if (!warn) {
      warn = document.createElement('span');
      warn.className = 'zh-key-conflict';
      input.parentElement.appendChild(warn);
    }
    if (conflict) {
      input.classList.add('zh-key-error');
      warn.textContent = `Al in gebruik door "${conflict.label}"`;
    } else {
      input.classList.remove('zh-key-error');
      warn.textContent = '';
    }
    return !!conflict;
  }

  // ── Config modal ─────────────────────────────────────────────────────────────

  function openConfig(restore) {
    injectStyles();
    if (document.getElementById('zh-sc-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'zh-sc-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeConfig(); });

    const modal = document.createElement('div');
    modal.id = 'zh-sc-modal';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    renderModal(modal, restore || null);
  }

  function closeConfig() {
    document.getElementById('zh-sc-overlay')?.remove();
  }

  function renderModal(modal, restore) {
    const shortcuts = loadShortcuts();
    const actionLabel = { navigate: 'Navigeren', click: 'Knop klikken' };
    const rowStrategyLabel = { active: 'rij met cursor', last: 'laatste rij', first: 'eerste rij' };
    const isClick = restore?.action === 'click';
    const pickedIsRowBtn = isRowButtonId(restore?.matchType, restore?.matchValue);

    modal.innerHTML = `
      <div class="zh-sc-head">
        <span>Sneltoetsen</span>
        <button id="zh-sc-close">✕</button>
      </div>
      <div class="zh-sc-body">

        <div class="zh-sc-list">
          ${shortcuts.length === 0
            ? '<div class="zh-sc-empty">Nog geen sneltoetsen ingesteld.</div>'
            : shortcuts.map((s) => `
                <div class="zh-sc-item">
                  <div>
                    <div class="zh-sc-item-lbl">${s.label}</div>
                    <div class="zh-sc-item-sub">${actionLabel[s.action]}: ${s.action === 'navigate' ? s.value : (s.displayLabel || '') + (s.rowStrategy ? ' (' + (rowStrategyLabel[s.rowStrategy] || s.rowStrategy) + ')' : '')}</div>
                  </div>
                  <span class="zh-sc-keys">${s.keys}</span>
                  <button class="zh-sc-del" data-id="${s.id}">🗑</button>
                </div>
              `).join('')
          }
        </div>

        <div class="zh-sc-presets">
          <p class="zh-sc-form-title">Presets</p>
          ${PRESETS.map((p) => {
            const alreadyAdded = shortcuts.some((s) => s.action === p.action);
            return `
              <div class="zh-sc-preset-item">
                <div>
                  <div class="zh-sc-item-lbl">${p.label}</div>
                  <div class="zh-sc-item-sub">${p.description}</div>
                </div>
                <div class="zh-sc-preset-keys">
                  ${alreadyAdded
                    ? `<span class="zh-sc-preset-added">✓ Toegevoegd</span>`
                    : `<input class="zh-sc-preset-key-input" data-preset-id="${p.id}" value="${p.defaultKeys}" readonly>
                       <button class="zh-btn zh-btn-secondary" id="zh-sc-preset-rec-${p.id}" data-preset-id="${p.id}">Opnemen</button>
                       <button class="zh-btn zh-btn-primary zh-sc-preset-add" data-preset-id="${p.id}">+ Toevoegen</button>`
                  }
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="zh-sc-form">
          <p class="zh-sc-form-title">Eigen sneltoets toevoegen</p>

          <div class="zh-sc-row">
            <label>Label</label>
            <input id="zh-sc-label" type="text" placeholder="Bijv. Offertes" value="${restore?.label || ''}">
          </div>

          <div class="zh-sc-row">
            <label>Toetsen</label>
            <div class="zh-sc-recorder">
              <input id="zh-sc-keys" type="text" placeholder="Klik Opnemen en druk toetsen" readonly value="${restore?.keys || ''}">
              <button class="zh-btn zh-btn-secondary" id="zh-sc-rec">Opnemen</button>
            </div>
          </div>

          <div class="zh-sc-row">
            <label>Wat moet er gebeuren?</label>
            <select id="zh-sc-action">
              <option value="navigate"${!isClick ? ' selected' : ''}>Navigeren naar een pagina</option>
              <option value="click"${isClick ? ' selected' : ''}>Een knop klikken</option>
            </select>
          </div>

          <div id="zh-navigate-section" ${isClick ? 'style="display:none"' : ''}>
            <div class="zh-sc-row">
              <label>Pagina (URL)</label>
              <div class="zh-sc-with-btn">
                <input id="zh-sc-url" type="text" placeholder="Navigeer eerst naar de pagina, dan klik Gebruik huidige" value="${restore?.url || ''}">
                <button class="zh-btn zh-btn-secondary" id="zh-sc-use-current">Gebruik huidige</button>
              </div>
              <span class="zh-sc-hint">Ga naar de pagina die je wilt koppelen en klik dan op "Gebruik huidige".</span>
            </div>
          </div>

          <div id="zh-click-section" ${!isClick ? 'style="display:none"' : ''}>
            <div class="zh-sc-row">
              <label>Knop of link</label>
              ${restore?.matchValue
                ? `<div class="zh-sc-picked">
                     <span class="zh-sc-picked-lbl">✓ ${restore.displayLabel}</span>
                     <button class="zh-sc-picked-clear" id="zh-sc-clear-pick" title="Opnieuw kiezen">✕</button>
                   </div>`
                : `<div class="zh-sc-pick-area" id="zh-sc-pick-area">
                     Klik hier om een knop op de pagina te selecteren
                   </div>`
              }
              <span class="zh-sc-hint">Sluit dit venster en klik de knop die de sneltoets moet activeren.</span>
            </div>
            ${pickedIsRowBtn ? `
            <div class="zh-sc-row" style="margin-top:4px">
              <label>Welke rij?</label>
              <select id="zh-sc-row-strategy">
                <option value="active"${!restore.rowStrategy || restore.rowStrategy === 'active' ? ' selected' : ''}>Rij met cursor (aanbevolen)</option>
                <option value="last"${restore.rowStrategy === 'last' ? ' selected' : ''}>Altijd de laatste rij</option>
                <option value="first"${restore.rowStrategy === 'first' ? ' selected' : ''}>Altijd de eerste rij</option>
              </select>
              <span class="zh-sc-hint">Bij "Rij met cursor": de rij waar je op dat moment in typt wordt gebruikt.</span>
            </div>
            ` : ''}
          </div>

          <div class="zh-sc-actions">
            <button class="zh-btn zh-btn-primary" id="zh-sc-add">Toevoegen</button>
          </div>
        </div>

        <p class="zh-sc-hint" style="margin-top:14px;">Dit venster openen: <code>${CONFIG_COMBO}</code></p>
      </div>
    `;

    modal.querySelector('#zh-sc-close').onclick = closeConfig;

    // Delete shortcuts
    modal.querySelectorAll('.zh-sc-del').forEach((btn) => {
      btn.onclick = () => {
        saveShortcuts(loadShortcuts().filter((s) => s.id !== btn.dataset.id));
        renderModal(modal, restore);
      };
    });

    // Preset key recorder + toevoegen
    modal.querySelectorAll('.zh-sc-preset-add').forEach((btn) => {
      const presetId = btn.dataset.presetId;
      const preset = PRESETS.find((p) => p.id === presetId);
      if (!preset) return;

      const keyInput = modal.querySelector(`.zh-sc-preset-key-input[data-preset-id="${presetId}"]`);
      const recBtn = modal.querySelector(`#zh-sc-preset-rec-${presetId}`);
      let recorder = null;

      recBtn.onclick = () => {
        if (recorder) {
          document.removeEventListener('keydown', recorder, true);
          recorder = null;
          recBtn.textContent = 'Opnemen';
          recBtn.style.background = '';
          return;
        }
        keyInput.value = 'Druk toetsen…';
        recBtn.textContent = 'Stop';
        recBtn.style.background = '#fef3c7';
        recorder = (e) => {
          e.preventDefault(); e.stopPropagation();
          const combo = buildCombo(e);
          if (!combo) return;
          keyInput.value = combo;
          document.removeEventListener('keydown', recorder, true);
          recorder = null;
          recBtn.textContent = 'Opnemen';
          recBtn.style.background = '';
          showKeyConflict(keyInput, null);
        };
        document.addEventListener('keydown', recorder, true);
      };

      btn.onclick = () => {
        if (recorder) { document.removeEventListener('keydown', recorder, true); recorder = null; }
        const keys = keyInput.value.trim();
        if (!keys || keys.includes('…')) { alert('Neem eerst een toetscombinatie op.'); return; }
        if (showKeyConflict(keyInput, null)) return;
        const existing = loadShortcuts();
        existing.push({ id: Date.now().toString(), label: preset.label, keys, action: preset.action });
        saveShortcuts(existing);
        renderModal(modal, null);
      };
    });

    // Action toggle
    const actionSel = modal.querySelector('#zh-sc-action');
    actionSel.onchange = () => {
      modal.querySelector('#zh-navigate-section').style.display = actionSel.value === 'navigate' ? '' : 'none';
      modal.querySelector('#zh-click-section').style.display = actionSel.value === 'click' ? '' : 'none';
    };

    // Use current page
    modal.querySelector('#zh-sc-use-current').onclick = () => {
      modal.querySelector('#zh-sc-url').value = window.top.location.href;
    };

    // Key recorder
    const keysInput = modal.querySelector('#zh-sc-keys');
    const recBtn = modal.querySelector('#zh-sc-rec');
    let recordingHandler = null;

    recBtn.onclick = () => {
      if (recordingHandler) {
        document.removeEventListener('keydown', recordingHandler, true);
        recordingHandler = null;
        recBtn.textContent = 'Opnemen';
        recBtn.classList.remove('recording');
        return;
      }
      keysInput.value = 'Druk nu toetsen in…';
      recBtn.textContent = 'Stop';
      recBtn.style.background = '#fef3c7';

      recordingHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const combo = buildCombo(e);
        if (!combo) return;
        keysInput.value = combo;
        document.removeEventListener('keydown', recordingHandler, true);
        recordingHandler = null;
        recBtn.textContent = 'Opnemen';
        recBtn.style.background = '';
        showKeyConflict(keysInput, null);
      };
      document.addEventListener('keydown', recordingHandler, true);
    };

    // Element picker
    const pickArea = modal.querySelector('#zh-sc-pick-area');
    if (pickArea) {
      pickArea.onclick = () => {
        pendingForm = {
          label: modal.querySelector('#zh-sc-label').value,
          keys: keysInput.value.includes('…') ? '' : keysInput.value,
          action: 'click',
          url: '',
          displayLabel: null, matchType: null, matchValue: null,
        };
        if (recordingHandler) {
          document.removeEventListener('keydown', recordingHandler, true);
          recordingHandler = null;
        }
        closeConfig();
        showPickBanner();
        startPicker((result) => {
          hidePickBanner();
          if (result) {
            pendingForm.displayLabel = result.displayLabel;
            pendingForm.matchType = result.matchType;
            pendingForm.matchValue = result.matchValue;
          }
          openConfig(pendingForm);
          pendingForm = null;
        });
      };
    }

    // Clear picked element
    modal.querySelector('#zh-sc-clear-pick')?.addEventListener('click', () => {
      renderModal(modal, { ...restore, displayLabel: null, matchType: null, matchValue: null });
    });

    // Add shortcut
    modal.querySelector('#zh-sc-add').onclick = () => {
      if (recordingHandler) {
        document.removeEventListener('keydown', recordingHandler, true);
        recordingHandler = null;
      }

      const label = modal.querySelector('#zh-sc-label').value.trim();
      const keys = keysInput.value.trim();
      const action = actionSel.value;

      if (!label) { alert('Vul een label in.'); return; }
      if (!keys || keys.includes('…')) { alert('Neem een toetscombinatie op.'); return; }
      if (showKeyConflict(keysInput, null)) return;

      const shortcut = { id: Date.now().toString(), label, keys, action };

      if (action === 'navigate') {
        const url = modal.querySelector('#zh-sc-url').value.trim();
        if (!url) { alert('Klik op "Gebruik huidige" of voer een URL in.'); return; }
        shortcut.value = url;
      } else {
        if (!restore?.matchValue) { alert('Kies eerst een knop op de pagina.'); return; }
        shortcut.displayLabel = restore.displayLabel;
        shortcut.matchType = restore.matchType;
        shortcut.matchValue = restore.matchValue;
        const rowStrategyEl = modal.querySelector('#zh-sc-row-strategy');
        if (rowStrategyEl) shortcut.rowStrategy = rowStrategyEl.value;
      }

      existing.push(shortcut);
      saveShortcuts(existing);
      renderModal(modal, null);
    };
  }

  // ── Pick banner ──────────────────────────────────────────────────────────────

  function showPickBanner() {
    const banner = document.createElement('div');
    banner.id = 'zh-sc-pick-banner';
    banner.innerHTML = `
      <span>Klik op de knop die je wilt koppelen aan de sneltoets</span>
      <button id="zh-sc-pick-cancel">Annuleren</button>
    `;
    banner.querySelector('#zh-sc-pick-cancel').onclick = () => {
      stopAllPickers();
      hidePickBanner();
      openConfig(pendingForm);
      pendingForm = null;
    };
    document.body.appendChild(banner);
  }

  function hidePickBanner() {
    document.getElementById('zh-sc-pick-banner')?.remove();
  }

  // ── Floating knop ─────────────────────────────────────────────────────────────

  function addFab() {
    injectStyles();
    const fab = document.createElement('button');
    fab.id = 'zh-sc-fab';
    fab.title = `Sneltoetsen (${CONFIG_COMBO})`;
    fab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h8"/></svg>`;
    fab.addEventListener('click', () => openConfig(null));
    document.body.appendChild(fab);
  }

  if (document.body) { LOG('FAB toevoegen (body beschikbaar)'); addFab(); }
  else { LOG('Wachten op DOMContentLoaded voor FAB'); document.addEventListener('DOMContentLoaded', addFab); }
})();
