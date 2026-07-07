// xLingo service worker — 多供应商自动调配 + 两种模式(compose:中→日英 / selection:任意→另两语)

const PROVIDERS = {
  deepseek: { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  grok:     { base: 'https://api.x.ai/v1',         model: 'grok-2-latest' },
  gemini:   { base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
};
const TIMEOUT_MS = 25000;

async function getCfg() {
  return chrome.storage.local.get({
    keys: {}, order: ['deepseek', 'grok', 'gemini'], models: {},
    glossary: '', styleJa: '', styleEn: '',
  });
}

function commonRules(cfg) {
  const gl = cfg.glossary ? `\n【固定译法/术语表(必须遵守)】\n${cfg.glossary}` : '';
  const ja = cfg.styleJa ? `\n【日文风格要求】\n${cfg.styleJa}` : '';
  const en = cfg.styleEn ? `\n【英文风格要求】\n${cfg.styleEn}` : '';
  return gl + ja + en;
}

function buildPrompt(text, mode, cfg) {
  if (mode === 'selection') {
    return {
      system: `你是三语(中文/日本語/English)翻译助手,服务二次元/AI创作圈。
用户给你一段网页上选中的文本。先判断它的主要语言:
- 若是日文 → 翻成中文和英文
- 若是英文 → 翻成中文和日文
- 若是中文 → 翻成日文和英文
- 若是其他语言 → 翻成中文/日文/英文三种
要求:自然地道不直译腔;术语表必须遵守;保留原文换行/URL/@。
只输出 JSON,键为语言码,只含目标语言(不含原语言):
{"src":"检测到的语言码(zh/ja/en/other)","zh":"...","ja":"...","en":"..."}(不需要的键省略)${commonRules(cfg)}`,
      user: text,
    };
  }
  // compose: 中→日英(发帖习惯)
  return {
    system: `你是 X(Twitter) 发帖翻译助手。把用户的中文帖文翻成自然地道的日文和英文,面向二次元/AI创作圈,不是直译腔。
规则:
- 日文:X 圈自然口语,禁翻译腔;保留 hashtag/@/URL/换行;emoji 原样。
- 英文:同上,简洁有 X 语感。
- 各语言长度尽量适配 X 字数限制,超长优先精炼。
只输出 JSON:{"ja":"...","en":"..."}${commonRules(cfg)}`,
    user: text,
  };
}

async function callProvider(name, cfg, prompt) {
  const p = PROVIDERS[name];
  const key = (cfg.keys || {})[name];
  if (!key) throw new Error(`${name}: no key`);
  const model = (cfg.models || {})[name] || p.model;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${p.base}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, temperature: 0.3,
        messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status} ${await r.text().catch(() => '')}`.slice(0, 200));
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || '';
    const m = content.match(/\{[\s\S]*\}/);
    const out = JSON.parse(m ? m[0] : content);
    if (!out.ja && !out.en && !out.zh) throw new Error(`${name}: bad shape`);
    return { ...out, provider: name };
  } finally { clearTimeout(timer); }
}

async function translate(text, mode) {
  const cfg = await getCfg();
  const prompt = buildPrompt(text, mode, cfg);
  const errors = [];
  for (const name of cfg.order) {
    if (!(cfg.keys || {})[name]) continue;
    try { return { ok: true, mode, ...(await callProvider(name, cfg, prompt)) }; }
    catch (e) { errors.push(String(e.message || e)); }
  }
  return { ok: false, error: errors.join(' | ') || '没有配置 API key(右键扩展图标→选项)' };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'translate') return;
  translate(msg.text, msg.mode || 'compose').then(sendResponse);
  return true;
});

// 划词右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'xlingo-selection',
    title: 'xLingo:补齐另外两种语言',
    contexts: ['selection'],
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'xlingo-selection' || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'selection-translate', text: info.selectionText || '' });
});

chrome.commands?.onCommand?.addListener((cmd) => {
  if (cmd === 'translate') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: 'hotkey-translate' });
    });
  }
});
