import Dexie, { type EntityTable, type Transaction } from 'dexie';
import type { MetaEntry, Note, Photo, Supplier } from './types';

export const DB_NAME = 'expo-notebook';

/**
 * Schema history. NEVER edit or remove a past version — only append a new one.
 * Dexie keeps existing rows when the schema changes; an `upgrade` callback transforms them in place.
 * Only list indexed fields here; other fields are stored without being declared.
 * (Booleans can't be indexed in IndexedDB, so follow_up is filtered in memory.)
 */
export const SCHEMA_V1 = {
  suppliers: 'id, company, created_at, updated_at, priority, category',
  notes: 'id, created_at, updated_at',
  photos: 'id, owner_id, [owner_type+owner_id], created_at',
} as const;

export const SCHEMA_V2 = {
  ...SCHEMA_V1,
  meta: 'key',
} as const;

/** v2: adds the meta key-value store and normalizes supplier rows written by v1. */
export async function upgradeToV2(tx: Transaction): Promise<void> {
  await tx
    .table('suppliers')
    .toCollection()
    .modify((s: Partial<Supplier>) => {
      for (const f of [
        'company',
        'person',
        'role',
        'phone',
        'email',
        'website',
        'booth',
        'category',
        'price_notes',
        'notes',
      ] as const) {
        if (typeof s[f] !== 'string') s[f] = '';
      }
      s.follow_up = Boolean(s.follow_up);
      if (s.priority !== 'hot' && s.priority !== 'maybe' && s.priority !== 'no') s.priority = null;
      s.updated_at ??= s.created_at ?? Date.now();
    });
}

export class ExpoDB extends Dexie {
  suppliers!: EntityTable<Supplier, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  photos!: EntityTable<Photo, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V2).upgrade(upgradeToV2);
  }
}

export const db = new ExpoDB();
