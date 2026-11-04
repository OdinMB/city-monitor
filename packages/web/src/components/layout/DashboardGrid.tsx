import type { ReactNode } from 'react';

/** One section's tiles. Each tile takes its reveal stagger from its place (TileSlotContext). */
export function DashboardGrid({ id, children }: { id?: string; children: ReactNode }) {
  return (
    // Dense placement fills a hole a city's missing tile would leave with a
    // later tile that fits. A grid without holes is placed as without it.
    <div id={id} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 grid-flow-row-dense gap-4">
      {children}
    </div>
  );
}
