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

/**
 * True for the phone layout (below `sm`, `useIsDesktop()` false, where the map
 * is a band in the scrolling page) on a device whose main pointer is a finger.
 * The main `pointer` rather than `any-hover`: a phone with a stylus that can
 * hover still reports its touchscreen as the main pointer. A narrow desktop
 * window has a fine pointer, and a phone held sideways is `sm` wide, so both
 * stay false.
 */
export function useIsTouchPhone(): boolean {
  const isDesktop = useIsDesktop();
  const coarsePointer = useMediaQuery('(pointer: coarse)');
  return !isDesktop && coarsePointer;
}
