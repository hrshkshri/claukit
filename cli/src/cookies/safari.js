'use strict';
const { readFileSync, existsSync } = require('fs');
const os = require('os');
const path = require('path');

const SAFARI_COOKIES = path.join(os.homedir(), 'Library/Cookies/Cookies.binarycookies');

// Safari stores cookies in a proprietary binary format.
// Format: magic(4) | numPages(4 BE) | pageSizes[](4 BE each) | pages[]
// Each page: pageMagic(4 LE) | numCookies(4 LE) | cookieOffsets[](4 LE each) | cookieRecords[]
// Each cookie record: size(4) | flags(4) | ?(4) | domainOff(4) | nameOff(4) | pathOff(4) | valueOff(4) | commentOff(4) | expiry(8 LE double) | created(8 LE double) | strings...
function parseBinaryCookies(buf) {
  if (buf.length < 8 || buf.slice(0, 4).toString() !== 'cook') return null;

  const numPages = buf.readUInt32BE(4);
  const pageSizes = [];
  for (let i = 0; i < numPages; i++) {
    pageSizes.push(buf.readUInt32BE(8 + i * 4));
  }

  const cookies = {};
  let offset = 8 + numPages * 4;

  for (let p = 0; p < numPages; p++) {
    const pageStart = offset;
    const pageSize = pageSizes[p];
    offset += pageSize;

    if (buf.readUInt32BE(pageStart) !== 0x00000100) continue;

    const numCookies = buf.readUInt32LE(pageStart + 4);
    for (let c = 0; c < numCookies; c++) {
      const cookieOffset = buf.readUInt32LE(pageStart + 8 + c * 4);
      const base = pageStart + cookieOffset;
      try {
        const domainOff = buf.readUInt32LE(base + 16);
        const nameOff = buf.readUInt32LE(base + 20);
        const valueOff = buf.readUInt32LE(base + 28);

        const readStr = (off) => {
          const start = base + off;
          let end = start;
          while (end < buf.length && buf[end] !== 0) end++;
          return buf.slice(start, end).toString('utf8');
        };

        const domain = readStr(domainOff);
        if (!domain.includes('claude.ai')) continue;

        const name = readStr(nameOff);
        if (name !== 'sessionKey' && name !== 'lastActiveOrg') continue;

        cookies[name] = readStr(valueOff);
      } catch {}
    }
  }

  return cookies.sessionKey ? cookies : null;
}

function extractSafari() {
  if (!existsSync(SAFARI_COOKIES)) return null;
  try {
    const result = parseBinaryCookies(readFileSync(SAFARI_COOKIES));
    return result ? { browser: 'Safari', ...result } : null;
  } catch {
    return null;
  }
}

module.exports = { extractSafari };
