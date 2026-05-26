'use strict';
const { readFileSync, writeFileSync, existsSync, chmodSync } = require('fs');
const os = require('os');
const path = require('path');

const STATUSLINE_PATH = path.join(os.homedir(), '.claude', 'statusline-command.sh');

const SCRIPT = `#!/usr/bin/env bash
input=$(cat)

python3 - "$HOME" <<'PYEOF'
import json, os, sys, time, subprocess
from datetime import datetime

raw = sys.stdin.read()
home = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~")

try:
    d = json.loads(raw)
except Exception:
    d = {}

cwd = d.get("workspace", {}).get("current_dir") or d.get("cwd") or ""
model = (d.get("model") or {}).get("display_name") or "Claude"
remaining = (d.get("context_window") or {}).get("remaining_percentage")

display_dir = cwd.replace(home, "~", 1) if cwd.startswith(home) else cwd

git_branch = ""
if cwd:
    try:
        import subprocess as sp
        b = sp.check_output(
            ["git", "-C", cwd, "-c", "core.hooksPath=/dev/null", "symbolic-ref", "--short", "HEAD"],
            stderr=sp.DEVNULL, text=True
        ).strip()
        if b:
            git_branch = f" [{b}]"
    except Exception:
        pass

context_part = ""
if remaining is not None:
    context_part = f" | ctx: {int(remaining)}% left"

cache_path = os.path.expanduser("~/.claukit/usage-cache.json")
claukit_part = ""
try:
    if not os.path.exists(cache_path):
        claukit_bin = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "index.js")
        subprocess.run(["node", claukit_bin, "show"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(cache_path) as f:
        data = json.load(f)
    cached_at = data.get("cachedAt", 0)
    if time.time() * 1000 - cached_at > 60000:
        claukit_bin = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "index.js")
        subprocess.Popen(["node", claukit_bin, "show"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    usage = data.get("usage", {})
    fh = usage.get("five_hour", {})
    sd = usage.get("seven_day", {})
    def bar(util, resets_at, total_ms, width=8):
        filled = round(util * width)
        now_ms = time.time() * 1000
        resets_ms = datetime.fromisoformat(resets_at).timestamp() * 1000 if resets_at else now_ms + total_ms
        elapsed_ms = total_ms - (resets_ms - now_ms)
        marker = max(0, min(width - 1, round((elapsed_ms / total_ms) * width)))
        cells = []
        for i in range(width):
            if i == marker: cells.append("|")
            elif i < filled: cells.append("\\u2588")
            else: cells.append("\\u2591")
        if marker == width - 1: cells.append("|")
        return "".join(cells)
    fh_util = fh.get("utilization", 0)
    sd_util = sd.get("utilization", 0)
    fh_util = fh_util / 100 if fh_util > 1 else fh_util
    sd_util = sd_util / 100 if sd_util > 1 else sd_util
    fh_bar = bar(fh_util, fh.get("resets_at"), 5 * 3600 * 1000)
    sd_bar = bar(sd_util, sd.get("resets_at"), 7 * 24 * 3600 * 1000)
    def color(u): return "\\033[31m" if u > 0.8 else "\\033[38;5;208m"
    reset = "\\033[0m"
    pf = round(fh_util * 100)
    ps = round(sd_util * 100)
    claukit_part = f"  {color(fh_util)}session:{fh_bar} {pf}%{reset}  {color(sd_util)}weekly:{sd_bar} {ps}%{reset}"
except Exception:
    pass

print(f"\\033[35m{display_dir}/\\033[0m\\033[32m{git_branch}\\033[0m\\033[90m {model}{context_part}\\033[0m{claukit_part}", end="")
PYEOF
`;

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

function writeStatusLineToSettings() {
  let settings = {};
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf8');
    settings = JSON.parse(raw);
  } catch {}
  if (settings.statusLine?.command?.includes('statusline-command.sh')) return;
  settings.statusLine = { type: 'command', command: `bash ${STATUSLINE_PATH}` };
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function installStatusline() {
  if (existsSync(STATUSLINE_PATH)) {
    const existing = readFileSync(STATUSLINE_PATH, 'utf8');
    if (existing.includes('claukit')) {
      writeStatusLineToSettings();
      return false;
    }
    // Has custom statusline without claukit — don't overwrite
    return null;
  }

  writeFileSync(STATUSLINE_PATH, SCRIPT);
  chmodSync(STATUSLINE_PATH, 0o755);
  writeStatusLineToSettings();
  return true;
}

module.exports = { installStatusline };
