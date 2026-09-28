import { useCallback, useEffect, useRef, useState } from 'react';
import { EXPO_CONFIG } from '../config/expo';
import { db } from '../db/schema';
import { blankSupplier, deleteOwner, discardIfEmpty, isSupplierEmpty, saveSupplier } from '../db/repo';
import type { Priority, Supplier } from '../db/types';
import { useAutosave } from '../hooks/useAutosave';
import { fillEmptyFields, PARSED_FIELDS } from '../lib/cardParser';
import { savePhotoFor } from '../lib/photos';
import { goBack } from '../lib/router';
import { scanCard } from '../lib/scanCard';
import { preloadOcr } from '../lib/ocr';
import { useConfirm } from '../components/ConfirmDialog';
import { ChipSelect, Field, FileButton, Segmented, TextArea, Toggle } from '../components/Controls';
import { Icon } from '../components/Icon';
import { PhotoSection } from '../components/Photos';
import { useToast } from '../components/Toast';
import { EditorHeader, NotFound } from './EditorChrome';

const PRIORITY_OPTIONS: { value: Priority; label: string; activeClass: string }[] = [
  { value: 'hot', label: '🔥 Hot', activeClass: 'bg-red-600 text-white shadow' },
  { value: 'maybe', label: 'Maybe', activeClass: 'bg-amber-400 text-amber-950 shadow' },
  { value: 'no', label: 'No', activeClass: 'bg-slate-500 text-white shadow' },
];

type ParsedField = (typeof PARSED_FIELDS)[number];

