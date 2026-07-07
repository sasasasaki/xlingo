// xLingo service worker — 多供应商自动调配(按优先级失败切换)
// 供应商全部走 OpenAI 兼容 chat/completions,一套客户端三个 baseURL。

const PROVIDERS = {
  deepseek: { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  grok:     { base: 'https://api.x.ai/v1',         model: 'grok-2-latest' },
  gemini:   { base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
};
const TIMEOUT_MS = 25000;

async function getCfg() {
  const d = await chrome.storage.local.get({
    keys: {},                 // {deepseek:'sk-..', grok:'', gemini:''}
    order: ['deepseek', 'grok', 'gemini'],
    models: {},               // 可覆盖默认模型名
    glossary: '',             // 用户语料库:术语对/固定译法,每行一条
    styleJa: '',              // 日文风格样例/规则
    styleEn: '',              // 英文风格样例/规则
  });
  return d;
}

function buildPrompt(text, cfg) {
  const gl = cfg.glossary ? `\n【固定译法/术语表(必须遵守)】\n${cfg.glossary}` : '';
  const ja = cfg.styleJa ? `\n【日文风格要求】\n${cfg.styleJa}` : '';
  const en = cfg.styleEn ? `\n【英文风格要求】\n${cfg.styleEn}` : '';
  return {
    system: `你是 X(Twitter) 发帖翻译助手。把用户的中文帖文翻成自然地道的日文和英文,面向二次元/AI创作圈,不是直译腔。
规则:
- 日文:X 圈自然口语,禁翻译腔;保留原文的 hashtag/@/URL/换行结构;emoji 原样保留。
- 英文:同上,简洁有 X 平台语感。
- 术语表中的词必须用指定译法。
- 各语言长度尽量 ≤280 字符(日文≤140 全角感觉),超长时优先精炼而非截断。
- 只输出 JSON:{"ja":"...","en":"..."},不要任何其他文字。${gl}${ja}${en}`,
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
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status} ${await r.text().catch(() => '')}`.slice(0, 200));
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || '';
    const m = content.match(/\{[\s\S]*\}/);
    const out = JSON.parse(m ? m[0] : content);
    if (!out.ja && !out.en) throw new Error(`${name}: bad shape`);
    return { ja: out.ja || '', en: out.en || '', provider: name };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'translate') return;
  (async () => {
    const cfg = await getCfg();
    const prompt = buildPrompt(msg.text, cfg);
    const errors = [];
    for (const name of cfg.order) {
      if (!(cfg.keys || {})[name]) continue;
      try {
        const out = await callProvider(name, cfg, prompt);
        sendResponse({ ok: true, ...out });
        return;
      } catch (e) {
        errors.push(String(e.message || e));
      }
    }
    sendResponse({ ok: false, error: errors.join(' | ') || '没有配置任何 API key(右键扩展图标→选项)' });
  })();
  return true; // async
});

chrome.commands?.onCommand?.addListener((cmd) => {
  if (cmd === 'translate') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: 'hotkey-translate' });
    });
  }
});
