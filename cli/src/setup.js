'use strict';
const path = require('path');
const readline = require('readline');
const { extractCookies } = require('./cookies');
const { fetchOrgId } = require('./usage');
const { writeConfig } = require('./config');
const { installHook } = require('./hook');

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function resolveSession() {
  process.stdout.write('searching for claude.ai session in browsers...');
  const cookies = extractCookies();

  if (cookies?.sessionKey) {
    process.stdout.write(` found (${cookies.browser})\n`);
    return { sessionKey: cookies.sessionKey, orgId: cookies.lastActiveOrg ?? null, browser: cookies.browser };
  }

  // We might have lastActiveOrg (org ID) but no sessionKey — common when the
  // session cookie is in-memory only and not persisted to disk.
  const knownOrgId = cookies?.lastActiveOrg ?? null;
  process.stdout.write(knownOrgId ? ' found org id, need session key\n\n' : ' not found\n\n');

  console.log('your sessionKey cookie lives in browser memory (not persisted to disk).');
  console.log('grab it in 30 seconds:\n');
  console.log('  1. open claude.ai in your browser');
  console.log('  2. devtools: cmd+option+i  →  Application  →  Cookies  →  https://claude.ai');
  console.log('  3. find "sessionKey" and copy its value\n');

  const sessionKey = await prompt('paste sessionKey: ');
  if (!sessionKey) {
    console.error('no value entered — run setup again when ready');
    process.exit(1);
  }

  return { sessionKey, orgId: knownOrgId, browser: 'manual' };
}

async function setup() {
  console.log('claukit setup\n');

  const { sessionKey, orgId: knownOrgId, browser } = await resolveSession();

  let orgId = knownOrgId;
  if (!orgId) {
    process.stdout.write('fetching org id...');
    orgId = await fetchOrgId(sessionKey);
    if (!orgId) {
      process.stdout.write(' failed\n\n');
      console.log('auth failed. double-check the sessionKey value and try again.');
      process.exit(1);
    }
    process.stdout.write(' ok\n');
  }

  writeConfig({ sessionKey, orgId, browser, setupAt: new Date().toISOString() });
  process.stdout.write('config saved (~/.claukit/config.json)\n');

  const cliPath = path.resolve(__dirname, '..', 'index.js');
  const installed = installHook(cliPath);
  process.stdout.write(
    installed
      ? 'claude code hook installed (~/.claude/settings.json)\n'
      : 'claude code hook already present\n'
  );

  console.log('\ndone. start a new claude session to see your usage.');
}

module.exports = { setup };