export function SupplierEditor({ id, isNew }: { id: string; isNew: boolean }) {
  const [form, setForm] = useState<Supplier | null | 'missing'>(null);
  const formRef = useRef<Supplier | null>(null);
  const existsInDb = useRef(false);
  const deleted = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [rawText, setRawText] = useState('');
  const [fromCard, setFromCard] = useState<Set<ParsedField>>(new Set());
  const toast = useToast();
  const confirm = useConfirm();

  const persist = useCallback(async (s: Supplier) => {
    if (deleted.current) return;
    await saveSupplier(s);
    existsInDb.current = true;
  }, []);
  const autosave = useAutosave(persist);

  useEffect(() => {
    let cancelled = false;
    void db.suppliers.get(id).then((s) => {
      if (cancelled) return;
      existsInDb.current = !!s;
      const value = s ?? (isNew ? blankSupplier(id) : null);
      formRef.current = value;
      setForm(value ?? 'missing');
    });
    if (isNew) preloadOcr();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  // Leaving an untouched new entry shouldn't litter the list.
  useEffect(
    () => () => {
      void autosave.flush().then(() => (deleted.current ? undefined : discardIfEmpty('supplier', id)));
    },
    [autosave.flush, id],
  );

  const update = (patch: Partial<Supplier>) => {
    const cur = formRef.current;
    if (!cur) return;
    const next = { ...cur, ...patch };
    formRef.current = next;
    setForm(next);
    autosave.schedule(next);
    const touched = Object.keys(patch) as ParsedField[];
    if (touched.some((k) => fromCard.has(k))) {
      setFromCard((s) => new Set([...s].filter((k) => !touched.includes(k))));
    }
  };

  const ensureSaved = async () => {
    await autosave.flush();
    if (!existsInDb.current && formRef.current) await persist(formRef.current);
  };

  const addPhotos = async (files: File[]) => {
    setPhotoBusy(true);
    try {
      for (const f of files) await savePhotoFor('supplier', id, f);
      toast(files.length === 1 ? 'Photo saved' : `${files.length} photos saved`, { tone: 'success', ms: 2000 });
    } catch (err) {
      toast((err as Error).message || 'Could not save photo', { tone: 'error' });
    } finally {
      setPhotoBusy(false);
    }
  };

  const onScan = async ([file]: File[]) => {
    setScanning(true);
    try {
      await ensureSaved();
      // The photo is stored before OCR so the card is never lost, even if OCR fails.
      const photo = await savePhotoFor('supplier', id, file);
      const result = await scanCard(photo.blob);
      setRawText(result.rawText);
      const cur = formRef.current;
      if (!cur) return;
      const { patch, filled } = fillEmptyFields(cur, result.parsed);
      if (filled.length) update(patch);
      setFromCard(new Set(filled));
      const via = result.engine === 'claude' ? ' (Claude)' : '';
      const fallback = result.fallbackReason ? ` Used on-device OCR (${result.fallbackReason}).` : '';
      toast(
        filled.length
          ? `Filled ${filled.length} field${filled.length === 1 ? '' : 's'}${via}, check them.${fallback}`
          : `Card saved, but no new fields found.${fallback} Copy from the raw text below.`,
        { tone: filled.length ? 'success' : 'info', ms: 5000 },
      );
    } catch (err) {
      console.error(err);
      toast('Card photo saved, but text reading failed. Type the details in.', { tone: 'error', ms: 6000 });
    } finally {
      setScanning(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete this supplier?',
      message: 'Its photos will be deleted too. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    deleted.current = true;
    await deleteOwner('supplier', id);
    toast('Supplier deleted');
    goBack({ name: 'suppliers' });
  };

  if (form === 'missing') return <NotFound what="supplier" back={{ name: 'suppliers' }} />;
  if (!form) return null;

  const companyMissing = !form.company.trim() && !isSupplierEmpty(form);
  const cardHint = (f: ParsedField) => (fromCard.has(f) ? '↑ From card — check it' : undefined);

  return (
    <div className="flex min-h-full flex-col">
      <EditorHeader
        title={form.company || 'New supplier'}
        saveState={autosave.state}
        onBack={() => goBack({ name: 'suppliers' })}
        onDelete={onDelete}
      />
      <div className="mx-auto w-full max-w-xl space-y-5 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        <FileButton
          className="btn-primary w-full text-base"
          capture="environment"
          onFiles={onScan}
          disabled={scanning}
        >
          <Icon name="scan" className="size-6" />
          {scanning ? 'Reading card…' : 'Scan business card'}
        </FileButton>
        {scanning && (
          <div className="h-1 overflow-hidden rounded bg-slate-200 dark:bg-slate-800" aria-hidden>
            <div className="h-full w-1/3 animate-[scan_1.2s_ease-in-out_infinite] rounded bg-sky-500" />
          </div>
        )}
        {rawText && (
          <details className="card p-3">
            <summary className="min-h-11 cursor-pointer content-center font-medium">Raw card text</summary>
            <pre className="mt-2 text-sm break-words whitespace-pre-wrap select-text">{rawText}</pre>
            <button
              className="btn-secondary mt-2"
              onClick={() => navigator.clipboard?.writeText(rawText).then(() => toast('Copied', { ms: 1500 }))}
            >
              <Icon name="copy" className="size-5" /> Copy all
            </button>
          </details>
        )}

        <Field
          label="Company *"
          value={form.company}
          onChange={(e) => update({ company: e.target.value })}
          autoCapitalize="words"
          error={companyMissing ? 'Company is required' : undefined}
          hint={cardHint('company')}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Person" value={form.person} onChange={(e) => update({ person: e.target.value })} autoCapitalize="words" hint={cardHint('person')} />
          <Field label="Role" value={form.role} onChange={(e) => update({ role: e.target.value })} hint={cardHint('role')} />
        </div>
        <Field label="Phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => update({ phone: e.target.value })} hint={cardHint('phone')} />
        <Field
          label="Email"
          type="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          value={form.email}
          onChange={(e) => update({ email: e.target.value })}
          hint={cardHint('email')}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Website"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            value={form.website}
            onChange={(e) => update({ website: e.target.value })}
            hint={cardHint('website')}
          />
          <Field label="Booth" value={form.booth} onChange={(e) => update({ booth: e.target.value })} autoCapitalize="characters" />
        </div>

        <Segmented label="Priority" value={form.priority} options={PRIORITY_OPTIONS} onChange={(priority) => update({ priority })} />
        <Toggle label="Follow up" checked={form.follow_up} onChange={(follow_up) => update({ follow_up })} />
        <ChipSelect label="Category" value={form.category} options={EXPO_CONFIG.categories} onChange={(category) => update({ category })} />

        <TextArea
          label="Pricing / MOQ / lead time"
          value={form.price_notes}
          onChange={(e) => update({ price_notes: e.target.value })}
          rows={3}
          placeholder="e.g. $42/unit @ 500 MOQ, 3 weeks lead"
        />
        <TextArea label="Notes" value={form.notes} onChange={(e) => update({ notes: e.target.value })} rows={6} />

        <PhotoSection ownerType="supplier" ownerId={id} beforeAdd={ensureSaved} onAdd={addPhotos} busy={photoBusy} />
      </div>
    </div>
  );
}
