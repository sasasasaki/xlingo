// xLingo content script — X 输入框旁挂翻译面板
(() => {
  const EDITOR_SEL = '[data-testid^="tweetTextarea"][contenteditable="true"], div[contenteditable="true"][role="textbox"]';
  let panel = null;

  function activeEditor() {
    const el = document.activeElement;
    if (el && el.matches && el.matches(EDITOR_SEL)) return el;
    return document.querySelector(EDITOR_SEL);
  }

  function readText(ed) {
    return ed ? ed.innerText.replace(/ /g, ' ').trim() : '';
  }

  function insertText(ed, text) {
    ed.focus();
    // 全选后用 insertText 替换(X 的 draft.js 系编辑器吃这套)
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'xlingo-panel';
    panel.innerHTML = `
      <div class="xl-head"><span>xLingo</span><span class="xl-provider"></span><button class="xl-close" title="閉じる">×</button></div>
      <div class="xl-body">
        <div class="xl-block"><div class="xl-label">日本語</div><div class="xl-text xl-ja" contenteditable="true"></div>
          <div class="xl-btns"><button data-act="copy-ja">コピー</button><button data-act="insert-ja">入力欄へ</button></div></div>
        <div class="xl-block"><div class="xl-label">English</div><div class="xl-text xl-en" contenteditable="true"></div>
          <div class="xl-btns"><button data-act="copy-en">Copy</button><button data-act="insert-en">Insert</button></div></div>
      </div>
      <div class="xl-status"></div>`;
    document.body.appendChild(panel);
    panel.querySelector('.xl-close').onclick = () => (panel.style.display = 'none');
    panel.querySelector('.xl-body').addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;
      const ja = panel.querySelector('.xl-ja').innerText.trim();
      const en = panel.querySelector('.xl-en').innerText.trim();
      const ed = activeEditorRemembered || activeEditor();
      if (act === 'copy-ja') navigator.clipboard.writeText(ja);
      if (act === 'copy-en') navigator.clipboard.writeText(en);
      if (act === 'insert-ja' && ed) insertText(ed, ja);
      if (act === 'insert-en' && ed) insertText(ed, en);
      if (act.startsWith('copy')) flash(e.target);
    });
    return panel;
  }

  function flash(btn) {
    const t = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => (btn.textContent = t), 800);
  }

  let activeEditorRemembered = null;

  async function translateNow() {
    const ed = activeEditor();
    if (!ed) return status('入力欄が見つからない');
    activeEditorRemembered = ed;
    const text = readText(ed);
    if (!text) return status('入力欄が空');
    const p = ensurePanel();
    p.style.display = 'block';
    p.querySelector('.xl-ja').textContent = '…';
    p.querySelector('.xl-en').textContent = '…';
    status('翻訳中…');
    chrome.runtime.sendMessage({ type: 'translate', text }, (res) => {
      if (!res) return status('拡張がリロードされた?ページを再読み込み');
      if (!res.ok) return status('失敗: ' + res.error);
      p.querySelector('.xl-ja').textContent = res.ja;
      p.querySelector('.xl-en').textContent = res.en;
      p.querySelector('.xl-provider').textContent = res.provider;
      status('完了(訳文は直接編集可)');
    });
  }

  function status(s) {
    if (panel) panel.querySelector('.xl-status').textContent = s;
  }

  // 悬浮按钮:编辑框获得焦点时出现
  const fab = document.createElement('button');
  fab.id = 'xlingo-fab';
  fab.textContent = '訳';
  fab.title = '中→日英 翻訳 (Alt+T)';
  fab.onclick = translateNow;
  document.addEventListener('focusin', (e) => {
    if (e.target.matches && e.target.matches(EDITOR_SEL)) {
      document.body.appendChild(fab);
      fab.style.display = 'flex';
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'hotkey-translate') translateNow();
  });
})();
