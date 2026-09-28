import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { EXPO_CONFIG } from './config/expo';
import { getMeta, setMeta } from './db/repo';
import { uuid } from './lib/id';
import { navigate, useRoute, type Route, type TabName } from './lib/router';
import { ensurePersistence, isStandalone, timeAgo } from './lib/storage';
import { useBackupStatus } from './hooks/useBackup';
import { FileButton } from './components/Controls';
import { Icon, type IconName } from './components/Icon';
import { useToast } from './components/Toast';
import { SupplierList } from './screens/SupplierList';
import { SupplierEditor } from './screens/SupplierEditor';
import { NoteEditor, NoteList, snapToNote } from './screens/Notes';
import { PhotoGrid } from './screens/PhotoGrid';
import { InstallHelp, Settings } from './screens/Settings';

const TABS: { name: TabName; label: string; icon: IconName }[] = [
  { name: 'suppliers', label: 'Suppliers', icon: 'users' },
  { name: 'notes', label: 'Notes', icon: 'note' },
  { name: 'photos', label: 'Photos', icon: 'grid' },
];

export function App() {
  const route = useRoute();
  const toast = useToast();

  useEffect(() => {
    void ensurePersistence();
  }, []);

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError: (e) => console.error('SW registration failed', e),
  });
  useEffect(() => {
    if (needRefresh) {
      toast('A new version is ready.', { action: { label: 'Reload', onClick: () => void updateServiceWorker(true) }, ms: 0 });
    }
  }, [needRefresh, toast, updateServiceWorker]);

  // Remount editors per id so their local state never leaks between entries.
  if (route.name === 'supplier') return <SupplierEditor key={route.id} id={route.id} isNew={route.isNew} />;
  if (route.name === 'note') return <NoteEditor key={route.id} id={route.id} isNew={route.isNew} />;
  if (route.name === 'settings') return <Settings />;
  return <TabShell tab={route.name} />;
}

function TabShell({ tab }: { tab: TabName }) {
  const toast = useToast();
  const [snapping, setSnapping] = useState(false);

  const onSnap = async ([file]: File[]) => {
    setSnapping(true);
    try {
      const id = await snapToNote(file);
      navigate({ name: 'note', id, isNew: true });
    } catch (err) {
      toast((err as Error).message || 'Could not save photo', { tone: 'error' });
    } finally {
      setSnapping(false);
    }
  };

  const primary: Route =
    tab === 'notes' ? { name: 'note', id: uuid(), isNew: true } : { name: 'supplier', id: uuid(), isNew: true };

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <Banners />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+10rem)]">
        {tab === 'suppliers' && <SupplierList />}
        {tab === 'notes' && <NoteList />}
        {tab === 'photos' && <PhotoGrid />}
      </main>

      {/* Primary actions bottom-right for one-handed use */}
      <div className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-30 flex flex-col items-end gap-3">
        <FileButton
          className="fab-secondary"
          capture="environment"
          onFiles={onSnap}
          disabled={snapping}
        >
          <Icon name="camera" className="size-6" />
          <span className="sr-only">Snap a photo note</span>
          <span aria-hidden className="text-sm font-semibold">{snapping ? '…' : 'Snap'}</span>
        </FileButton>
        {tab !== 'photos' && (
          <button
            className="fab-primary"
            onClick={() => navigate(primary)}
            aria-label={tab === 'notes' ? 'New note' : 'New supplier'}
          >
            <Icon name="plus" className="size-8" />
          </button>
        )}
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
        aria-label="Sections"
      >
        <div className="mx-auto grid max-w-xl grid-cols-3">
          {TABS.map((t) => (
            <button
              key={t.name}
              onClick={() => navigate({ name: t.name }, { replace: true })}
              aria-current={tab === t.name ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                tab === t.name ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'
              }`}
            >
              <Icon name={t.icon} className="size-6" />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function AppHeader() {
  const { lastBackupAt, pending, loaded } = useBackupStatus();
  const nudge = pending > EXPO_CONFIG.backupNudgeThreshold;
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-xl items-center gap-2 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg leading-tight font-bold">{EXPO_CONFIG.appName}</h1>
          <button
            className={`text-xs ${nudge ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-slate-500'}`}
            onClick={() => navigate({ name: 'settings' })}
          >
            {loaded && (lastBackupAt ? `Last backup: ${timeAgo(lastBackupAt)}` : 'Not backed up yet')}
          </button>
        </div>
        <button className="icon-btn" onClick={() => navigate({ name: 'settings' })} aria-label="Settings and backup">
          <Icon name="settings" />
        </button>
      </div>
    </header>
  );
}

function Banners() {
  const { pending } = useBackupStatus();
  const dismissedInstall = useLiveQuery(async () => (await getMeta<boolean>('installBannerDismissed')) ?? false, []);
  const showInstall = dismissedInstall === false && !isStandalone();
  const nudge = pending > EXPO_CONFIG.backupNudgeThreshold;
  if (!showInstall && !nudge) return null;
  return (
    <div className="mx-auto w-full max-w-xl space-y-2 px-4 pt-3">
      {nudge && (
        <button
          className="flex w-full items-center gap-3 rounded-xl bg-amber-100 p-3 text-left text-sm text-amber-950 dark:bg-amber-900/50 dark:text-amber-100"
          onClick={() => navigate({ name: 'settings' })}
        >
          <Icon name="download" className="size-5 shrink-0" />
          <span className="flex-1">
            <strong>{pending} changes</strong> aren’t backed up. This phone holds the only copy — export now.
          </span>
        </button>
      )}
      {showInstall && (
        <div className="relative">
          <InstallHelp />
          <p className="px-3 pb-2 text-xs text-slate-500">
            iPhone can clear data for sites that aren’t installed. Installing also makes it work offline like an app.
          </p>
          <button
            className="icon-btn absolute top-0 right-0"
            aria-label="Dismiss"
            onClick={() => setMeta('installBannerDismissed', true)}
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
