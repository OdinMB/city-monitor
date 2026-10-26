import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  // useSyncExternalStore is the React 18+ idiomatic way to subscribe to
  // external browser APIs. It handles SSR (getServerSnapshot), avoids
  // tearing, and is simpler than useEffect + useState.
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', callback);
      return () => mql.removeEventListener('change', callback);
    },
    () => window.matchMedia(query).matches,
    () => false, // server snapshot (SSR fallback)
  );
}

export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 640px)');
}

/**
 * True when no input on the device can hover: phones, and tablets with no
 * mouse or trackpad attached. Uses `any-hover` rather than the primary
 * `hover`/`pointer` features because an iPad keeps reporting its touchscreen
 * as the primary input even with a trackpad keyboard attached, while the
 * `any-` features follow the attached pointer. A keyboard on its own is not
 * visible to any media query.
 */
export function useIsTouchOnly(): boolean {
  return useMediaQuery('(any-hover: none)');
}
