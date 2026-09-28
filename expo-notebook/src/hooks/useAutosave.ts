import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * Debounced autosave. Pending changes are flushed on unmount, when the page is hidden
 * (app switch / lock screen) and on pagehide, so nothing typed is lost.
 */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, delay = 300) {
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [state, setState] = useState<SaveState>('idle');

  const flush = useCallback((): Promise<unknown> => {
    clearTimeout(timer.current);
    const job = pending.current;
    if (!job) return chain.current;
    pending.current = null;
    setState('saving');
    // Serialise writes so an older value can never land after a newer one.
    chain.current = chain.current
      .then(() => saveRef.current(job.value))
      .then(
        () => setState(pending.current ? 'pending' : 'saved'),
        (err) => {
          console.error('Autosave failed', err);
          setState('error');
        },
      );
    return chain.current;
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      setState('pending');
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      void flush();
    };
  }, [flush]);

  return { schedule, flush, state };
}
