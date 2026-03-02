/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../layout/Panel.js';
import { Skeleton } from '../layout/Skeleton.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsDigest } from '../../hooks/useNewsDigest.js';
import { useNewsSummary } from '../../hooks/useNewsSummary.js';
import { formatRelativeTime } from '../../lib/format-time.js';
import type { NewsItem } from '../../lib/api.js';

const ALL_CATEGORIES = ['all', 'local', 'transit', 'politics', 'culture', 'crime', 'weather', 'economy', 'sports'] as const;

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

const MAX_FEATURED = 3;
const MAX_ITEMS = 20;

function getFaviconUrl(sourceName: string, feedUrl?: string): string | null {
  // Map known source names to domains
  const domainMap: Record<string, string> = {
    rbb24: 'www.rbb24.de',
    Tagesspiegel: 'www.tagesspiegel.de',
    'Berliner Morgenpost': 'www.morgenpost.de',
    'BZ Berlin': 'www.bz-berlin.de',
    'Berlin.de News': 'www.berlin.de',
    'Berliner Zeitung': 'www.berliner-zeitung.de',
    'taz Berlin': 'taz.de',
    'RBB Polizei': 'www.berlin.de',
    Exberliner: 'www.exberliner.com',
  };
  const domain = domainMap[sourceName];
  if (domain) return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  if (feedUrl) {
    try {
      const hostname = new URL(feedUrl).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`;
    } catch { /* ignore */ }
  }
  return null;
}

export function NewsBriefingPanel() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useNewsDigest(cityId);
  const { data: summary } = useNewsSummary(cityId);
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const items = data?.items ?? [];

  const hasActiveCategory = activeCategory === 'all' || items.some((item) => item.category === activeCategory);
  const resolvedCategory = hasActiveCategory ? activeCategory : 'all';

  const filteredItems = resolvedCategory === 'all'
    ? items.slice(0, MAX_ITEMS)
    : items.filter((item) => item.category === resolvedCategory).slice(0, MAX_ITEMS);

  // Split into featured (tier 1) and standard items
  const featured = resolvedCategory === 'all'
    ? filteredItems.filter((item) => item.tier === 1).slice(0, MAX_FEATURED)
    : [];
  const featuredIds = new Set(featured.map((f) => f.id));
  const standard = filteredItems.filter((item) => !featuredIds.has(item.id));

  // Count items per category for pills
  const categoryCounts: Record<string, number> = {};
  for (const item of items) {
    categoryCounts[item.category] = (categoryCounts[item.category] ?? 0) + 1;
  }

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const summaryFresh = summary?.generatedAt
    ? Date.now() - new Date(summary.generatedAt).getTime() < 15 * 60_000
    : false;

  if (isLoading) {
    return <Panel title={t('panel.news.title')}><Skeleton lines={8} /></Panel>;
  }

  if (isError) {
    return (
      <Panel title={t('panel.news.title')}>
        <div className="text-center py-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Failed to load news</p>
          <button
            onClick={() => refetch()}
            className="text-sm px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            {t('panel.news.retry')}
          </button>
        </div>
      </Panel>
    );
  }

  const availableCategories = ALL_CATEGORIES.filter(
    (cat) => cat === 'all' || items.some((item) => item.category === cat),
  );

  return (
    <Panel title={t('panel.news.title')} lastUpdated={lastUpdated}>
      {/* AI Briefing */}
      {summary?.briefing && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm leading-relaxed text-gray-700 dark:text-gray-300 relative">
          {summaryFresh && (
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          )}
          {summary.briefing}
          {summary.generatedAt && (
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              {t('panel.news.generatedAgo', { time: formatRelativeTime(summary.generatedAt) })}
            </div>
          )}
        </div>
      )}

      {/* Category pills */}
      <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
        {availableCategories.map((cat) => {
          const count = cat === 'all' ? items.length : (categoryCounts[cat] ?? 0);
          return (
            <button
              key={cat}
              role="tab"
              aria-selected={resolvedCategory === cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs rounded-full transition-colors ${
                resolvedCategory === cat
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span>{cat === 'all' ? t('panel.news.all') : t(`category.${cat}`, cat)}</span>
              <span className={`text-[10px] ${
                resolvedCategory === cat
                  ? 'opacity-70'
                  : 'opacity-50'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filteredItems.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          {resolvedCategory !== 'all'
            ? t('panel.news.emptyCategory', { defaultValue: `No ${resolvedCategory} news right now` })
            : t('panel.news.empty')
          }
        </p>
      ) : (
        <>
          {/* Featured section (tier 1 items) */}
          {featured.length > 0 && (
            <div className="mb-4 space-y-2">
              {featured.map((item) => (
                <FeaturedNewsCard key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* Standard items */}
          {standard.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {standard.map((item) => (
                <NewsItemRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

function FeaturedNewsCard({ item }: { item: NewsItem }) {
  const { t } = useTranslation();
  const colorClass = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.local;
  const faviconUrl = getFaviconUrl(item.sourceName);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group"
    >
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-[var(--accent)] transition-colors line-clamp-2">
        {item.title}
      </span>
      {item.description && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
          {item.description}
        </p>
      )}
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
        {faviconUrl && (
          <img src={faviconUrl} alt="" width={14} height={14} className="inline-block" loading="lazy" />
        )}
        <span>{item.sourceName}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${colorClass}`}>
          {t(`category.${item.category}`, item.category)}
        </span>
        {item.location && (
          <span className="text-blue-500 dark:text-blue-400" title={item.location.label}>
            {'📍'}
          </span>
        )}
        <span className="ml-auto">{formatRelativeTime(item.publishedAt)}</span>
      </div>
    </a>
  );
}

function NewsItemRow({ item }: { item: NewsItem }) {
  const { t } = useTranslation();
  const colorClass = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.local;
  const faviconUrl = getFaviconUrl(item.sourceName);

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-[var(--accent)] transition-colors line-clamp-2">
          {item.title}
        </span>
      </a>
      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
        {faviconUrl && (
          <img src={faviconUrl} alt="" width={14} height={14} className="inline-block" loading="lazy" />
        )}
        <span>{item.sourceName}</span>
        {item.tier === 1 && (
          <span className="px-1 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            T1
          </span>
        )}
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${colorClass}`}>
          {t(`category.${item.category}`, item.category)}
        </span>
        {item.location && (
          <span className="text-blue-500 dark:text-blue-400" title={item.location.label}>
            {'📍'}
          </span>
        )}
        <span className="ml-auto">{formatRelativeTime(item.publishedAt)}</span>
      </div>
    </li>
  );
}
