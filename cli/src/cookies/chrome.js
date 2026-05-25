'use strict';
const { execSync, spawnSync } = require('child_process');
const { pbkdf2Sync, createDecipheriv } = require('crypto');
const { copyFileSync, unlinkSync, accessSync } = require('fs');
const os = require('os');
const path = require('path');

const BROWSERS = [
  {
    name: 'Chrome',
    paths: [
      path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Default/Cookies'),
      path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Profile 1/Cookies'),
    ],
  },
  {
    name: 'Chromium',
    paths: [
      path.join(os.homedir(), 'Library/Application Support/Chromium/Default/Cookies'),
    ],
  },
  {
    name: 'Microsoft Edge',
    paths: [
      path.join(os.homedir(), 'Library/Application Support/Microsoft Edge/Default/Cookies'),
    ],
  },
];

function getSafeStorageKey(browserName) {
  // Use spawnSync with inherited stdin so macOS Keychain dialogs can appear
  const result = spawnSync(
    'security',
    ['find-generic-password', '-w', '-s', `${browserName} Safe Storage`, '-a', browserName],
    { stdio: ['inherit', 'pipe', 'pipe'], timeout: 15000 }
  );
  if (result.status === 0 && result.stdout) {
    return result.stdout.toString().trim();
  }
  return null;
}

function deriveAesKey(password) {
  return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function decryptValue(encryptedHex, aesKey, cookieName) {
  const buf = Buffer.from(encryptedHex, 'hex');
  if (buf.slice(0, 3).toString() !== 'v10') return null;
  const iv = Buffer.alloc(16, ' ');
  try {
    const decipher = createDecipheriv('aes-128-cbc', aesKey, iv);
    decipher.setAutoPadding(true);
    // Use latin1 to avoid multi-byte encoding issues with high bytes
    const dec = Buffer.concat([decipher.update(buf.slice(3)), decipher.final()]).toString('latin1');

    // Chrome sometimes prepends binary metadata before the actual value.
    // For UUID-shaped values, extract the UUID directly.
    if (cookieName === 'lastActiveOrg') {
      const m = dec.match(UUID_RE);
      return m ? m[0] : null;
    }

    // For other cookies, return the longest printable-ASCII run.
    const runs = dec.match(/[\x20-\x7e]{6,}/g) ?? [];
    return runs.sort((a, b) => b.length - a.length)[0] ?? null;
  } catch {
    return null;
  }
}

function queryDb(dbPath, browserName) {
  const tmp = path.join(os.tmpdir(), `claukit_chrome_${Date.now()}.db`);
  try {
    copyFileSync(dbPath, tmp);
    const out = execSync(
      `sqlite3 "${tmp}" "SELECT name, hex(encrypted_value) FROM cookies WHERE host_key LIKE '%claude.ai%' AND name IN ('sessionKey','lastActiveOrg')" -separator "|||"`,
      { timeout: 5000 }
    ).toString().trim();

    if (!out) return null;

    const password = getSafeStorageKey(browserName);
    if (!password) return null;
    const aesKey = deriveAesKey(password);

    const cookies = {};
    for (const line of out.split('\n')) {
      const sep = line.indexOf('|||');
      if (sep === -1) continue;
      const name = line.slice(0, sep);
      const encHex = line.slice(sep + 3);
      const value = decryptValue(encHex, aesKey, name);
      if (value) cookies[name] = value;
    }

    // Return whatever we found — caller decides if sessionKey is required
    return Object.keys(cookies).length ? cookies : null;
  } catch {
    return null;
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

function extractChrome() {
  for (const { name, paths } of BROWSERS) {
    for (const p of paths) {
      try {
        accessSync(p);
        const result = queryDb(p, name);
        if (result) return { browser: name, ...result };
      } catch {}
    }
  }
  return null;
}

module.exports = { extractChrome };
