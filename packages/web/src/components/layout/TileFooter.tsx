import type { ReactNode } from 'react';

/**
 * Consistent footer area at the bottom of a tile's content.
 * Full-width divider (matches header style but slimmer) with muted text.
 *
 * Rendered inside the Tile's `p-4 flex-col` content area, so `-mx-4 px-4`
 * makes the border span edge-to-edge while keeping text inset.
 */
export function TileFooter({ children, stale }: { children: ReactNode; stale?: boolean }) {
  return (
    <div className="mt-auto pt-2 -mx-4 -mb-4">
      <div className={`px-4 py-1 border-t border-border-subtle flex items-center justify-center text-[11px] ${stale ? 'text-amber-500 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>
        {children}
      </div>
    </div>
  );
}
