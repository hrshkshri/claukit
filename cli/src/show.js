'use strict';
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { readConfig } = require('./config');
const { fetchUsage } = require('./usage');
const { display } = require('./display');
const path = require('path');
const os = require('os');

const CACHE_PATH = path.join(os.homedir(), '.claukit', 'usage-cache.json');
const STATUSLINE_CACHE_PATH = path.join(os.homedir(), '.claukit', 'statusline-cache.txt');

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

function renderBarCompact(pct, resetsAt, windowMs, width = 8) {
  const filled = Math.round((pct / 100) * width);
  let marker = -1;
  if (resetsAt && windowMs) {
    const elapsed = windowMs - (new Date(resetsAt).getTime() - Date.now());
    marker = Math.max(0, Math.min(width - 1, Math.round((elapsed / windowMs) * width)));
  }
  let b = '';
  for (let i = 0; i < width; i++) {
    if (i === marker) b += '|';
    else if (i < filled) b += '█';
    else b += '░';
  }
  if (marker === width - 1) b += '|';
  return b;
}

function writeStatuslineCache(usage) {
  const ORANGE = '\x1b[38;5;208m';
  const RED = '\x1b[31m';
  const RESET = '\x1b[0m';
  let out = '';
  if (usage?.five_hour) {
    const { utilization: pct, resets_at } = usage.five_hour;
    const color = pct >= 80 ? RED : ORANGE;
    const bar = renderBarCompact(pct, resets_at, 5 * 3600 * 1000);
    out += `${color}session:${bar} ${Math.round(pct)}%${RESET}`;
  }
  if (usage?.seven_day) {
    const { utilization: pct, resets_at } = usage.seven_day;
    const color = pct >= 80 ? RED : ORANGE;
    const bar = renderBarCompact(pct, resets_at, 7 * 24 * 3600 * 1000);
    out += `  ${color}weekly:${bar} ${Math.round(pct)}%${RESET}`;
  }
  try {
    writeFileSync(STATUSLINE_CACHE_PATH, out);
  } catch {}
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
    writeStatuslineCache(usage);
    display(usage);
  } else {
    const cached = readCache();
    if (cached) {
      writeStatuslineCache(cached);
      display(cached);
    } else {
      console.error('claukit: could not fetch usage — check your sessionKey with `claukit setup`');
    }
  }
}

module.exports = { show };
