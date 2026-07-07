// xLingo content script — X 输入框翻译面板 + 任意页划词三语补齐
(() => {
  // X 编辑器的多代选择器(draft.js 结构随版本漂移,全部兜住)
  const EDITOR_SELS = [
    '[data-testid^="tweetTextarea"][contenteditable="true"]',
    'div[data-testid="tweetTextarea_0"]',
    '.public-DraftEditor-content[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
  ];
  const EDITOR_SEL = EDITOR_SELS.join(', ');
  const LABELS = { zh: '中文', ja: '日本語', en: 'English' };
  let panel = null;
  let rememberedEditor = null;

  const isX = /(^|\.)x\.com$|(^|\.)twitter\.com$/.test(location.hostname);

  function findEditor() {
    // 弹窗(role=dialog)里的优先——发推弹窗/回复弹窗
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      const ed = dialog.querySelector(EDITOR_SEL);
      if (ed) return ed;
    }
    const el = document.activeElement;
    if (el && el.matches && el.matches(EDITOR_SEL)) return el;
    return document.querySelector(EDITOR_SEL);
  }

  function insertText(ed, text) {
    ed.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
  }

  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    panel = document.createElement('div');
    panel.id = 'xlingo-panel';
    panel.innerHTML = `
      <div class="xl-head"><span>xLingo</span><span class="xl-provider"></span><button class="xl-close" title="閉じる">×</button></div>
      <div class="xl-body"></div>
      <div class="xl-status"></div>`;
    document.body.appendChild(panel);
    panel.querySelector('.xl-close').onclick = () => (panel.style.display = 'none');
    return panel;
  }

  function renderBlocks(res, mode) {
    const body = panel.querySelector('.xl-body');
    body.innerHTML = '';
    const langs = ['zh', 'ja', 'en'].filter((k) => res[k]);
    for (const k of langs) {
      const block = document.createElement('div');
      block.className = 'xl-block';
      block.innerHTML = `
        <div class="xl-label">${LABELS[k]}</div>
        <div class="xl-text" data-lang="${k}" contenteditable="true"></div>
        <div class="xl-btns"></div>`;
      block.querySelector('.xl-text').textContent = res[k];
      const btns = block.querySelector('.xl-btns');
      const copy = document.createElement('button');
      copy.textContent = 'コピー';
      copy.onclick = () => {
        navigator.clipboard.writeText(block.querySelector('.xl-text').innerText.trim());
        copy.textContent = '✓'; setTimeout(() => (copy.textContent = 'コピー'), 800);
      };
      btns.appendChild(copy);
      if (mode === 'compose') {
        const ins = document.createElement('button');
        ins.textContent = '入力欄へ';
        ins.onclick = () => {
          const ed = (rememberedEditor && document.body.contains(rememberedEditor)) ? rememberedEditor : findEditor();
          if (ed) insertText(ed, block.querySelector('.xl-text').innerText.trim());
        };
        btns.appendChild(ins);
      }
      body.appendChild(block);
    }
  }

  function status(s) { if (panel) panel.querySelector('.xl-status').textContent = s; }

  function runTranslate(text, mode) {
    const p = ensurePanel();
    p.style.display = 'block';
    p.querySelector('.xl-body').innerHTML = '<div class="xl-block"><div class="xl-text">…</div></div>';
    status('翻訳中…');
    chrome.runtime.sendMessage({ type: 'translate', text, mode }, (res) => {
      if (!res) return status('拡張がリロードされた?ページを再読み込み');
      if (!res.ok) return status('失敗: ' + res.error);
      renderBlocks(res, mode);
      p.querySelector('.xl-provider').textContent = res.provider + (res.src ? ` · 原文:${LABELS[res.src] || res.src}` : '');
      status('完了(訳文は直接編集可)');
    });
  }

  function composeTranslate() {
    const ed = findEditor();
    if (!ed) { ensurePanel().style.display = 'block'; return status('入力欄が見つからない(発帖框を開いてから押して)'); }
    rememberedEditor = ed;
    const text = ed.innerText.replace(/ /g, ' ').trim();
    if (!text) { ensurePanel().style.display = 'block'; return status('入力欄が空——先に中国語を書いて'); }
    runTranslate(text, 'compose');
  }

  function selectionTranslate(passedText) {
    const text = (passedText || String(window.getSelection() || '')).trim();
    if (!text) return;
    runTranslate(text, 'selection');
  }

  // ── X 专用悬浮钮:主动扫描,编辑器存在即常驻(弹窗/内嵌通吃) ──
  if (isX) {
    const fab = document.createElement('button');
    fab.id = 'xlingo-fab';
    fab.textContent = '訳';
    fab.title = '中→日英 翻訳 (Alt+T)';
    fab.onclick = composeTranslate;

    const tick = () => {
      const has = !!document.querySelector(EDITOR_SEL);
      if (has) {
        if (!document.body.contains(fab)) document.body.appendChild(fab);
        fab.style.display = 'flex';
      } else {
        fab.style.display = 'none';
      }
    };
    setInterval(tick, 800);
    new MutationObserver(() => tick()).observe(document.documentElement, { childList: true, subtree: true });
    tick();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'hotkey-translate') {
      const sel = String(window.getSelection() || '').trim();
      if (sel) selectionTranslate(sel);
      else if (isX) composeTranslate();
    }
    if (msg.type === 'selection-translate') selectionTranslate(msg.text);
  });
})();
