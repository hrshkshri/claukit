'use strict';
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { readConfig } = require('./config');
const { fetchUsage } = require('./usage');
const { display } = require('./display');
const path = require('path');
const os = require('os');

const CACHE_PATH = path.join(os.homedir(), '.claukit', 'usage-cache.json');

function writeCache(usage) {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify({ usage, cachedAt: Date.now() }));
  } catch {}
}

function readCache() {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'))?.usage ?? null;
  } catch {
    return null;
  }
}

async function show() {
  const config = readConfig();
  if (!config?.sessionKey || !config?.orgId) {
    console.error('claukit: not configured — run `claukit setup` first');
    return;
  }
  const usage = await fetchUsage(config.sessionKey, config.orgId);
  if (usage) {
    writeCache(usage);
    display(usage);
  } else {
    const cached = readCache();
    if (cached) {
      display(cached);
    } else {
      console.error('claukit: could not fetch usage — check your sessionKey with `claukit setup`');
    }
  }
}

module.exports = { show };
