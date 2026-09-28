import JSZip from 'jszip';
import { db as defaultDb, type ExpoDB } from '../db/schema';
import type { Note, Photo, Supplier } from '../db/types';

export const BACKUP_FORMAT = 'expo-notebook-backup';
export const BACKUP_VERSION = 1;

interface PhotoMeta extends Omit<Photo, 'blob' | 'thumb_blob'> {
  file: string;
  thumb: string;
}

export interface BackupData {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: number;
  suppliers: Supplier[];
  notes: Note[];
  photos: PhotoMeta[];
}

const CSV_COLUMNS: (keyof Supplier)[] = [
  'company',
  'person',
  'role',
  'phone',
  'email',
  'website',
  'booth',
  'category',
  'priority',
  'follow_up',
  'price_notes',
  'notes',
  'created_at',
  'updated_at',
  'id',
];

function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  // Neutralise spreadsheet formula injection from scanned text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function suppliersToCsv(suppliers: Supplier[]): string {
  const rows = [CSV_COLUMNS.join(',')];
  for (const s of suppliers) {
    rows.push(
      CSV_COLUMNS.map((c) => {
        const v = s[c];
        if (c === 'created_at' || c === 'updated_at') return csvCell(new Date(v as number).toISOString());
        if (c === 'follow_up') return v ? 'yes' : '';
        return csvCell(v);
      }).join(','),
    );
  }
  // BOM so Excel opens UTF-8 correctly.
  return '﻿' + rows.join('\r\n') + '\r\n';
}

function safeName(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[^\w\s.-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 60) || 'untitled'
  );
}

export async function buildBackup(database: ExpoDB = defaultDb): Promise<{ blob: Blob; filename: string; data: BackupData }> {
  const [suppliers, notes, photos] = await Promise.all([
    database.suppliers.orderBy('created_at').toArray(),
    database.notes.orderBy('created_at').toArray(),
    database.photos.orderBy('created_at').toArray(),
  ]);
  const zip = new JSZip();
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const noteById = new Map(notes.map((n) => [n.id, n]));
  const used = new Map<string, number>();
  const photoMeta: PhotoMeta[] = [];

  for (const p of photos) {
    const base =
      p.owner_type === 'supplier'
        ? safeName(supplierById.get(p.owner_id)?.company || 'supplier')
        : `note_${safeName(noteById.get(p.owner_id)?.title || 'untitled')}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const file = `photos/${base}_${n}.jpg`;
    const thumb = `thumbs/${p.id}.jpg`;
    // JPEGs don't compress further; STORE keeps export fast on phones.
    zip.file(file, p.blob, { compression: 'STORE' });
    zip.file(thumb, p.thumb_blob, { compression: 'STORE' });
    const { blob: _b, thumb_blob: _t, ...meta } = p;
    photoMeta.push({ ...meta, file, thumb });
  }

  const data: BackupData = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: Date.now(),
    suppliers,
    notes,
    photos: photoMeta,
  };
  zip.file('data.json', JSON.stringify(data, null, 1));
  zip.file('suppliers.csv', suppliersToCsv(suppliers));

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE' });
  const stamp = new Date(data.exported_at).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return { blob, filename: `expo-notebook-backup-${stamp}.zip`, data };
}

export interface ImportStats {
  added: number;
  updated: number;
  skipped: number;
  photosAdded: number;
}

function isValidBackup(d: unknown): d is BackupData {
  const x = d as BackupData;
  return (
    !!x &&
    x.format === BACKUP_FORMAT &&
    typeof x.version === 'number' &&
    Array.isArray(x.suppliers) &&
    Array.isArray(x.notes) &&
    Array.isArray(x.photos)
  );
}

/** Merges a backup into the database by id; the record with the newer updated_at wins. */
export async function importBackup(file: Blob, database: ExpoDB = defaultDb): Promise<ImportStats> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a valid .zip backup.');
  }
  const json = zip.file('data.json');
  if (!json) throw new Error('Backup is missing data.json.');
  let data: unknown;
  try {
    data = JSON.parse(await json.async('string'));
  } catch {
    throw new Error('Backup data.json is corrupted.');
  }
  if (!isValidBackup(data)) throw new Error('Not an Expo Notebook backup.');
  if (data.version > BACKUP_VERSION) throw new Error('Backup was made by a newer app version. Update the app first.');

  // Read photo bytes before opening the DB transaction (IndexedDB transactions can't await other I/O).
  const existingPhotoIds = new Set(await database.photos.toCollection().primaryKeys());
  const newPhotos: Photo[] = [];
  for (const meta of data.photos) {
    if (existingPhotoIds.has(meta.id)) continue;
    const full = zip.file(meta.file);
    if (!full) continue;
    const thumbEntry = zip.file(meta.thumb);
    const blob = new Blob([await full.async('arraybuffer')], { type: 'image/jpeg' });
    const thumb_blob = thumbEntry ? new Blob([await thumbEntry.async('arraybuffer')], { type: 'image/jpeg' }) : blob;
    const { file: _f, thumb: _t, ...rest } = meta;
    newPhotos.push({ ...rest, blob, thumb_blob });
  }

  const stats: ImportStats = { added: 0, updated: 0, skipped: 0, photosAdded: newPhotos.length };
  await database.transaction('rw', database.suppliers, database.notes, database.photos, async () => {
    for (const [table, rows] of [
      [database.suppliers, data.suppliers],
      [database.notes, data.notes],
    ] as const) {
      const existing = await table.bulkGet(rows.map((r) => r.id));
      const toPut: (Supplier | Note)[] = [];
      rows.forEach((row, i) => {
        const cur = existing[i];
        if (!cur) {
          toPut.push(row);
          stats.added++;
        } else if ((row.updated_at ?? 0) > (cur.updated_at ?? 0)) {
          toPut.push(row);
          stats.updated++;
        } else {
          stats.skipped++;
        }
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (table as any).bulkPut(toPut);
    }
    await database.photos.bulkAdd(newPhotos);
  });
  return stats;
}

// ---------------------------------------------------------------------------
// Delivery: Web Share (AirDrop / Files / WhatsApp) with a download fallback

export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

/** Returns true if the file was handed off (shared or downloaded), false if the user cancelled. */
export async function deliverFile(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return false;
      // Some browsers claim support then fail (e.g. file too large) — fall through to download.
    }
  }
  downloadBlob(blob, filename);
  return true;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
