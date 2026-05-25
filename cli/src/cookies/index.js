'use strict';
const { extractChrome } = require('./chrome');
const { extractFirefox } = require('./firefox');
const { extractSafari } = require('./safari');

// Returns { browser, sessionKey?, lastActiveOrg? } — sessionKey may be absent
// if the session cookie isn't persisted to disk (in-memory session cookies).
function extractCookies() {
  for (const fn of [extractChrome, extractFirefox, extractSafari]) {
    try {
      const result = fn();
      if (result) return result;
    } catch {}
  }
  return null;
}

module.exports = { extractCookies };
