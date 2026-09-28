import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

type Confirm = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Confirm>(async () => false);

export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const confirm = useCallback<Confirm>((o) => {
    resolver.current?.(false);
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (opts && !d.open) d.showModal();
    if (!opts && d.open) d.close();
  }, [opts]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          close(false);
        }}
        className="m-auto w-[min(92vw,24rem)] rounded-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 dark:bg-slate-800 dark:text-slate-100"
      >
        {opts && (
          <div className="p-5">
            <h2 className="text-lg font-semibold">{opts.title}</h2>
            {opts.message && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{opts.message}</p>}
            <div className="mt-5 flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => close(false)}>
                Cancel
              </button>
              <button
                className={`flex-1 ${opts.destructive ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
                autoFocus
              >
                {opts.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
