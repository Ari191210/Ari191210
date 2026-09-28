import { useSyncExternalStore } from 'react';

/**
 * Minimal hash router. Hash URLs work on any static host (GitHub Pages included) with no
 * rewrite rules, and survive the service worker's navigation fallback.
 */
export type Route =
  | { name: 'suppliers' }
  | { name: 'notes' }
  | { name: 'photos' }
  | { name: 'settings' }
  | { name: 'supplier'; id: string; isNew: boolean }
  | { name: 'note'; id: string; isNew: boolean };

export type TabName = 'suppliers' | 'notes' | 'photos';

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [section, id] = path.split('/');
  const isNew = new URLSearchParams(query).has('new');
  switch (section) {
    case 'notes':
      return { name: 'notes' };
    case 'photos':
      return { name: 'photos' };
    case 'settings':
      return { name: 'settings' };
    case 'supplier':
      if (id) return { name: 'supplier', id, isNew };
      break;
    case 'note':
      if (id) return { name: 'note', id, isNew };
      break;
  }
  return { name: 'suppliers' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'supplier':
    case 'note':
      return `#/${route.name}/${route.id}${route.isNew ? '?new' : ''}`;
    default:
      return `#/${route.name}`;
  }
}

// Whether the current history entry was pushed by the app (so history.back() stays in the app).
let pushedInApp = false;

export function navigate(route: Route, { replace = false } = {}): void {
  const href = hrefFor(route);
  if (replace) {
    history.replaceState(history.state, '', href);
  } else {
    history.pushState({ inApp: true }, '', href);
    pushedInApp = true;
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Go back if we navigated here inside the app, otherwise replace with the fallback route. */
export function goBack(fallback: Route): void {
  if (pushedInApp && history.state?.inApp) history.back();
  else navigate(fallback, { replace: true });
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  window.addEventListener('popstate', cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('popstate', cb);
  };
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parseHash(hash);
}
