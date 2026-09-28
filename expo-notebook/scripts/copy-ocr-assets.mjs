// Copies Tesseract worker, WASM cores and English traineddata into public/ocr so they
// are served from our own origin and precached by the service worker (no CDN at runtime).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'ocr');

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // LSTM-only cores: SIMD (all current iOS/Android browsers) + plain fallback.
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  // best_int = the LSTM model tesseract.js uses by default; smaller and faster than "best".
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
];

if (!existsSync(join(nm, 'tesseract.js'))) {
  console.warn('[copy-ocr-assets] node_modules not ready, skipping');
  process.exit(0);
}

mkdirSync(out, { recursive: true });
for (const [src, dest] of files) {
  const from = join(nm, src);
  if (!existsSync(from)) {
    console.error(`[copy-ocr-assets] missing ${src} — run npm install`);
    process.exit(1);
  }
  copyFileSync(from, join(out, dest));
}
console.log(`[copy-ocr-assets] copied ${files.length} files to public/ocr`);
