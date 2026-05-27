'use strict';
const { readFileSync, writeFileSync, existsSync, chmodSync } = require('fs');
const os = require('os');
const path = require('path');

const STATUSLINE_PATH = path.join(os.homedir(), '.claude', 'statusline-command.sh');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

function makeScript(indexJsPath) {
  return `#!/usr/bin/env bash
# claukit statusline - statusline-cache.txt
input=$(cat)

CACHE="$HOME/.claukit/statusline-cache.txt"
CLAUKIT_BIN="${indexJsPath}"
NOW=$(date +%s)

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
    if (existing.includes('statusline-cache.txt')) {
      writeStatusLineToSettings();
      return false;
    }
    if (!existing.includes('claukit')) {
      return null;
    }
    // Old claukit script — upgrade to cache-based version
  }

  writeFileSync(STATUSLINE_PATH, newScript);
  chmodSync(STATUSLINE_PATH, 0o755);
  writeStatusLineToSettings();
  return true;
}

module.exports = { installStatusline };
