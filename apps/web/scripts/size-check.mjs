#!/usr/bin/env node
/**
 * Bundle budget gate (8_Phase.md §1.4 item 26 / §68): fails when any built JS
 * chunk exceeds its gzipped budget. The general budget is 200 KB; chunks
 * identified as lazy-loaded vendor bundles (maplibre — dynamic-imported on
 * /map and the details mini-map, never in the first-load path) get 400 KB.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 200);
const LAZY_BUDGET_KB = Number(process.env.LAZY_BUDGET_KB ?? 400);
const CHUNKS_DIR = join(process.cwd(), '.next', 'static', 'chunks');

if (!existsSync(CHUNKS_DIR)) {
  console.error('size-check: .next/static/chunks not found — run `next build` first');
  process.exit(1);
}

/** Markers for dynamic-import vendor bundles (loaded on demand, not first-load). */
const LAZY_MARKERS = ['maplibre'];

const files = readdirSync(CHUNKS_DIR).filter((f) => f.endsWith('.js'));
const oversized = [];
let checked = 0;

for (const file of files) {
  const raw = readFileSync(join(CHUNKS_DIR, file));
  const gzipped = gzipSync(raw).length;
  const kb = Math.round(gzipped / 1024);
  const isLazy = LAZY_MARKERS.some((marker) => raw.includes(marker));
  const budget = isLazy ? LAZY_BUDGET_KB : BUDGET_KB;
  checked++;
  if (kb > budget) {
    oversized.push(`${file}: ${kb} KB gzipped (budget ${budget} KB${isLazy ? ', lazy vendor' : ''})`);
  }
}

console.log(`size-check: ${checked} chunks, budgets ${BUDGET_KB} KB / ${LAZY_BUDGET_KB} KB (lazy vendor)`);
if (oversized.length > 0) {
  console.error('size-check: FAILED\n' + oversized.join('\n'));
  process.exit(1);
}
console.log('size-check: OK');
