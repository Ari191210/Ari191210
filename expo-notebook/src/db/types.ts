export type Priority = 'hot' | 'maybe' | 'no';
export type OwnerType = 'supplier' | 'note';

/** Timestamps are epoch milliseconds. */
export interface Supplier {
  id: string;
  company: string;
  person: string;
  role: string;
  phone: string;
  email: string;
  website: string;
  booth: string;
  category: string;
  priority: Priority | null;
  follow_up: boolean;
  price_notes: string;
  notes: string;
  created_at: number;
  updated_at: number;
}

export interface Note {
  id: string;
  title: string;
  text: string;
  created_at: number;
  updated_at: number;
}

export interface Photo {
  id: string;
  owner_type: OwnerType;
  owner_id: string;
  blob: Blob;
  thumb_blob: Blob;
  width: number;
  height: number;
  created_at: number;
}

export interface MetaEntry<T = unknown> {
  key: string;
  value: T;
}

export const SUPPLIER_TEXT_FIELDS = [
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
] as const satisfies readonly (keyof Supplier)[];

export type SupplierTextField = (typeof SUPPLIER_TEXT_FIELDS)[number];
