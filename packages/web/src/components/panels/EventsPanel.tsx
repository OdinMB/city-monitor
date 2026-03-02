/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Panel } from '../layout/Panel.js';
import { Skeleton } from '../layout/Skeleton.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useEvents } from '../../hooks/useEvents.js';
import type { CityEvent } from '../../lib/api.js';

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

function formatEventDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const eventDate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const diffDays = Math.floor((eventDate - todayUtc) / 86400_000);

    let dayLabel: string;
    if (diffDays === 0) dayLabel = 'Today';
    else if (diffDays === 1) dayLabel = 'Tomorrow';
    else dayLabel = date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

    const time = date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
    return `${dayLabel}, ${time}`;
  } catch {
    return dateStr;
  }
}

export function EventsPanel() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useEvents(cityId);

  if (isLoading) {
    return <Panel title="Events"><Skeleton lines={4} /></Panel>;
  }

  const events = data ?? [];

  return (
    <Panel title="Events">
      {events.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
          No upcoming events
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <a
              key={event.id}
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2.5 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="text-sm shrink-0">
                  {CATEGORY_ICONS[event.category] ?? '📅'}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {event.title}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {event.venue && <span>{event.venue} · </span>}
                    {formatEventDate(event.date)}
                  </div>
                  {event.free && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                      Free
                    </span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}
