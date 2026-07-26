'use strict';
const { readFileSync, writeFileSync, existsSync, chmodSync } = require('fs');
const os = require('os');
const path = require('path');

const STATUSLINE_PATH = path.join(os.homedir(), '.claude', 'statusline-command.sh');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

const SCRIPT_VERSION = 'claukit statusline v2';

function makeScript(indexJsPath) {
  return `#!/usr/bin/env bash
# ${SCRIPT_VERSION} - statusline-cache.txt
input=$(cat)

CACHE="$HOME/.claukit/statusline-cache.txt"
SELF="$HOME/.claude/statusline-command.sh"
CLAUKIT_BIN="${indexJsPath}"
NOW=$(date +%s)

# Resolve the binary. If the recorded path is gone (e.g. an nvm version switch),
# fall back to whatever's on PATH before assuming claukit was uninstalled.
if [[ ! -f "$CLAUKIT_BIN" ]]; then
    if command -v claukit >/dev/null 2>&1; then
        CLAUKIT_BIN="$(command -v claukit)"
    else
        # claukit is truly gone — clear the bar and remove this script so it
        # stops rendering stale usage after \`npm uninstall -g claukit\`.
        rm -f "$CACHE" "$SELF"
        exit 0
    fi
fi

if [[ ! -f "$CACHE" ]]; then
    node "$CLAUKIT_BIN" show >/dev/null 2>&1
else
    MTIME=$(stat -f %m "$CACHE" 2>/dev/null || stat -c %Y "$CACHE" 2>/dev/null || echo 0)
    if (( NOW - MTIME > 60 )); then
        node "$CLAUKIT_BIN" show >/dev/null 2>&1 &
    fi
fi

[[ -f "$CACHE" ]] && cat "$CACHE"
`;
}

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

function installStatusline(cliPath) {
  const indexJsPath = cliPath || path.resolve(__dirname, '..', 'index.js');
  const newScript = makeScript(indexJsPath);

  if (existsSync(STATUSLINE_PATH)) {
    const existing = readFileSync(STATUSLINE_PATH, 'utf8');
    if (existing.includes(SCRIPT_VERSION)) {
      // Current version already installed — just make sure settings point at it.
      writeStatusLineToSettings();
      return false;
    }
    if (!existing.includes('claukit')) {
      return null;
    }
    // Older claukit script — fall through to upgrade to the current version.
  }

  writeFileSync(STATUSLINE_PATH, newScript);
  chmodSync(STATUSLINE_PATH, 0o755);
  writeStatusLineToSettings();
  return true;
}

module.exports = { installStatusline };
