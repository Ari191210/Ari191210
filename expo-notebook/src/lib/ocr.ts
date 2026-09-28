import type { Worker } from 'tesseract.js';
import type { OcrLine } from './cardParser';

/** All OCR assets are served from our own origin (public/ocr) and precached by the service worker. */
function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}ocr/${path}`, location.href).href;
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const [{ createWorker, OEM, PSM }, { simd }] = await Promise.all([
        import('tesseract.js'),
        import('wasm-feature-detect'),
      ]);
      const core = (await simd()) ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js';
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: assetUrl('worker.min.js'),
        corePath: assetUrl(core),
        langPath: assetUrl(''),
        gzip: true,
        // Load the worker script from our origin so the service worker serves it offline.
        workerBlobURL: false,
      });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
      return worker;
    })().catch((err) => {
      workerPromise = null; // allow retry
      throw err;
    });
  }
  return workerPromise;
}

/** Warm up the OCR engine in the background so the first scan is fast. */
export function preloadOcr(): void {
  void getWorker().catch(() => {});
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
}

export async function recognizeCard(image: Blob): Promise<OcrResult> {
  const worker = await getWorker();
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const text = line.text.trim();
        if (text) lines.push({ text, height: line.bbox.y1 - line.bbox.y0 });
      }
    }
  }
  return { text: data.text, lines: lines.length ? lines : data.text.split('\n').map((text) => ({ text })) };
}
