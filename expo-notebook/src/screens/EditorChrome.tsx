import type { SaveState } from '../hooks/useAutosave';
import { goBack, type Route } from '../lib/router';
import { Icon } from '../components/Icon';

const SAVE_LABEL: Record<SaveState, string> = {
  idle: '',
  pending: 'Saving…',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed!',
};

export function EditorHeader({
  title,
  saveState,
  onBack,
  onDelete,
}: {
  title: string;
  saveState: SaveState;
  onBack: () => void;
  onDelete: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-slate-200 bg-slate-50/90 px-1 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <button className="icon-btn" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
      <span
        className={`text-xs ${saveState === 'error' ? 'font-bold text-red-600' : 'text-slate-500'}`}
        role="status"
        aria-live="polite"
      >
        {SAVE_LABEL[saveState]}
      </span>
      <button className="icon-btn text-red-600 dark:text-red-400" onClick={onDelete} aria-label="Delete">
        <Icon name="trash" />
      </button>
    </header>
  );
}

export function NotFound({ what, back }: { what: string; back: Route }) {
  return (
    <div className="p-6 text-center">
      <p className="font-semibold">This {what} no longer exists.</p>
      <button className="btn-secondary mt-4" onClick={() => goBack(back)}>
        Go back
      </button>
    </div>
  );
}
