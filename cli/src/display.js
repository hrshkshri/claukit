'use strict';

const BAR_WIDTH = 22;
const ORANGE = '\x1b[38;5;208m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function renderBar(pct, markerPct) {
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const marker = markerPct != null ? Math.round((markerPct / 100) * BAR_WIDTH) : -1;
  let b = '';
  for (let i = 0; i < BAR_WIDTH; i++) {
    if (i === marker) b += '|';
    else if (i < filled) b += '█';
    else b += '░';
  }
  return b;
}

function timeLeft(resetsAt) {
  if (!resetsAt) return '';
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (ms <= 0) return '';
  const totalMins = Math.round(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  return `${h}h ${m}m left`;
}

function markerPct(windowMs, resetsAt) {
  if (!resetsAt || !windowMs) return null;
  const resetTime = new Date(resetsAt).getTime();
  const elapsed = windowMs - (resetTime - Date.now());
  return Math.max(0, Math.min(100, (elapsed / windowMs) * 100));
}

function display(usage) {
  if (!usage) return;

  console.log(`${BOLD}${ORANGE}CLAUKIT${RESET}`);

  if (usage.five_hour) {
    const { utilization: pct, resets_at } = usage.five_hour;
    const label = `session ${pct.toFixed(1)}%`;
    const time = resets_at ? ` · ${timeLeft(resets_at)}` : '';
    const mPct = markerPct(5 * 60 * 60 * 1000, resets_at);
    const warn = pct >= 90 ? RED : '';
    const b = renderBar(pct, mPct);
    console.log(`  ${warn}${label}${RESET}${DIM}${time}${RESET}  ${b}`);
  }

  if (usage.seven_day) {
    const { utilization: pct, resets_at } = usage.seven_day;
    const label = `weekly  ${pct.toFixed(1)}%`;
    const time = resets_at ? ` · ${timeLeft(resets_at)}` : '';
    const mPct = markerPct(7 * 24 * 60 * 60 * 1000, resets_at);
    const warn = pct >= 90 ? RED : '';
    const b = renderBar(pct, mPct);
    console.log(`  ${warn}${label}${RESET}${DIM}${time}${RESET}   ${b}`);
  }

  console.log();
}

module.exports = { display };
