import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Tone = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

type ShowToast = (message: string, opts?: { tone?: Tone; action?: ToastItem['action']; ms?: number }) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((t) => t.id !== id)), []);

  const show = useCallback<ShowToast>(
    (message, { tone = 'info', action, ms = 4000 } = {}) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-2), { id, message, tone, action }]);
      if (ms > 0) setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.tone === 'error'
                ? 'bg-red-600 text-white'
                : t.tone === 'success'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-white dark:bg-slate-700'
            }`}
          >
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                className="min-h-11 rounded-lg px-3 font-semibold underline"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="min-h-11 min-w-11 opacity-80" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
