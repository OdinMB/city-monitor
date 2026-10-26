import type { ReactNode } from 'react';

/**
 * Isolates a phone number or a numeric range as left-to-right text. In an
 * Arabic (right-to-left) layout the bidi algorithm would otherwise reorder its
 * digit groups ("030 390 63-90" shown as "63-90 390 030"). React counterpart
 * of `ltr()` in `map/popups.ts`.
 */
export function Ltr({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}
