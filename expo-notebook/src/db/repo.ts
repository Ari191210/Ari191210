import { db as defaultDb, type ExpoDB } from './schema';
import type { MetaEntry, Note, OwnerType, Photo, Supplier } from './types';
import { uuid } from '../lib/id';

export function blankSupplier(id = uuid(), now = Date.now()): Supplier {
  return {
    id,
    company: '',
    person: '',
    role: '',
    phone: '',
    email: '',
    website: '',
    booth: '',
    category: '',
    priority: null,
    follow_up: false,
    price_notes: '',
    notes: '',
    created_at: now,
    updated_at: now,
  };
}

export function blankNote(id = uuid(), now = Date.now()): Note {
  return { id, title: '', text: '', created_at: now, updated_at: now };
}

export function isSupplierEmpty(s: Supplier): boolean {
  return (
    !s.company.trim() &&
    !s.person.trim() &&
    !s.role.trim() &&
    !s.phone.trim() &&
    !s.email.trim() &&
    !s.website.trim() &&
    !s.booth.trim() &&
    !s.category &&
    !s.priority &&
    !s.follow_up &&
    !s.price_notes.trim() &&
    !s.notes.trim()
  );
}

export function isNoteEmpty(n: Note): boolean {
  return !n.title.trim() && !n.text.trim();
}

export async function saveSupplier(s: Supplier, database: ExpoDB = defaultDb): Promise<Supplier> {
  const row = { ...s, updated_at: Date.now() };
  await database.suppliers.put(row);
  return row;
}

export async function saveNote(n: Note, database: ExpoDB = defaultDb): Promise<Note> {
  const row = { ...n, updated_at: Date.now() };
  await database.notes.put(row);
  return row;
}

export async function deleteOwner(
  type: OwnerType,
  id: string,
  database: ExpoDB = defaultDb,
): Promise<void> {
  const table = type === 'supplier' ? database.suppliers : database.notes;
  await database.transaction('rw', table, database.photos, async () => {
    await database.photos.where('[owner_type+owner_id]').equals([type, id]).delete();
    await table.delete(id);
  });
}

/** Removes an entry that was opened but never filled in (and has no photos). */
export async function discardIfEmpty(
  type: OwnerType,
  id: string,
  database: ExpoDB = defaultDb,
): Promise<boolean> {
  const photoCount = await database.photos.where('[owner_type+owner_id]').equals([type, id]).count();
  if (photoCount > 0) return false;
  if (type === 'supplier') {
    const s = await database.suppliers.get(id);
    if (s && isSupplierEmpty(s)) {
      await database.suppliers.delete(id);
      return true;
    }
  } else {
    const n = await database.notes.get(id);
    if (n && isNoteEmpty(n)) {
      await database.notes.delete(id);
      return true;
    }
  }
  return false;
}

export async function addPhoto(photo: Photo, database: ExpoDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.photos, database.suppliers, database.notes, async () => {
    await database.photos.add(photo);
    // Touch the owner so it sorts as recently changed and counts toward the backup nudge.
    const table = photo.owner_type === 'supplier' ? database.suppliers : database.notes;
    await table.update(photo.owner_id, { updated_at: Date.now() });
  });
}

export async function deletePhoto(id: string, database: ExpoDB = defaultDb): Promise<void> {
  await database.photos.delete(id);
}

export function photosFor(type: OwnerType, id: string, database: ExpoDB = defaultDb) {
  return database.photos.where('[owner_type+owner_id]').equals([type, id]).sortBy('created_at');
}

// ---------------------------------------------------------------------------
// Meta key-value store

export type MetaKey =
  | 'lastBackupAt'
  | 'persistGranted'
  | 'installBannerDismissed'
  | 'anthropicApiKey'
  | 'betterScanning';

export async function getMeta<T>(key: MetaKey, database: ExpoDB = defaultDb): Promise<T | undefined> {
  const row = (await database.meta.get(key)) as MetaEntry<T> | undefined;
  return row?.value;
}

export async function setMeta<T>(key: MetaKey, value: T, database: ExpoDB = defaultDb): Promise<void> {
  await database.meta.put({ key, value });
}

export async function deleteMeta(key: MetaKey, database: ExpoDB = defaultDb): Promise<void> {
  await database.meta.delete(key);
}

/** Suppliers/notes changed plus photos added since the last backup. */
export async function changesSinceBackup(database: ExpoDB = defaultDb): Promise<number> {
  const since = (await getMeta<number>('lastBackupAt', database)) ?? 0;
  const [s, n, p] = await Promise.all([
    database.suppliers.where('updated_at').above(since).count(),
    database.notes.where('updated_at').above(since).count(),
    database.photos.where('created_at').above(since).count(),
  ]);
  return s + n + p;
}
