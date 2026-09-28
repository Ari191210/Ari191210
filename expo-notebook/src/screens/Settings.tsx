import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { EXPO_CONFIG } from '../config/expo';
import { db } from '../db/schema';
import { deleteMeta, getMeta, setMeta } from '../db/repo';
import { useBackupStatus, useExportBackup } from '../hooks/useBackup';
import { deliverFile, importBackup, suppliersToCsv } from '../lib/backup';
import { formatBytes, isIos, isStandalone, requestPersistence, storageEstimate, timeAgo } from '../lib/storage';
import { goBack } from '../lib/router';
import { FileButton, Toggle } from '../components/Controls';
import { useConfirm } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

export function Settings() {
  const toast = useToast();
  const confirm = useConfirm();
  const { lastBackupAt, pending } = useBackupStatus();
  const exporter = useExportBackup();
  const persisted = useLiveQuery(() => getMeta<boolean>('persistGranted'), []);
  const counts = useLiveQuery(
    async () => ({ s: await db.suppliers.count(), n: await db.notes.count(), p: await db.photos.count() }),
    [],
  );
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    void storageEstimate().then(setEstimate);
  }, [counts]);

  const onImport = async ([file]: File[]) => {
    const ok = await confirm({
      title: 'Import this backup?',
      message: 'Entries are merged by ID. Where both exist, the most recently edited version wins. Nothing is deleted.',
      confirmLabel: 'Import',
    });
    if (!ok) return;
    setImporting(true);
    try {
      const s = await importBackup(file);
      toast(`Imported: ${s.added} new, ${s.updated} updated, ${s.skipped} unchanged, ${s.photosAdded} photos`, {
        tone: 'success',
        ms: 7000,
      });
    } catch (err) {
      toast((err as Error).message, { tone: 'error', ms: 7000 });
    } finally {
      setImporting(false);
    }
  };

  const exportCsv = async () => {
    const suppliers = await db.suppliers.orderBy('created_at').toArray();
    const blob = new Blob([suppliersToCsv(suppliers)], { type: 'text/csv' });
    await deliverFile(blob, `suppliers-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const pct = estimate && estimate.quota ? Math.min(100, (estimate.usage / estimate.quota) * 100) : 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-slate-200 bg-slate-50/90 px-1 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <button className="icon-btn" onClick={() => goBack({ name: 'suppliers' })} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1 className="flex-1 text-lg font-semibold">Settings & backup</h1>
      </header>

      <div className="mx-auto w-full max-w-xl space-y-6 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <section className="card space-y-3 p-4">
          <h2 className="section-title">
            <Icon name="download" className="size-5" /> Backup
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Everything lives only on this phone. Export regularly and send the .zip to yourself (Files, AirDrop,
            WhatsApp).
          </p>
          <p className="text-sm">
            Last backup: <strong>{lastBackupAt ? timeAgo(lastBackupAt) : 'never'}</strong>
            {pending > 0 && <span className="text-amber-700 dark:text-amber-400"> · {pending} changes since</span>}
          </p>
          {!exporter.ready ? (
            <button className="btn-primary w-full" onClick={exporter.prepare} disabled={exporter.busy}>
              <Icon name="download" className="size-5" />
              {exporter.busy ? 'Building backup…' : 'Export everything (.zip)'}
            </button>
          ) : (
            <div className="space-y-2 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
              <p className="text-sm">
                Ready: <strong>{exporter.ready.filename}</strong> ({formatBytes(exporter.ready.blob.size)})
              </p>
              <div className="flex gap-2">
                <button className="btn-secondary flex-1" onClick={exporter.cancel}>
                  Cancel
                </button>
                <button className="btn-primary flex-1" onClick={exporter.deliver}>
                  <Icon name="share" className="size-5" /> Share / Save
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={exportCsv}>
              Suppliers CSV
            </button>
            <FileButton className="btn-secondary" accept=".zip,application/zip" onFiles={onImport} disabled={importing}>
              <Icon name="upload" className="size-5" /> {importing ? 'Importing…' : 'Import backup'}
            </FileButton>
          </div>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="section-title">
            <Icon name="shield" className="size-5" /> Storage
          </h2>
          <p className="text-sm">
            {counts ? `${counts.s} suppliers · ${counts.n} notes · ${counts.p} photos` : '…'}
          </p>
          {estimate && (
            <div>
              <div className="h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                <div className="h-full bg-sky-500" style={{ width: `${Math.max(1, pct)}%` }} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {formatBytes(estimate.usage)} used of ~{formatBytes(estimate.quota)} available
              </p>
            </div>
          )}
          <p className="text-sm">
            Persistent storage:{' '}
            {persisted ? (
              <strong className="text-emerald-700 dark:text-emerald-400">granted ✓</strong>
            ) : (
              <strong className="text-amber-700 dark:text-amber-400">not granted</strong>
            )}
          </p>
          {!persisted && (
            <>
              <p className="text-xs text-slate-500">
                {isIos()
                  ? 'On iPhone, installing to the Home Screen is what protects your data from being cleared.'
                  : 'Browsers grant this more readily once the app is installed or used often.'}
              </p>
              <button
                className="btn-secondary w-full"
                onClick={async () => {
                  const ok = await requestPersistence();
                  await setMeta('persistGranted', ok);
                  toast(ok ? 'Persistent storage granted' : 'Browser declined — install the app and back up often', {
                    tone: ok ? 'success' : 'info',
                  });
                }}
              >
                Request persistent storage
              </button>
            </>
          )}
          {!isStandalone() && <InstallHelp />}
        </section>

        <BetterScanning />

        <p className="text-center text-xs text-slate-500">
          {EXPO_CONFIG.appName} · {EXPO_CONFIG.expoName} · v{__APP_VERSION__} · all data stays on this device
        </p>
      </div>
    </div>
  );
}

export function InstallHelp() {
  return (
    <div className="rounded-xl bg-sky-50 p-3 text-sm dark:bg-sky-950/40">
      <p className="font-semibold">Install to Home Screen</p>
      {isIos() ? (
        <p>
          In Safari tap <strong>Share</strong> (square with arrow) → <strong>Add to Home Screen</strong>. Then open it
          from the icon.
        </p>
      ) : (
        <p>
          In Chrome tap <strong>⋮</strong> → <strong>Install app</strong> (or “Add to Home screen”).
        </p>
      )}
    </div>
  );
}

function BetterScanning() {
  const toast = useToast();
  const confirm = useConfirm();
  const enabled = useLiveQuery(() => getMeta<boolean>('betterScanning'), []);
  const savedKey = useLiveQuery(async () => (await getMeta<string>('anthropicApiKey')) ?? '', []);
  const [draft, setDraft] = useState('');

  const hasKey = !!savedKey;
  return (
    <section className="card space-y-3 p-4">
      <h2 className="section-title">
        <Icon name="sparkle" className="size-5" /> Better scanning (optional)
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Sends card photos to Claude for more accurate extraction when online. Falls back to on-device OCR when offline
        or on error. Only the card image is sent — nothing else leaves the phone.
      </p>
      <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        ⚠ Your API key is stored unencrypted on this device only. Anyone with access to this unlocked phone could read
        it. Use a key with a low spending limit.
      </p>
      {hasKey ? (
        <>
          <p className="text-sm">
            Key saved: <code>••••{savedKey.slice(-4)}</code>
          </p>
          <Toggle label="Use Claude for card scans" checked={!!enabled} onChange={(v) => setMeta('betterScanning', v)} />
          <button
            className="btn-secondary w-full text-red-600"
            onClick={async () => {
              if (await confirm({ title: 'Remove API key?', confirmLabel: 'Remove', destructive: true })) {
                await deleteMeta('anthropicApiKey');
                await setMeta('betterScanning', false);
              }
            }}
          >
            Remove key
          </button>
        </>
      ) : (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const key = draft.trim();
            if (!/^sk-ant-/.test(key)) {
              toast('That doesn’t look like an Anthropic API key (sk-ant-…)', { tone: 'error' });
              return;
            }
            await setMeta('anthropicApiKey', key);
            await setMeta('betterScanning', true);
            setDraft('');
            toast('Key saved on this device', { tone: 'success' });
          }}
        >
          <input
            className="input"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Paste Anthropic API key (sk-ant-…)"
            aria-label="Anthropic API key"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn-primary w-full" disabled={!draft.trim()}>
            Save key
          </button>
        </form>
      )}
    </section>
  );
}
