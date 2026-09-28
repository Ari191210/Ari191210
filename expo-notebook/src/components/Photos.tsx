import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { deletePhoto, photosFor } from '../db/repo';
import type { OwnerType, Photo } from '../db/types';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { useConfirm } from './ConfirmDialog';
import { FileButton } from './Controls';
import { Icon } from './Icon';

export function Thumb({ blob, alt, className = '' }: { blob?: Blob; alt: string; className?: string }) {
  const url = useObjectUrl(blob);
  if (!url) return <div className={`bg-slate-200 dark:bg-slate-800 ${className}`} />;
  return <img src={url} alt={alt} className={`object-cover ${className}`} draggable={false} />;
}

/** First photo of an entry, for list rows. */
export function OwnerThumb({ type, id, className }: { type: OwnerType; id: string; className?: string }) {
  const photo = useLiveQuery(
    () => db.photos.where('[owner_type+owner_id]').equals([type, id]).first(),
    [type, id],
  );
  if (!photo) return null;
  return <Thumb blob={photo.thumb_blob} alt="" className={className} />;
}

/** Loads the photo record only once its tile scrolls near the viewport. */
export function LazyPhotoTile({ id, onOpen }: { id: string; onOpen: (p: Photo) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const photo = useLiveQuery(() => (visible ? db.photos.get(id) : undefined), [visible, id]);
  return (
    <button
      ref={ref}
      className="aspect-square overflow-hidden bg-slate-200 dark:bg-slate-800"
      onClick={() => photo && onOpen(photo)}
      aria-label="Open photo's entry"
    >
      {photo && <Thumb blob={photo.thumb_blob} alt="" className="size-full" />}
    </button>
  );
}

export function PhotoViewer({ photo, onClose, onDelete }: { photo: Photo; onClose: () => void; onDelete?: () => void }) {
  const url = useObjectUrl(photo.blob);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Photo">
      <div className="flex items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <button className="icon-btn text-white" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
        {onDelete && (
          <button className="icon-btn text-red-400" onClick={onDelete} aria-label="Delete photo">
            <Icon name="trash" />
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center pb-[env(safe-area-inset-bottom)]">
        {url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />}
      </div>
    </div>
  );
}

export function PhotoSection({
  ownerType,
  ownerId,
  beforeAdd,
  onAdd,
  busy,
}: {
  ownerType: OwnerType;
  ownerId: string;
  /** Ensures the owner record exists before photos reference it. */
  beforeAdd: () => Promise<void>;
  onAdd: (files: File[]) => Promise<void>;
  busy?: boolean;
}) {
  const photos = useLiveQuery(() => photosFor(ownerType, ownerId), [ownerType, ownerId]) ?? [];
  const [viewing, setViewing] = useState<Photo | null>(null);
  const confirm = useConfirm();

  const add = async (files: File[]) => {
    await beforeAdd();
    await onAdd(files);
  };

  return (
    <section aria-label="Photos">
      <div className="field-label">Photos {photos.length > 0 && `(${photos.length})`}</div>
      {photos.length > 0 && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {photos.map((p) => (
            <button key={p.id} className="size-24 shrink-0 overflow-hidden rounded-xl" onClick={() => setViewing(p)}>
              <Thumb blob={p.thumb_blob} alt="" className="size-full" />
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <FileButton className="btn-secondary" capture="environment" onFiles={add} disabled={busy}>
          <Icon name="camera" className="size-5" /> Take product photo
        </FileButton>
        <FileButton className="btn-secondary" multiple onFiles={add} disabled={busy}>
          <Icon name="image" className="size-5" /> Add photos
        </FileButton>
      </div>
      {viewing && (
        <PhotoViewer
          photo={viewing}
          onClose={() => setViewing(null)}
          onDelete={async () => {
            if (await confirm({ title: 'Delete this photo?', confirmLabel: 'Delete', destructive: true })) {
              await deletePhoto(viewing.id);
              setViewing(null);
            }
          }}
        />
      )}
    </section>
  );
}
