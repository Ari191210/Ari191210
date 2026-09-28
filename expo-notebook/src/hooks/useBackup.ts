import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { changesSinceBackup, getMeta, setMeta } from '../db/repo';
import { buildBackup, deliverFile } from '../lib/backup';
import { useToast } from '../components/Toast';

export function useBackupStatus() {
  const lastBackupAt = useLiveQuery(() => getMeta<number>('lastBackupAt'), []);
  // Re-runs whenever suppliers/notes/photos/meta change.
  const pending = useLiveQuery(async () => {
    await Promise.all([db.suppliers.count(), db.notes.count(), db.photos.count()]);
    return changesSinceBackup();
  }, []);
  return { lastBackupAt, pending: pending ?? 0, loaded: pending !== undefined };
}

export function useExportBackup() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<{ blob: Blob; filename: string; exportedAt: number } | null>(null);

  // Two taps: building the zip can outlast the browser's "user gesture" window,
  // and navigator.share() requires one. So build first, then the user taps Share/Save.
  const prepare = useCallback(async () => {
    setBusy(true);
    try {
      const { blob, filename, data } = await buildBackup();
      setReady({ blob, filename, exportedAt: data.exported_at });
    } catch (err) {
      console.error(err);
      toast('Backup failed. Free up storage and try again.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const deliver = useCallback(async () => {
    if (!ready) return;
    const ok = await deliverFile(ready.blob, ready.filename);
    if (ok) {
      await setMeta('lastBackupAt', ready.exportedAt);
      toast('Backup handed off. Make sure it landed in Files / WhatsApp.', { tone: 'success', ms: 6000 });
      setReady(null);
    }
  }, [ready, toast]);

  return { busy, ready, prepare, deliver, cancel: () => setReady(null) };
}
