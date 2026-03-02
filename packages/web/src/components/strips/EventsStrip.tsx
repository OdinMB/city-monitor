/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useEvents } from '../../hooks/useEvents.js';
import { Skeleton } from '../layout/Skeleton.js';
import type { CityEvent } from '../../lib/api.js';

const CATEGORY_ICONS: Record<string, string> = {
  music: '🎵',
  art: '🎨',
  theater: '🎭',
  food: '🍽',
  market: '🛍',
  sport: '⚽',
  community: '🤝',
  museum: '🏛',
  other: '📅',
};

const ALL_CATEGORIES = ['all', 'music', 'art', 'theater', 'food', 'market', 'sport', 'community', 'museum', 'other'] as const;

type SourceFilter = 'all' | 'kulturdaten' | 'ticketmaster' | 'gomus';

const SOURCE_FILTERS: { key: SourceFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'panel.events.all' },
  { key: 'kulturdaten', labelKey: 'panel.events.source.community' },
  { key: 'ticketmaster', labelKey: 'panel.events.source.tickets' },
  { key: 'gomus', labelKey: 'panel.events.source.museums' },
];

const MAX_VISIBLE = 25;

function formatEventTime(dateStr: string, lang: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
}

function formatEventDay(dateStr: string, lang: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch {
    return '';
  }
}

function EventCard({ event, lang, t }: { event: CityEvent; lang: string; t: (key: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!(event.venue || event.description || event.price || event.url);
  const time = formatEventTime(event.date, lang);
  const day = formatEventDay(event.date, lang);
  const showTime = time !== '00:00';

  return (
    <div
      className={`px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-xs ${hasDetail ? 'cursor-pointer' : ''}`}
      onClick={hasDetail ? () => setExpanded((v) => !v) : undefined}
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-1.5">
        <span className="shrink-0">
          {CATEGORY_ICONS[event.category] ?? '📅'}
        </span>
        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
          {event.title}
        </span>
        <span className="shrink-0 text-gray-400 ml-auto whitespace-nowrap">
          {day}{showTime ? ` · ${time}` : ''}
        </span>
        {event.free && (
          <span className="shrink-0 px-1 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
            {t('panel.events.free')}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700 space-y-1 text-[11px] text-gray-500 dark:text-gray-400">
          {event.venue && <div>{event.venue}</div>}
          {event.description && <div className="line-clamp-3">{event.description}</div>}
          {event.endDate && (
            <div>→ {formatEventDay(event.endDate, lang)} {formatEventTime(event.endDate, lang)}</div>
          )}
          {event.price && <div>{event.price}</div>}
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-blue-600 dark:text-blue-400 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {t('panel.events.moreInfo')} →
            </a>
          )}
        </div>
      )}

      {/* Expand indicator */}
      {hasDetail && (
        <div className="text-[10px] text-gray-400 mt-0.5 text-right">
          {expanded ? '▲' : '▼'}
        </div>
      )}
    </div>
  );
}

export function EventsStrip() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useEvents(cityId);
  const { t, i18n } = useTranslation();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const allEvents = data ?? [];

  // Determine which sources are present
  const presentSources = new Set(allEvents.map((e) => e.source));
  const showSourceFilter = presentSources.size >= 2;

  // Available source filters (only those with events)
  const activeSourceFilters = SOURCE_FILTERS.filter(
    (sf) => sf.key === 'all' || presentSources.has(sf.key),
  );

  // Filter by source first
  const resolvedSource = sourceFilter === 'all' || presentSources.has(sourceFilter)
    ? sourceFilter
    : 'all';
  const sourceFiltered = resolvedSource === 'all'
    ? allEvents
    : allEvents.filter((e) => e.source === resolvedSource);

  // Category counts scoped to active source filter
  const categoryCounts: Record<string, number> = {};
  for (const event of sourceFiltered) {
    categoryCounts[event.category] = (categoryCounts[event.category] ?? 0) + 1;
  }

  const availableCategories = ALL_CATEGORIES.filter(
    (cat) => cat === 'all' || (categoryCounts[cat] ?? 0) > 0,
  );

  const resolvedCategory = categoryFilter === 'all' || (categoryCounts[categoryFilter] ?? 0) > 0
    ? categoryFilter
    : 'all';

  const filtered = resolvedCategory === 'all'
    ? sourceFiltered
    : sourceFiltered.filter((e) => e.category === resolvedCategory);

  const events = filtered.slice(0, MAX_VISIBLE);

  const pillActive = 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900';
  const pillInactive = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700';

  return (
    <>
      {/* Source filter */}
      {showSourceFilter && (
        <div role="tablist" className="flex gap-1 overflow-x-auto pb-1 mb-1">
          {activeSourceFilters.map((sf) => {
            const count = sf.key === 'all'
              ? allEvents.length
              : allEvents.filter((e) => e.source === sf.key).length;
            return (
              <button
                key={sf.key}
                role="tab"
                aria-selected={resolvedSource === sf.key}
                onClick={() => { setSourceFilter(sf.key); setCategoryFilter('all'); }}
                className={`shrink-0 flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors ${
                  resolvedSource === sf.key ? pillActive : pillInactive
                }`}
              >
                <span>{t(sf.labelKey)}</span>
                <span className="text-[10px] opacity-50">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Category filter */}
      {availableCategories.length > 2 && (
        <div role="tablist" className="flex gap-1 overflow-x-auto pb-1.5 mb-1.5">
          {availableCategories.map((cat) => {
            const count = cat === 'all' ? sourceFiltered.length : (categoryCounts[cat] ?? 0);
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={resolvedCategory === cat}
                onClick={() => setCategoryFilter(cat)}
                className={`shrink-0 flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors ${
                  resolvedCategory === cat ? pillActive : pillInactive
                }`}
              >
                <span>{cat === 'all' ? t('panel.events.all') : t(`category.${cat}`, cat)}</span>
                <span className="text-[10px] opacity-50">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <Skeleton lines={2} />
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-400 py-1 text-center">{t('panel.events.empty')}</p>
      ) : (
        <div className="space-y-1.5">
          {events.map((event) => (
            <EventCard key={event.id} event={event} lang={i18n.language} t={t} />
          ))}
        </div>
      )}
    </>
  );
}
