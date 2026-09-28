import { useDeferredValue, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { SUPPLIER_TEXT_FIELDS, type Supplier } from '../db/types';
import { navigate } from '../lib/router';
import { OwnerThumb } from '../components/Photos';
import { Icon } from '../components/Icon';

type Filter = 'all' | 'hot' | 'maybe' | 'follow';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hot', label: 'Hot' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'follow', label: 'Follow up' },
];

export function matchesSearch(s: Supplier, q: string): boolean {
  if (!q) return true;
  const hay = SUPPLIER_TEXT_FIELDS.map((f) => s[f]).join('\n').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term));
}

export const PRIORITY_BADGE: Record<string, string> = {
  hot: 'bg-red-600 text-white',
  maybe: 'bg-amber-400 text-amber-950',
  no: 'bg-slate-400 text-white dark:bg-slate-600',
};

export function SupplierList() {
  const suppliers = useLiveQuery(() => db.suppliers.orderBy('updated_at').reverse().toArray(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const q = useDeferredValue(query.trim());

  const visible = useMemo(
    () =>
      (suppliers ?? []).filter((s) => {
        if (filter === 'hot' && s.priority !== 'hot') return false;
        if (filter === 'maybe' && s.priority !== 'maybe') return false;
        if (filter === 'follow' && !s.follow_up) return false;
        return matchesSearch(s, q);
      }),
    [suppliers, filter, q],
  );

  return (
    <div className="space-y-3">
      <SearchBox value={query} onChange={setQuery} placeholder="Search suppliers, notes, prices…" />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`chip shrink-0 ${filter === f.id ? 'chip-active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {suppliers && suppliers.length === 0 && (
        <Empty
          title="No suppliers yet"
          body="Tap + to add one. Start with “Scan business card” — it fills the fields for you."
        />
      )}
      {suppliers && suppliers.length > 0 && visible.length === 0 && <Empty title="No matches" body="Try another search or filter." />}

      <ul className="space-y-2">
        {visible.map((s) => (
          <li key={s.id}>
            <button
              className="card flex w-full items-center gap-3 p-3 text-left"
              onClick={() => navigate({ name: 'supplier', id: s.id, isNew: false })}
            >
              <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                <OwnerThumb type="supplier" id={s.id} className="size-full" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate font-semibold ${s.company ? '' : 'text-slate-400 italic'}`}>
                    {s.company || 'No company name'}
                  </span>
                  {s.follow_up && <Icon name="flag" className="size-4 shrink-0 text-amber-500" />}
                </div>
                <div className="truncate text-sm text-slate-500 dark:text-slate-400">
                  {[s.person, s.role].filter(Boolean).join(' · ') || s.category || '—'}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  {s.priority && (
                    <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ${PRIORITY_BADGE[s.priority]}`}>
                      {s.priority}
                    </span>
                  )}
                  {s.booth && <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">Booth {s.booth}</span>}
                  {s.category && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200">{s.category}</span>}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="input pl-10"
        enterKeyHint="search"
      />
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  );
}
