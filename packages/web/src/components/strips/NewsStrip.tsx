/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsDigest } from '../../hooks/useNewsDigest.js';
import { formatRelativeTime } from '../../lib/format-time.js';
import { Skeleton } from '../layout/Skeleton.js';
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

const MAX_ITEMS = 10;

export function NewsStrip() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useNewsDigest(cityId);
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const items = data?.items ?? [];

  const hasActiveCategory = activeCategory === 'all' || items.some((item) => item.category === activeCategory);
  const resolvedCategory = hasActiveCategory ? activeCategory : 'all';

  const filteredItems = resolvedCategory === 'all'
    ? items.slice(0, MAX_ITEMS)
    : items.filter((item) => item.category === resolvedCategory).slice(0, MAX_ITEMS);

  const availableCategories = ALL_CATEGORIES.filter(
    (cat) => cat === 'all' || items.some((item) => item.category === cat),
  );

  return (
    <section className="border-b border-gray-200 dark:border-gray-800 px-4 py-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {t('panel.news.title')}
      </h2>

      {isLoading ? (
        <Skeleton lines={6} />
      ) : (
        <>
          <div role="tablist" className="flex gap-1 overflow-x-auto pb-2 mb-3">
            {availableCategories.map((cat) => (
              <button
                key={cat}
                role="tab"
                aria-selected={resolvedCategory === cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-2.5 py-1 text-xs rounded-full transition-colors ${
                  resolvedCategory === cat
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {cat === 'all' ? t('panel.news.all') : t(`category.${cat}`, cat)}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <p className="text-sm text-gray-400 py-2 text-center">{t('panel.news.empty')}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredItems.map((item) => (
                <CompactNewsItem key={item.id} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function CompactNewsItem({ item }: { item: NewsItem }) {
  const { t } = useTranslation();
  const colorClass = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.local;

  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block group">
        <span className="text-sm text-gray-900 dark:text-gray-100 group-hover:text-[var(--accent)] transition-colors line-clamp-1">
          {item.title}
        </span>
      </a>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        <span>{item.sourceName}</span>
        {item.tier === 1 && (
          <span className="px-1 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            T1
          </span>
        )}
        <span className={`px-1.5 py-0.5 rounded text-[10px] ${colorClass}`}>
          {t(`category.${item.category}`, item.category)}
        </span>
        <span className="ml-auto">{formatRelativeTime(item.publishedAt)}</span>
      </div>
    </li>
  );
}
