import type { ReactNode } from 'react';

/** Columns of a section's grid from xl up, by its width (1–4); sm stays at two at most. */
const COLUMNS: Record<1 | 2 | 3 | 4, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
};

/**
 * One section's tiles, `columns` wide (default 4). Each tile takes its reveal
 * stagger from its place (TileSlotContext).
 */
export function DashboardGrid({ id, columns = 4, children }: { id?: string; columns?: 1 | 2 | 3 | 4; children: ReactNode }) {
  return (
    // Dense placement fills a hole a city's missing tile would leave with a
    // later tile that fits. A grid without holes is placed as without it.
    <div id={id} className={`grid ${COLUMNS[columns]} grid-flow-row-dense gap-4`}>
      {children}
    </div>
  );
}
