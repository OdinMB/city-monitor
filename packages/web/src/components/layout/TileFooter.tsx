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
    <div className="mt-auto -mx-4 px-4 pt-1.5 border-t border-gray-100 dark:border-gray-800">
      <p className={`text-[10px] text-center ${stale ? 'text-amber-500 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>
        {children}
      </p>
    </div>
  );
}
