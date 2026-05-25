# claukit

**your claude companion.** tokens, cache, usage — all in one spot.

A browser extension + CLI that shows you exactly what's happening with your Claude usage — in real time.

---

## what it does

- **token counter** — see input + output tokens for every message as you chat
- **cache tracking** — know when claude is reading from cache vs. processing fresh
- **usage bars** — visual progress showing how close you are to your 5hr and 7-day limits
- **reset countdown** — shows exactly when your limit resets
- **CLI** — usage bars in your Claude Code status line, auto-refreshing every minute
- works in **light and dark mode** — follows claude.ai's theme automatically

---

## browser extension

### Firefox

**Option A — Firefox Add-ons (recommended)**
[Install from Mozilla Add-ons](https://addons.mozilla.org/addon/claukit/) — version 0.5.0 is live

**Option B — Manual**
1. Download `claukit.zip` from [Releases](https://github.com/hrshkshri/claukit/releases)
2. Open Firefox → go to `about:debugging`
3. Click **This Firefox** → **Load Temporary Add-on**
4. Select the downloaded zip

### Chrome

**Option A — Chrome Web Store**
> *(coming soon)*

**Option B — Manual (Developer Mode)**
1. Download `claukit.zip` from [Releases](https://github.com/hrshkshri/claukit/releases)
2. Unzip it anywhere on your machine
3. Open Chrome → go to `chrome://extensions`
4. Enable **Developer mode** (toggle, top right)
5. Click **Load unpacked** → select the unzipped folder

---

## CLI (Claude Code)

Shows your usage directly in the Claude Code status line.

```bash
npm install -g claukit
claukit setup
```

`setup` auto-detects your claude.ai session from Chrome, Firefox, or Safari and wires everything up. Your status bar will show:

```
~/project/ Sonnet 4.6 | ctx: 87% left | session:████|░░░░ 36%  weekly:██░░|░░░░ 14%
```

The `|` marker shows where you *should* be in your usage window — stay behind it and your tokens won't run out early.

**Requirements:** macOS, Node.js 18+, Claude Code

**Manual refresh:** type `! claukit show` in the Claude Code chat input

---

## how to use the extension

Once installed, open [claude.ai](https://claude.ai) and start chatting. claukit appears automatically — no setup, no login, no config.

| element | what it means |
|---|---|
| token count + mini bar | input tokens used in this message vs. context limit |
| cache timer | how long since your context was last cached |
| session bar | % of your 5-hour usage window consumed |
| weekly bar | % of your 7-day usage window consumed |
| reset countdown | time remaining until your usage window resets |

- **Click the panel** to manually refresh usage data
- Bars turn **orange** as you approach your limit
- No data leaves your browser — everything is read locally from claude.ai's own API responses

---

## build from source

```bash
git clone https://github.com/hrshkshri/claukit.git
cd claukit
npm install
npm run build
```

---

## tech

- TypeScript + esbuild
- Manifest V3
- Firefox 142+ / Chrome 120+
- No runtime dependencies
- Token counting via [tiktoken o200k_base](https://github.com/openai/tiktoken)

---

## license

MIT © 2026 Harsh Keshari
