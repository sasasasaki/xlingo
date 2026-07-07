# xLingo

Write in Chinese, post in Japanese & English — an X (Twitter) compose-box translator with **your own glossary** and **multi-provider failover** (DeepSeek → Grok → Gemini).

X の入力欄に中国語を書く → ワンクリックで日本語/英語に。自分の用語集を強制適用、API は自動フェイルオーバー。

在 X 输入框写中文 → 一键出日文+英文,固定译法(语料库)强制遵守,多家 API 自动调配。

## Features
- 🔘 Floating button on the compose box / hotkey **Alt+T**
- 🖱️ **Select any text on any page → right-click → "xLingo:补齐另外两种语言"** — auto-detects CN/JA/EN and outputs the other two (better than built-in Grok translate)
- 🇯🇵🇬🇧 Japanese + English side by side, **editable before inserting**
- 📖 Glossary: your fixed translations are enforced (e.g. character names)
- 🎨 Per-language style rules (casual JP for posts, polite for artists, etc.)
- 🔁 Provider failover: DeepSeek → Grok → Gemini (any subset, reorderable)
- 🔒 Keys live in `chrome.storage.local` only — direct calls to official APIs, no middleman

## Install (unpacked)
1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Right-click the extension icon → **Options** → paste your API key(s) + glossary
4. Open x.com, focus the compose box → red **訳** button appears (or press Alt+T)

## Notes
- Inserting replaces the whole compose box (hashtags/@/URLs are preserved inside the translation)
- If X changes its DOM and the button misses the box: click inside the box, then Alt+T
- Alt+T is context-aware: text selected → selection mode; otherwise X compose mode
- Roadmap: Firefox port · style presets per audience · Typefully integration

## License
MIT © sasasasaki
