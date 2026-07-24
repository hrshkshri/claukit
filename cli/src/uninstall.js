'use strict';
const { readFileSync, writeFileSync, existsSync, rmSync } = require('fs');
const os = require('os');
const path = require('path');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const STATUSLINE_PATH = path.join(os.homedir(), '.claude', 'statusline-command.sh');
const CONFIG_DIR = path.join(os.homedir(), '.claukit');

// Remove the SessionStart hook + statusline that `claukit setup` installed,
// and delete claukit's own config/cache dir. Safe to run repeatedly.
function uninstall() {
  const removed = [];

  let settings = null;
  if (existsSync(SETTINGS_PATH)) {
    try { settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')); } catch {}
  }

  let settingsChanged = false;

  if (settings) {
    // 1. Drop any SessionStart hook that runs `claukit show`.
    const sessionStart = settings.hooks?.SessionStart;
    if (Array.isArray(sessionStart)) {
      const kept = sessionStart.filter(entry =>
        !(Array.isArray(entry.hooks) &&
          entry.hooks.some(h => typeof h.command === 'string' &&
            h.command.includes('claukit') && h.command.includes('show')))
      );
      if (kept.length !== sessionStart.length) {
        if (kept.length) settings.hooks.SessionStart = kept;
        else delete settings.hooks.SessionStart;
        if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
        settingsChanged = true;
        removed.push('SessionStart hook (~/.claude/settings.json)');
      }
    }

    // 2. Drop the statusLine entry if it points at claukit's script — but leave
    //    a user's own custom statusline alone.
    const cmd = settings.statusLine?.command;
    if (typeof cmd === 'string' && cmd.includes('statusline-command.sh')) {
      const isClaukitScript = !existsSync(STATUSLINE_PATH) ||
        readFileSync(STATUSLINE_PATH, 'utf8').includes('claukit');
      if (isClaukitScript) {
        delete settings.statusLine;
        settingsChanged = true;
        removed.push('statusLine (~/.claude/settings.json)');
      }
    }
  }

  if (settingsChanged) {
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  }

  // 3. Delete the statusline script itself, if it's ours.
  if (existsSync(STATUSLINE_PATH)) {
    try {
      if (readFileSync(STATUSLINE_PATH, 'utf8').includes('claukit')) {
        rmSync(STATUSLINE_PATH);
        removed.push('~/.claude/statusline-command.sh');
      }
    } catch {}
  }

  // 4. Delete claukit's config + cache dir (this is what keeps the stale bar alive).
  if (existsSync(CONFIG_DIR)) {
    try {
      rmSync(CONFIG_DIR, { recursive: true, force: true });
      removed.push('~/.claukit (config + cache)');
    } catch {}
  }

  if (removed.length) {
    console.log('claukit uninstalled:');
    for (const item of removed) console.log(`  - removed ${item}`);
  } else {
    console.log('nothing to remove — claukit was not installed');
  }
  console.log('\nyou can now run `npm uninstall -g claukit` to remove the package.');

  return removed;
}

module.exports = { uninstall };
