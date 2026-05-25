'use strict';
const { readFileSync, writeFileSync, existsSync, chmodSync } = require('fs');
const os = require('os');
const path = require('path');

const STATUSLINE_PATH = path.join(os.homedir(), '.claude', 'statusline-command.sh');

const SCRIPT = `#!/usr/bin/env bash
input=$(cat)

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')
remaining=$(echo "$input" | jq -r '.context_window.remaining_percentage // empty')

home="$HOME"
display_dir="\${cwd/#$home/\\~}"

git_branch=""
if [ -n "$cwd" ] && git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
  branch=$(git -C "$cwd" -c core.hooksPath=/dev/null symbolic-ref --short HEAD 2>/dev/null)
  [ -n "$branch" ] && git_branch=" [$branch]"
fi

context_part=""
if [ -n "$remaining" ]; then
  remaining_int=\${remaining%.*}
  context_part=" | ctx: \${remaining_int}% left"
fi

claukit_part=$(python3 - <<'PYEOF'
import json, os, time, subprocess, sys

cache_path = os.path.expanduser("~/.claukit/usage-cache.json")
try:
    if not os.path.exists(cache_path):
        subprocess.run(["claukit", "show"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(cache_path) as f:
        data = json.load(f)
    cached_at = data.get("cachedAt", 0)
    if time.time() * 1000 - cached_at > 60000:
        subprocess.Popen(["claukit", "show"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    usage = data.get("usage", {})
    fh = usage.get("five_hour", {})
    sd = usage.get("seven_day", {})
    def bar(util, resets_at, width=8):
        from datetime import datetime
        filled = round(util * width)
        total_ms = 5 * 3600 * 1000
        now_ms = time.time() * 1000
        if resets_at:
            resets_ms = datetime.fromisoformat(resets_at).timestamp() * 1000
        else:
            resets_ms = now_ms + total_ms
        elapsed_ms = total_ms - (resets_ms - now_ms)
        marker = max(0, min(width - 1, round((elapsed_ms / total_ms) * width)))
        cells = []
        for i in range(width):
            if i == marker:
                cells.append("|")
            elif i < filled:
                cells.append("\\u2588")
            else:
                cells.append("\\u2591")
        if marker == width - 1:
            cells.append("|")
        return "".join(cells)
    fh_util = fh.get("utilization", 0)
    sd_util = sd.get("utilization", 0)
    fh_util = fh_util / 100 if fh_util > 1 else fh_util
    sd_util = sd_util / 100 if sd_util > 1 else sd_util
    fh_bar = bar(fh_util, fh.get("resets_at"))
    sd_bar = bar(sd_util, sd.get("resets_at"))
    def color(u):
        if u > 0.8: return "\\033[31m"
        if u > 0.6: return "\\033[33m"
        return "\\033[90m"
    reset = "\\033[0m"
    cf = color(fh_util)
    cs = color(sd_util)
    pf = round(fh_util * 100)
    ps = round(sd_util * 100)
    print(f"  {cf}session:{fh_bar} {pf}%{reset}  {cs}weekly:{sd_bar} {ps}%{reset}", end="")
except Exception:
    pass
PYEOF
)

printf "\\033[35m%s/\\033[0m\\033[32m%s\\033[0m\\033[90m %s%s\\033[0m%s" \\
  "$display_dir" "$git_branch" "$model" "$context_part" "$claukit_part"
`;

function installStatusline() {
  if (existsSync(STATUSLINE_PATH)) {
    const existing = readFileSync(STATUSLINE_PATH, 'utf8');
    if (existing.includes('claukit')) return false;
    // Has custom statusline without claukit — don't overwrite
    return null;
  }

  writeFileSync(STATUSLINE_PATH, SCRIPT);
  chmodSync(STATUSLINE_PATH, 0o755);
  return true;
}

module.exports = { installStatusline };
