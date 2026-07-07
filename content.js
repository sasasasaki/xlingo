// xLingo content script — X 输入框翻译面板 + 任意页划词三语补齐
(() => {
  const EDITOR_SEL = '[data-testid^="tweetTextarea"][contenteditable="true"], div[contenteditable="true"][role="textbox"]';
  const LABELS = { zh: '中文', ja: '日本語', en: 'English' };
  let panel = null;
  let rememberedEditor = null;

  const isX = /(^|\.)x\.com$|(^|\.)twitter\.com$/.test(location.hostname);

  function activeEditor() {
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
    if (panel) return panel;
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
          const ed = rememberedEditor || activeEditor();
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
    const ed = activeEditor();
    if (!ed) return;
    rememberedEditor = ed;
    const text = ed.innerText.replace(/ /g, ' ').trim();
    if (!text) return status('入力欄が空');
    runTranslate(text, 'compose');
  }

  function selectionTranslate(passedText) {
    const text = (passedText || String(window.getSelection() || '')).trim();
    if (!text) return;
    runTranslate(text, 'selection');
  }

  // X 专用悬浮钮
  if (isX) {
    const fab = document.createElement('button');
    fab.id = 'xlingo-fab';
    fab.textContent = '訳';
    fab.title = '中→日英 翻訳 (Alt+T)';
    fab.onclick = composeTranslate;
    document.addEventListener('focusin', (e) => {
      if (e.target.matches && e.target.matches(EDITOR_SEL)) {
        document.body.appendChild(fab);
        fab.style.display = 'flex';
      }
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'hotkey-translate') {
      // 有选中文本→划词模式;否则 X 输入框模式
      const sel = String(window.getSelection() || '').trim();
      if (sel) selectionTranslate(sel);
      else if (isX) composeTranslate();
    }
    if (msg.type === 'selection-translate') selectionTranslate(msg.text);
  });
})();
