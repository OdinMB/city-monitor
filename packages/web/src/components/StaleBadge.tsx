import { useTranslation } from 'react-i18next';

/**
 * Muted text pill shown in the tile header (via titleBadge) when data is stale.
 * Only renders when `isStale` is true and `agoText` is non-empty.
 */
export function StaleBadge({ isStale, agoText }: { isStale: boolean; agoText: string }) {
  const { t } = useTranslation();
  if (!isStale || !agoText) return null;

  return (
    <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
      · {t('stale.updated', { time: agoText })}
    </span>
  );
}
