import { getMeta } from '../db/repo';
import { parseCard, type ParsedCard } from './cardParser';
import { ClaudeScanError, scanWithClaude } from './claudeScan';
import { recognizeCard } from './ocr';

export interface ScanOutcome {
  parsed: ParsedCard;
  rawText: string;
  engine: 'claude' | 'tesseract';
  /** Set when Claude was configured but we fell back to on-device OCR. */
  fallbackReason?: string;
}

export async function scanCard(image: Blob): Promise<ScanOutcome> {
  const [enabled, key] = await Promise.all([getMeta<boolean>('betterScanning'), getMeta<string>('anthropicApiKey')]);
  let fallbackReason: string | undefined;
  if (enabled && key) {
    if (!navigator.onLine) {
      fallbackReason = 'offline';
    } else {
      try {
        const parsed = await scanWithClaude(image, key);
        const rawText = Object.values(parsed).filter(Boolean).join('\n');
        return { parsed, rawText, engine: 'claude' };
      } catch (err) {
        fallbackReason = err instanceof ClaudeScanError ? err.message : 'error';
      }
    }
  }
  const ocr = await recognizeCard(image);
  return { parsed: parseCard(ocr.lines), rawText: ocr.text, engine: 'tesseract', fallbackReason };
}
