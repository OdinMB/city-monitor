import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Consistent footer area at the bottom of a tile's content.
 * Full-width divider (matches header style but slimmer) with muted text.
 *
 * Rendered inside the Tile's `p-4 flex-col` content area, so `-mx-4 px-4`
 * makes the border span edge-to-edge while keeping text inset.
 *
 * Stale data is marked by a word as well as the amber colour, so the cue
 * doesn't rely on colour alone.
 */
export function TileFooter({ children, stale }: { children: ReactNode; stale?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="mt-auto pt-2 -mx-4 -mb-4">
      <div className={`px-4 py-1 border-t border-border-subtle flex items-center justify-center text-[11px] ${stale ? 'text-amber-700 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>
        {children}
        {stale && <span className="ms-1">· {t('stale.outdated')}</span>}
      </div>
    </div>
  );
}
