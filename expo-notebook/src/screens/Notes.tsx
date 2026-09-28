import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { blankNote, deleteOwner, discardIfEmpty, saveNote } from '../db/repo';
import type { Note } from '../db/types';
import { useAutosave } from '../hooks/useAutosave';
import { savePhotoFor } from '../lib/photos';
import { goBack, navigate } from '../lib/router';
import { useConfirm } from '../components/ConfirmDialog';
import { OwnerThumb, PhotoSection } from '../components/Photos';
import { useToast } from '../components/Toast';
import { EditorHeader, NotFound } from './EditorChrome';
import { Empty, SearchBox } from './SupplierList';

export function NoteList() {
  const notes = useLiveQuery(() => db.notes.orderBy('updated_at').reverse().toArray(), []);
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim().toLowerCase());
  const visible = useMemo(
    () =>
      (notes ?? []).filter((n) => {
        if (!q) return true;
        const hay = `${n.title}\n${n.text}`.toLowerCase();
        return q.split(/\s+/).every((t) => hay.includes(t));
      }),
    [notes, q],
  );

  return (
    <div className="space-y-3">
      <SearchBox value={query} onChange={setQuery} placeholder="Search notes…" />
      {notes && notes.length === 0 && (
        <Empty title="No notes yet" body="Tap + for a note, or the camera to Snap a photo first and title it later." />
      )}
      {notes && notes.length > 0 && visible.length === 0 && <Empty title="No matches" body="Try another search." />}
      <ul className="space-y-2">
        {visible.map((n) => (
          <li key={n.id}>
            <button
              className="card flex w-full items-center gap-3 p-3 text-left"
              onClick={() => navigate({ name: 'note', id: n.id, isNew: false })}
            >
              <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                <OwnerThumb type="note" id={n.id} className="size-full" />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`truncate font-semibold ${n.title ? '' : 'text-slate-400 italic'}`}>
                  {n.title || 'Untitled snap'}
                </div>
                <div className="truncate text-sm text-slate-500">{n.text || new Date(n.created_at).toLocaleString()}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NoteEditor({ id, isNew }: { id: string; isNew: boolean }) {
  const [form, setForm] = useState<Note | null | 'missing'>(null);
  const formRef = useRef<Note | null>(null);
  const existsInDb = useRef(false);
  const deleted = useRef(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const persist = useCallback(async (n: Note) => {
    if (deleted.current) return;
    await saveNote(n);
    existsInDb.current = true;
  }, []);
  const autosave = useAutosave(persist);

  useEffect(() => {
    let cancelled = false;
    void db.notes.get(id).then((n) => {
      if (cancelled) return;
      existsInDb.current = !!n;
      const value = n ?? (isNew ? blankNote(id) : null);
      formRef.current = value;
      setForm(value ?? 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  useEffect(
    () => () => {
      void autosave.flush().then(() => (deleted.current ? undefined : discardIfEmpty('note', id)));
    },
    [autosave.flush, id],
  );

  const update = (patch: Partial<Note>) => {
    const cur = formRef.current;
    if (!cur) return;
    const next = { ...cur, ...patch };
    formRef.current = next;
    setForm(next);
    autosave.schedule(next);
  };

  const ensureSaved = async () => {
    await autosave.flush();
    if (!existsInDb.current && formRef.current) await persist(formRef.current);
  };

  const addPhotos = async (files: File[]) => {
    setPhotoBusy(true);
    try {
      for (const f of files) await savePhotoFor('note', id, f);
    } catch (err) {
      toast((err as Error).message || 'Could not save photo', { tone: 'error' });
    } finally {
      setPhotoBusy(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete this note?',
      message: 'Its photos will be deleted too. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    deleted.current = true;
    await deleteOwner('note', id);
    toast('Note deleted');
    goBack({ name: 'notes' });
  };

  if (form === 'missing') return <NotFound what="note" back={{ name: 'notes' }} />;
  if (!form) return null;

  return (
    <div className="flex min-h-full flex-col">
      <EditorHeader
        title={form.title || 'Note'}
        saveState={autosave.state}
        onBack={() => goBack({ name: 'notes' })}
        onDelete={onDelete}
      />
      <div className="mx-auto w-full max-w-xl space-y-4 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        <input
          className="input text-lg font-semibold"
          placeholder="Title"
          aria-label="Title"
          value={form.title}
          onChange={(e) => update({ title: e.target.value })}
          autoFocus={isNew}
        />
        <PhotoSection ownerType="note" ownerId={id} beforeAdd={ensureSaved} onAdd={addPhotos} busy={photoBusy} />
        <textarea
          className="input min-h-64 resize-y py-3 leading-relaxed"
          placeholder="Write anything…"
          aria-label="Note text"
          value={form.text}
          onChange={(e) => update({ text: e.target.value })}
        />
      </div>
    </div>
  );
}

/** "Snap": photo first → becomes a note to title later. */
export async function snapToNote(file: File): Promise<string> {
  const note = blankNote();
  await saveNote(note);
  await savePhotoFor('note', note.id, file);
  return note.id;
}
