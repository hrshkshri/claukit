'use strict';
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const os = require('os');
const path = require('path');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

function installHook(cliPath) {
  let settings = {};
  if (existsSync(SETTINGS_PATH)) {
    try { settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')); } catch {}
  }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

  const already = settings.hooks.SessionStart.some(entry =>
    Array.isArray(entry.hooks) &&
    entry.hooks.some(h => typeof h.command === 'string' && h.command.includes('claukit show'))
  );
  if (already) return false;

  // Use the resolved path so the hook works regardless of PATH
  const cmd = cliPath
    ? `node "${cliPath}" show 2>/dev/null || true`
    : 'claukit show 2>/dev/null || true';

  settings.hooks.SessionStart.push({
    hooks: [{ type: 'command', command: cmd }],
  });

  const dir = path.dirname(SETTINGS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return true;
}

module.exports = { installHook };
