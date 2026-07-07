// xLingo content script — X 三语发帖面板(中/日/英框全在,追加/替换/一键排版) + 任意页划词补齐
(() => {
  const EDITOR_SELS = [
    '[data-testid^="tweetTextarea"][contenteditable="true"]',
    'div[data-testid="tweetTextarea_0"]',
    '.public-DraftEditor-content[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
  ];
  const EDITOR_SEL = EDITOR_SELS.join(', ');
  const LABELS = { zh: '中文', ja: '日本語', en: 'English' };
  const NBSP = new RegExp(String.fromCharCode(0x00a0), 'g');
  const SEP = '\n\n───────\n\n';   // 三语一键排版时的分割线
  let panel = null;
  let rememberedEditor = null;

  const isX = /(^|\.)x\.com$|(^|\.)twitter\.com$/.test(location.hostname);

  function findEditor() {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) { const ed = dialog.querySelector(EDITOR_SEL); if (ed) return ed; }
    const el = document.activeElement;
    if (el && el.matches && el.matches(EDITOR_SEL)) return el;
    return document.querySelector(EDITOR_SEL);
  }
  function getEditor() {
    return (rememberedEditor && document.body.contains(rememberedEditor)) ? rememberedEditor : findEditor();
  }
  // X の draft.js は insertText で改行入り文字列を入れると内部stateが最後の行しか
  // 覚えない(投稿すると英語だけになるバグ)。paste を模擬すると複数行を正しく取り込む。
  function setText(ed, text) {           // 全文替换(paste 模拟,多行安全)
    ed.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(ed);
    sel.addRange(range);
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    let ev;
    try {
      ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      if (!ev.clipboardData) throw new Error('no clipboardData');
    } catch (_) {
      ev = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: dt });
    }
    ed.dispatchEvent(ev);
  }
  function appendText(ed, seg) {
    const cur = ed.innerText.replace(NBSP, ' ').trim();
    setText(ed, cur ? cur + '\n\n' + seg : seg);
  }

  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    panel = document.createElement('div');
    panel.id = 'xlingo-panel';
    panel.innerHTML = `
      <div class="xl-head"><span>xLingo</span><span class="xl-provider"></span><button class="xl-close" title="閉じる">×</button></div>
      <div class="xl-body"></div>
      <div class="xl-foot"></div>
      <div class="xl-status"></div>`;
    document.body.appendChild(panel);
    panel.querySelector('.xl-close').onclick = () => (panel.style.display = 'none');
    return panel;
  }

  function mkBtn(label, fn, cls) {
    const b = document.createElement('button');
    b.textContent = label; if (cls) b.className = cls;
    b.onclick = () => fn(b);
    return b;
  }
  function flash(b, ok = '✓') { const t = b.textContent; b.textContent = ok; setTimeout(() => (b.textContent = t), 800); }

  function renderBlocks(res, mode) {
    const body = panel.querySelector('.xl-body');
    const foot = panel.querySelector('.xl-foot');
    body.innerHTML = ''; foot.innerHTML = '';
    const langs = ['zh', 'ja', 'en'].filter((k) => res[k]);
    const getVal = (k) => body.querySelector(`.xl-text[data-lang="${k}"]`)?.innerText.trim() || '';

    for (const k of langs) {
      const block = document.createElement('div');
      block.className = 'xl-block';
      block.innerHTML = `<div class="xl-label">${LABELS[k]}</div><div class="xl-text" data-lang="${k}" contenteditable="true"></div><div class="xl-btns"></div>`;
      block.querySelector('.xl-text').textContent = res[k];
      const btns = block.querySelector('.xl-btns');
      btns.appendChild(mkBtn('コピー', (b) => { navigator.clipboard.writeText(getVal(k)); flash(b); }));
      if (mode === 'compose') {
        btns.appendChild(mkBtn('追加', () => { const ed = getEditor(); if (ed) appendText(ed, getVal(k)); }));
        btns.appendChild(mkBtn('置換', () => { const ed = getEditor(); if (ed) setText(ed, getVal(k)); }));
      }
      body.appendChild(block);
    }

    if (mode === 'compose' && langs.length) {
      // 底部:三语一键排版(分割线拼接,一次替换全文)
      foot.appendChild(mkBtn('▶ 三語まとめて入力欄へ(分割線つき)', () => {
        const combined = langs.map(getVal).filter(Boolean).join(SEP);
        const ed = getEditor(); if (ed) setText(ed, combined);
      }, 'xl-primary'));
      foot.appendChild(mkBtn('三語コピー', (b) => {
        navigator.clipboard.writeText(langs.map(getVal).filter(Boolean).join(SEP)); flash(b);
      }));
    }
  }

  function status(s) { if (panel) panel.querySelector('.xl-status').textContent = s; }

  function runTranslate(text, mode, seedZh) {
    const p = ensurePanel();
    p.style.display = 'block';
    p.querySelector('.xl-body').innerHTML = '<div class="xl-block"><div class="xl-text">…</div></div>';
    p.querySelector('.xl-foot').innerHTML = '';
    status('翻訳中…');
    chrome.runtime.sendMessage({ type: 'translate', text, mode }, (res) => {
      if (!res) return status('拡張がリロードされた?ページを再読み込み');
      if (!res.ok) return status('失敗: ' + res.error);
      if (mode === 'compose' && seedZh) res.zh = seedZh;   // 中文框=原文原样,可编辑
      renderBlocks(res, mode);
      p.querySelector('.xl-provider').textContent = res.provider + (res.src ? ` · 原文:${LABELS[res.src] || res.src}` : '');
      status('完了(各訳文は直接編集可 · 追加=前文の後に空行つき)');
    });
  }

  function composeTranslate() {
    const ed = findEditor();
    if (!ed) { ensurePanel().style.display = 'block'; return status('入力欄が見つからない(発帖框を開いてから)'); }
    rememberedEditor = ed;
    const text = ed.innerText.replace(/ /g, ' ').trim();
    if (!text) { ensurePanel().style.display = 'block'; return status('入力欄が空——先に中国語を書いて'); }
    runTranslate(text, 'compose', text);
  }

  function selectionTranslate(passedText) {
    const text = (passedText || String(window.getSelection() || '')).trim();
    if (!text) return;
    runTranslate(text, 'selection');
  }

  if (isX) {
    const fab = document.createElement('button');
    fab.id = 'xlingo-fab'; fab.textContent = '訳'; fab.title = '中→日英 翻訳 (Alt+T)';
    fab.onclick = composeTranslate;
    const tick = () => {
      const has = !!document.querySelector(EDITOR_SEL);
      if (has) { if (!document.body.contains(fab)) document.body.appendChild(fab); fab.style.display = 'flex'; }
      else fab.style.display = 'none';
    };
    setInterval(tick, 800);
    new MutationObserver(() => tick()).observe(document.documentElement, { childList: true, subtree: true });
    tick();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'hotkey-translate') {
      const sel = String(window.getSelection() || '').trim();
      if (sel) selectionTranslate(sel); else if (isX) composeTranslate();
    }
    if (msg.type === 'selection-translate') selectionTranslate(msg.text);
  });
})();
