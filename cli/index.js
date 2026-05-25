#!/usr/bin/env node
'use strict';

const cmd = process.argv[2];

if (cmd === 'setup') {
  const { setup } = require('./src/setup');
  setup().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
} else if (cmd === 'show' || cmd == null) {
  const { show } = require('./src/show');
  show().catch(() => {}); // silent on error — this runs on every session start
} else {
  console.log('usage: claukit setup | claukit show');
  process.exit(1);
}
