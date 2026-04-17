# claukit

**your claude companion.** tokens, cache, usage — all in one spot.

A browser extension that sits quietly inside claude.ai and shows you exactly what's happening with your tokens, cache hits, and usage limits — in real time.

---

## what it does

- **token counter** — see input + output tokens for every message as you chat
- **cache tracking** — know when claude is reading from cache vs. processing fresh
- **usage bars** — visual progress showing how close you are to your 5hr and 7-day limits
- **reset countdown** — shows exactly when your limit resets (hours + seconds when close)
- works in **light and dark mode** — follows claude.ai's theme automatically

---

## install

### Firefox

**Option A — Firefox Add-ons (recommended)**
> *(pending AMO review — link will be live soon)*

**Option B — Manual**
1. Download `claukit.zip` from [Releases](https://github.com/hrshkshri/claukit/releases)
2. Open Firefox → go to `about:debugging`
3. Click **This Firefox** → **Load Temporary Add-on**
4. Select the downloaded zip

> Note: Temporary add-ons are removed when Firefox restarts. Wait for the AMO listing for a permanent install.

---

### Chrome

**Option A — Chrome Web Store**
> *(coming soon)*

**Option B — Manual (Developer Mode)**
1. Download `claukit.zip` from [Releases](https://github.com/hrshkshri/claukit/releases)
2. Unzip it anywhere on your machine
3. Open Chrome → go to `chrome://extensions`
4. Enable **Developer mode** (toggle, top right)
5. Click **Load unpacked** → select the unzipped folder

> Note: Chrome may show a warning about developer mode extensions on restart — just click **Keep** to dismiss it.

---

## how to use it

Once installed, open [claude.ai](https://claude.ai) and start chatting. claukit appears automatically inside the interface — no setup, no login, no config.

### the panel

| element | what it means |
|---|---|
| token count + mini bar | input tokens used in this message vs. context limit |
| cache timer | how long since your context was last cached |
| session bar | % of your 5-hour usage window consumed |
| weekly bar | % of your 7-day usage window consumed |
| reset countdown | time remaining until your usage window resets |

### tips

- **Click the panel** to manually refresh usage data
- **`[i]` buttons** next to each row give a plain-English explanation of that metric
- Bars turn **orange** as you approach your limit
- When the reset is under 1 minute away, it switches to **seconds**
- No data leaves your browser — everything is read locally from claude.ai's own API responses

---

## build from source

```bash
git clone https://github.com/hrshkshri/claukit.git
cd claukit
npm install
npm run build        # production build → dist/
npm run dev          # watch mode with sourcemaps
npm run package      # build + zip for distribution
```

Then load via:
- **Firefox:** `about:debugging → Load Temporary Add-on → manifest.json`
- **Chrome:** `chrome://extensions → Load unpacked → select project folder`

**Requirements:** Node.js 18+

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
