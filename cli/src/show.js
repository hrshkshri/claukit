'use strict';
const { readFileSync, writeFileSync } = require('fs');
const { readConfig, writeConfig } = require('./config');
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

async function show() {
  const config = readConfig();
  if (!config?.sessionKey || !config?.orgId) return;
  const usage = await fetchUsage(config.sessionKey, config.orgId);
  if (usage) writeCache(usage);
  display(usage);
}

module.exports = { show };
