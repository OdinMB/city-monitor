import { useState, useCallback, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsDigest } from '../../hooks/useNewsDigest.js';
import { useTabKeys } from '../../hooks/useTabKeys.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { formatRelativeTime } from '../../lib/format-time.js';
import { safeUrl } from '../../lib/safe-url.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import type { NewsItem } from '../../lib/api.js';

const ALL_CATEGORIES = ['all', 'politics', 'economy', 'culture', 'local', 'transit', 'crime', 'sports'] as const;
const HIDDEN_CATEGORIES = new Set(['weather']);

const CATEGORY_ICONS: Record<string, string> = {
  all: '📰',
  politics: '🏛',
  economy: '€',
  culture: '🎭',
  local: '📍',
  transit: '🚇',
  crime: '🚨',
  sports: '⚽',
};

const CATEGORY_COLORS: Record<string, string> = {
  local: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  transit: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  politics: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  culture: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  crime: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  weather: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  economy: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  sports: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
};

/** Maps source name → local favicon filename (without extension) */
const FAVICON_SLUGS: Record<string, string> = {
  // Berlin
  rbb24: 'rbb24',
  Tagesspiegel: 'tagesspiegel',
  'Berliner Morgenpost': 'berliner-morgenpost',
  'BZ Berlin': 'bz-berlin',
  'Berlin.de News': 'berlin-de-news',
  'Berliner Zeitung': 'berliner-zeitung',
  'taz Berlin': 'taz-berlin',
  'RBB Polizei': 'berlin-de-news',
  Exberliner: 'exberliner',
  'Gründerszene Berlin': 'gruenderszene',
  // Hamburg
  'NDR Hamburg': 'ndr-hamburg',
  'Hamburger Abendblatt': 'hamburger-abendblatt',
  MOPO: 'mopo',
  'hamburg.de News': 'hamburg-de-news',
};

const MAX_ITEMS = 15;

const FRESH_MAX_AGE = 15 * 60 * 1000; // 15 min (cron every 10 min)

export function NewsStrip() {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useNewsDigest(cityId);
  const { t } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const visibleItems = useMemo(
    () => items.filter((item) => !HIDDEN_CATEGORIES.has(item.category)),
    [items],
  );

  const hasActiveCategory = activeCategory === 'all' || visibleItems.some((item) => item.category === activeCategory);
  const resolvedCategory = hasActiveCategory ? activeCategory : 'all';

  const filteredItems = useMemo(
    () => resolvedCategory === 'all'
      ? visibleItems.slice(0, MAX_ITEMS)
      : visibleItems.filter((item) => item.category === resolvedCategory).slice(0, MAX_ITEMS),
    [visibleItems, resolvedCategory],
  );

  const availableCategories = useMemo(
    () => ALL_CATEGORIES.filter(
      (cat) => cat === 'all' || items.some((item) => item.category === cat && !HIDDEN_CATEGORIES.has(cat)),
    ),
    [items],
  );


  const activeIndex = (availableCategories as readonly string[]).indexOf(resolvedCategory);
  const selectByIndex = useCallback((i: number) => setActiveCategory(availableCategories[i] as string), [availableCategories]);
  const { setTabRef, onKeyDown } = useTabKeys(availableCategories.length, activeIndex, selectByIndex);

  if (isLoading) return <Skeleton lines={6} />;
  if (isError) return <StripErrorFallback domain="News" onRetry={refetch} />;

  return (
    <>
      <div role="tablist" className="flex gap-0.5 mb-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        {availableCategories.map((cat, i) => (
          <button
            key={cat}
            ref={setTabRef(i)}
            id={`news-tab-${cat}`}
            role="tab"
            aria-selected={resolvedCategory === cat}
            aria-controls="news-panel"
            tabIndex={resolvedCategory === cat ? 0 : -1}
            onClick={() => setActiveCategory(cat)}
            onKeyDown={onKeyDown}
            title={cat === 'all' ? t('panel.news.all') : t(`category.${cat}`, cat)}
            className={`flex-1 px-1.5 py-1 rounded-md text-[11px] font-medium text-center transition-colors ${
              resolvedCategory === cat
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {CATEGORY_ICONS[cat] ?? '📰'}
          </button>
        ))}
      </div>

      <div id="news-panel" role="tabpanel" aria-labelledby={`news-tab-${resolvedCategory}`} className="flex-1 min-h-0 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
        {filteredItems.length === 0 ? (
          <p className="text-sm text-gray-400 py-2 text-center">{t('panel.news.empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredItems.map((item) => (
              <CompactNewsItem key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </>
  );
}

const CompactNewsItem = memo(function CompactNewsItem({ item }: { item: NewsItem }) {
  const { t } = useTranslation();
  const colorClass = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.local;
  const slug = FAVICON_SLUGS[item.sourceName];
  const faviconUrl = slug ? `/favicons/${slug}.png` : null;

  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer" className="block group">
        <span className="text-sm text-gray-900 dark:text-gray-100 group-hover:text-[var(--accent)] transition-colors line-clamp-2 sm:line-clamp-1">
          {item.title}
        </span>
      </a>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        {faviconUrl && (
          <img src={faviconUrl} alt="" width={14} height={14} className="inline-block" loading="lazy" />
        )}
        <span>{item.sourceName}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${colorClass}`}>
          {t(`category.${item.category}`, item.category)}
        </span>
        {item.importance != null && item.importance > 0 && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400">{Math.round(item.importance * 100)}%</span>
        )}
        {item.location && (
          <span className="text-blue-500 dark:text-blue-400" role="img" aria-label={t('panel.news.locationPin')}>📍</span>
        )}
        <span className="ml-auto">{formatRelativeTime(item.publishedAt)}</span>
      </div>
    </li>
  );
});
