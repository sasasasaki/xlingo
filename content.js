// xLingo content script — 全站三语翻译:任意输入框发文(中日英排版) + 选中文字补齐另两语
(() => {
  const X_SELS = [
    '[data-testid^="tweetTextarea"][contenteditable="true"]',
    'div[data-testid="tweetTextarea_0"]',
    '.public-DraftEditor-content[contenteditable="true"]',
  ];
  const GENERIC_SELS = [
    'div[role="textbox"][contenteditable="true"]',
    '[contenteditable="true"]',
    'textarea',
    'input[type="text"]', 'input[type="search"]', 'input:not([type])',
  ];
  const EDITOR_SEL = X_SELS.concat(GENERIC_SELS).join(', ');
  const LABELS = { zh: '中文', ja: '日本語', en: 'English' };
  const ORDERS = [['zh', 'ja', 'en'], ['ja', 'en', 'zh'], ['en', 'ja', 'zh']];
  const ORDER_LABELS = ['中日英', '日英中', '英日中'];
  const SEP = '\n\n───────\n\n';
  const NBSP = new RegExp(String.fromCharCode(0x00a0), 'g');
  let panel = null;
  let rememberedEditor = null;

  function isEditable(el) { return el && el.matches && el.matches(EDITOR_SEL); }
  function findEditor() {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) { const ed = dialog.querySelector(EDITOR_SEL); if (ed) return ed; }
    const a = document.activeElement;
    if (isEditable(a)) return a;
    if (rememberedEditor && document.body.contains(rememberedEditor)) return rememberedEditor;
    return document.querySelector(EDITOR_SEL);
  }
  function readEditor(ed) {
    if (!ed) return '';
    const v = ('value' in ed && ed.tagName !== 'DIV') ? ed.value : ed.innerText;
    return (v || '').replace(NBSP, ' ');
  }
  function writeEditor(ed, text) {
    ed.focus();
    if ('value' in ed && ed.tagName !== 'DIV') {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ed), 'value');
      if (setter && setter.set) setter.set.call(ed, text); else ed.value = text;
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
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
  function appendEditor(ed, seg) {
    const cur = readEditor(ed).trim();
    writeEditor(ed, cur ? cur + '\n\n' + seg : seg);
  }

  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    panel = document.createElement('div');
    panel.id = 'xlingo-panel';
    panel.innerHTML =
      '<div class="xl-head"><span>xLingo</span><span class="xl-provider"></span><button class="xl-close" title="閉じる">×</button></div>'
      + '<div class="xl-body"></div><div class="xl-foot"></div><div class="xl-status"></div>';
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
  function flash(b, ok) { const t = b.textContent; b.textContent = ok || '✓'; setTimeout(() => (b.textContent = t), 800); }

  function renderBlocks(res) {
    const body = panel.querySelector('.xl-body');
    const foot = panel.querySelector('.xl-foot');
    body.innerHTML = ''; foot.innerHTML = '';
    const present = ['zh', 'ja', 'en'].filter((k) => res[k]);
    const getVal = (k) => {
      const el = body.querySelector('.xl-text[data-lang="' + k + '"]');
      return el ? el.innerText.trim() : '';
    };
    for (const k of present) {
      const block = document.createElement('div');
      block.className = 'xl-block';
      block.innerHTML = '<div class="xl-label">' + LABELS[k] + '</div>'
        + '<div class="xl-text" data-lang="' + k + '" contenteditable="true"></div>'
        + '<div class="xl-btns"></div>';
      block.querySelector('.xl-text').textContent = res[k];
      const btns = block.querySelector('.xl-btns');
      btns.appendChild(mkBtn('コピー', (b) => { navigator.clipboard.writeText(getVal(k)); flash(b); }));
      btns.appendChild(mkBtn('追加', () => { const ed = findEditor(); if (ed) appendEditor(ed, getVal(k)); }));
      btns.appendChild(mkBtn('置換', () => { const ed = findEditor(); if (ed) writeEditor(ed, getVal(k)); }));
      body.appendChild(block);
    }
    if (present.length === 3) {
      const combine = (order) => order.map(getVal).filter(Boolean).join(SEP);
      ORDERS.forEach((order, i) => {
        foot.appendChild(mkBtn('▶ ' + ORDER_LABELS[i] + ' で入力', () => {
          const ed = findEditor(); if (ed) writeEditor(ed, combine(order));
        }, i === 0 ? 'xl-primary' : ''));
      });
      foot.appendChild(mkBtn('三語コピー(中日英)', (b) => { navigator.clipboard.writeText(combine(ORDERS[0])); flash(b); }));
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
      if (!res) return status('拡張がリロードされた?ページ再読み込み');
      if (!res.ok) return status('失敗: ' + res.error);
      if (mode === 'compose' && seedZh) res.zh = seedZh;
      renderBlocks(res);
      p.querySelector('.xl-provider').textContent = res.provider + (res.src ? ' · 原文:' + (LABELS[res.src] || res.src) : '');
      status('完了 · 各訳文編集可 · 順序ボタンで一括入力');
    });
  }

  function composeTranslate() {
    const ed = findEditor();
    if (!ed) { ensurePanel().style.display = 'block'; return status('入力欄が見つからない(入力欄をクリックしてから)'); }
    rememberedEditor = ed;
    const text = readEditor(ed).trim();
    if (!text) { ensurePanel().style.display = 'block'; return status('入力欄が空——先に文章を入力'); }
    runTranslate(text, 'compose', text);
  }
  function selectionTranslate(passedText) {
    const text = (passedText || String(window.getSelection() || '')).trim();
    if (!text) return;
    runTranslate(text, 'selection');
  }

  // 悬浮按钮:全站常驻
  const fab = document.createElement('button');
  fab.id = 'xlingo-fab'; fab.textContent = '訳';
  fab.title = 'xLingo 翻訳 (Alt+T) — 選択があれば選択文、なければ入力欄';
  fab.onclick = () => {
    const sel = String(window.getSelection() || '').trim();
    if (sel) selectionTranslate(sel); else composeTranslate();
  };
  const mountFab = () => { if (document.body && !document.body.contains(fab)) { document.body.appendChild(fab); fab.style.display = 'flex'; } };
  mountFab();
  new MutationObserver(mountFab).observe(document.documentElement, { childList: true, subtree: true });

  // 记住最近操作的输入框
  document.addEventListener('focusin', (e) => { if (isEditable(e.target)) rememberedEditor = e.target; }, true);
  document.addEventListener('input', (e) => { if (isEditable(e.target)) rememberedEditor = e.target; }, true);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'hotkey-translate') {
      const sel = String(window.getSelection() || '').trim();
      if (sel) selectionTranslate(sel); else composeTranslate();
    }
    if (msg.type === 'selection-translate') selectionTranslate(msg.text);
  });
})();
