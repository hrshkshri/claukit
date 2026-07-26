# claukit

**your claude companion.** session + weekly usage bars right in the Claude Code status line.

```
~/project/ Sonnet 4.6 | ctx: 87% left | session:████|░░░░ 36%  weekly:██░░|░░░░ 14%
```

The `|` marker shows where you *should* be in your usage window — stay behind it and your tokens won't run out early. Bars turn orange as you approach your limit.

---

## install

```bash
npm install -g claukit
claukit setup
```

`setup` tries to auto-detect your claude.ai session from Chrome, Firefox, or
Safari. If it can't read the cookies off disk — common on macOS, or when the
session cookie is in-memory only — it walks you through grabbing them manually:

1. open [claude.ai](https://claude.ai) in your browser
2. open devtools — `cmd+option+i` (mac) or `f12` (linux)
3. **Application → Cookies → https://claude.ai**
4. copy the values for `sessionKey` and `lastActiveOrg` and paste them when prompted

Once configured, your status bar shows cached usage bars and refreshes them in the
background at most once a minute as you work.

**Requirements:** macOS / Linux, Node.js 18+, [Claude Code](https://claude.ai/code)

---

## commands

```bash
claukit setup       # one-time setup — detects session, configures status line
claukit show        # print current usage bars
claukit uninstall   # remove the status line, hook, and cached data
```

**Manual refresh in Claude Code:** type `! claukit show` in the chat input.

---

## uninstall

npm can't run cleanup scripts on removal, so remove claukit's Claude Code
integration first, then the package:

```bash
claukit uninstall
npm uninstall -g claukit
```

`uninstall` removes the `SessionStart` hook and status line from
`~/.claude/settings.json`, deletes `~/.claude/statusline-command.sh`, and clears
`~/.claukit`. If you forget and just `npm uninstall`, the status line detects that
claukit is gone on its next render and removes itself automatically.

---

## what the bars mean

| bar | what it shows |
|---|---|
| `session` | % of your 5-hour usage window consumed |
| `weekly` | % of your 7-day usage window consumed |
| `\|` marker | ideal pace — stay behind it to avoid hitting limits mid-session |

---

## also available as a browser extension

claukit also runs as a Firefox/Chrome extension showing token counts, cache tracking, and usage bars on [claude.ai](https://claude.ai) — no setup needed.

- [Firefox Add-ons](https://addons.mozilla.org/addon/claukit/)
- [GitHub](https://github.com/hrshkshri/claukit)

---

## license

MIT © 2026 Harsh Keshari
