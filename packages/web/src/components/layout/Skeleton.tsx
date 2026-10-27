import { useTranslation } from 'react-i18next';

/**
 * Loading placeholder for a tile. One status per tile, so a screen reader
 * reaching a tile that is still loading hears a short "Loading" instead of
 * nothing; the shimmer bars are hidden from it.
 */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  const { t } = useTranslation();
  return (
    <div data-testid="skeleton" role="status">
      <span className="sr-only">{t('tile.loading')}</span>
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className="h-4 rounded skeleton-shimmer"
            style={{
              width: i === lines - 1 ? '60%' : '100%',
              animationDelay: `${i * 50}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
