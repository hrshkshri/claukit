#!/usr/bin/env node
// build.mjs — esbuild driver for Claude Counter
// Usage: node build.mjs          (production)
//        node build.mjs --watch  (dev watch mode)

import * as esbuild from 'esbuild';
import { argv } from 'process';

const watch = argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: 'browser',
  target: ['firefox142'],
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

const entryPoints = [
  { in: 'src/main.ts',        out: 'dist/content' },
  { in: 'src/bridge/host.ts', out: 'dist/bridge'  },
];

if (watch) {
  const ctx = await esbuild.context({
    ...shared,
    entryPoints,
    outdir: '.',          // outdir unused — naming controlled by entry out keys
    outExtension: { '.js': '.js' },
    write: true,
    entryNames: '[dir]/[name]',
  });
  await ctx.watch();
  console.log('[esbuild] watching…');
} else {
  await esbuild.build({
    ...shared,
    entryPoints,
    outdir: '.',
    outExtension: { '.js': '.js' },
    write: true,
    entryNames: '[dir]/[name]',
  });
}
