/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useEvents } from '../../hooks/useEvents.js';
import { Skeleton } from '../layout/Skeleton.js';

const CATEGORY_ICONS: Record<string, string> = {
  music: '🎵',
  art: '🎨',
  theater: '🎭',
  food: '🍽',
  market: '🛍',
  sport: '⚽',
  community: '🤝',
  other: '📅',
};

type TimeFilter = 'today' | 'tomorrow' | 'week';

const TIME_FILTERS: TimeFilter[] = ['today', 'tomorrow', 'week'];

function getDateRange(filter: TimeFilter): { start: number; end: number } {
  const now = new Date();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayMs = 86400_000;

  switch (filter) {
    case 'today':
      return { start: todayStart, end: todayStart + dayMs };
    case 'tomorrow':
      return { start: todayStart + dayMs, end: todayStart + 2 * dayMs };
    case 'week':
      return { start: todayStart, end: todayStart + 7 * dayMs };
  }
}

function formatEventTime(dateStr: string, locale: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
}

function formatEventDay(dateStr: string, locale: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const eventDate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const diffDays = Math.floor((eventDate - todayUtc) / 86400_000);

    if (diffDays === 0) return '';
    if (diffDays === 1) return '';
    return date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }) + ' · ';
  } catch {
    return '';
  }
}

export function EventsStrip() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useEvents(cityId);
  const { t, i18n } = useTranslation();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');

  const locale = i18n.language === 'de' ? 'de' : 'en';
  const allEvents = data ?? [];

  const range = getDateRange(timeFilter);
  const events = allEvents.filter((event) => {
    const eventTime = new Date(event.date).getTime();
    return eventTime >= range.start && eventTime < range.end;
  });

  return (
    <section className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('panel.events.title')}
        </h2>
        <div className="flex gap-1">
          {TIME_FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                timeFilter === filter
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {t(`panel.events.${filter}`)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton lines={2} />
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-400 py-1 text-center">{t('panel.events.empty')}</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {events.map((event) => (
            <a
              key={event.id}
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-xs"
            >
              <span className="shrink-0">
                {CATEGORY_ICONS[event.category] ?? '📅'}
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {event.title}
              </span>
              <span className="shrink-0 text-gray-400 ml-auto">
                {formatEventDay(event.date, locale)}{formatEventTime(event.date, locale)}
              </span>
              {event.free && (
                <span className="shrink-0 px-1 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                  {t('panel.events.free')}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
