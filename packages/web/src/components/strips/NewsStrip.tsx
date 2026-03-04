import { useState, useCallback, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsDigest } from '../../hooks/useNewsDigest.js';
import { useTabKeys } from '../../hooks/useTabKeys.js';
import { formatRelativeTime } from '../../lib/format-time.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import type { NewsItem } from '../../lib/api.js';

const ALL_CATEGORIES = ['all', 'local', 'transit', 'politics', 'culture', 'crime', 'economy', 'sports'] as const;
const HIDDEN_CATEGORIES = new Set(['weather']);

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

const MAX_ITEMS = 10;
const COLLAPSED_ITEMS = 5;

export function NewsStrip({ expanded, onExpand }: { expanded: boolean; onExpand: () => void }) {
  const { id: cityId } = useCityConfig();
  const { data, isLoading, isError, refetch } = useNewsDigest(cityId);
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const items = data?.items ?? [];

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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      if (!HIDDEN_CATEGORIES.has(item.category)) {
        counts[item.category] = (counts[item.category] ?? 0) + 1;
      }
    }
    return counts;
  }, [items]);

  const activeIndex = (availableCategories as readonly string[]).indexOf(resolvedCategory);
  const selectByIndex = useCallback((i: number) => setActiveCategory(availableCategories[i] as string), [availableCategories]);
  const { setTabRef, onKeyDown } = useTabKeys(availableCategories.length, activeIndex, selectByIndex);

  if (isLoading) return <Skeleton lines={6} />;
  if (isError) return <StripErrorFallback domain="News" onRetry={refetch} />;

  const displayItems = expanded ? filteredItems : filteredItems.slice(0, COLLAPSED_ITEMS);
  const remaining = expanded ? 0 : filteredItems.length - displayItems.length;

  return (
    <>
      <div role="tablist" className="flex gap-1 overflow-x-auto pb-2 mb-3">
        {availableCategories.map((cat, i) => {
          const count = cat === 'all' ? visibleItems.length : (categoryCounts[cat] ?? 0);
          return (
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
              className={`shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs rounded-full transition-colors ${
                resolvedCategory === cat
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span>{cat === 'all' ? t('panel.news.all') : t(`category.${cat}`, cat)}</span>
              <span className="text-[10px] opacity-50">{count}</span>
            </button>
          );
        })}
      </div>

      <div id="news-panel" role="tabpanel" aria-labelledby={`news-tab-${resolvedCategory}`}>
        {displayItems.length === 0 ? (
          <p className="text-sm text-gray-400 py-2 text-center">{t('panel.news.empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {displayItems.map((item) => (
              <CompactNewsItem key={item.id} item={item} />
            ))}
          </ul>
        )}
        {remaining > 0 && (
          <button
            onClick={onExpand}
            className="w-full pt-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
          >
            {t('panel.news.showMore', { count: remaining })}
          </button>
        )}
      </div>
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
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block group">
        <span className="text-sm text-gray-900 dark:text-gray-100 group-hover:text-[var(--accent)] transition-colors line-clamp-1">
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
