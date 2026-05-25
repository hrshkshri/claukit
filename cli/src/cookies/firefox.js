'use strict';
const { execSync } = require('child_process');
const { copyFileSync, unlinkSync, readdirSync, accessSync } = require('fs');
const os = require('os');
const path = require('path');

function findProfileDbs() {
  const profilesDir = path.join(os.homedir(), 'Library/Application Support/Firefox/Profiles');
  try {
    return readdirSync(profilesDir)
      .map(d => path.join(profilesDir, d, 'cookies.sqlite'))
      .filter(p => { try { accessSync(p); return true; } catch { return false; } });
  } catch {
    return [];
  }
}

function extractFirefox() {
  for (const dbPath of findProfileDbs()) {
    const tmp = path.join(os.tmpdir(), `claukit_ff_${Date.now()}.db`);
    try {
      copyFileSync(dbPath, tmp);
      const out = execSync(
        `sqlite3 "${tmp}" "SELECT name, value FROM moz_cookies WHERE host LIKE '%claude.ai%' AND name IN ('sessionKey','lastActiveOrg')" -separator "|||"`,
        { timeout: 5000 }
      ).toString().trim();

      if (!out) continue;

      const cookies = {};
      for (const line of out.split('\n')) {
        const sep = line.indexOf('|||');
        if (sep === -1) continue;
        const name = line.slice(0, sep);
        const value = line.slice(sep + 3);
        if (name && value) cookies[name] = value;
      }

      if (cookies.sessionKey) return { browser: 'Firefox', ...cookies };
    } catch {
      continue;
    } finally {
      try { unlinkSync(tmp); } catch {}
    }
  }
  return null;
}

module.exports = { extractFirefox };
