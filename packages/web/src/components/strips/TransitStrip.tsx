/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTransit } from '../../hooks/useTransit.js';
import { Skeleton } from '../layout/Skeleton.js';
import type { TransitAlert } from '../../lib/api.js';

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function getLineBadgeColor(line: string): string {
  if (line.startsWith('U')) return 'bg-blue-600 text-white';
  if (line.startsWith('S')) return 'bg-green-600 text-white';
  if (line.startsWith('M') || line.toLowerCase().includes('tram')) return 'bg-red-600 text-white';
  return 'bg-yellow-600 text-white';
}

function getSeverityColor(severity: TransitAlert['severity']): string {
  if (severity === 'high') return 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950';
  if (severity === 'medium') return 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950';
  return 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900';
}

function AlertCard({ alert }: { alert: TransitAlert }) {
  const hasDetail = alert.detail && alert.detail !== alert.message;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`p-2 rounded border text-sm ${getSeverityColor(alert.severity)} ${hasDetail ? 'cursor-pointer' : ''}`}
      onClick={hasDetail ? () => setExpanded((v) => !v) : undefined}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${getLineBadgeColor(alert.line)}`}>
          {alert.line}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
          {alert.type.replace('-', ' ')}
        </span>
      </div>
      {alert.station && (
        <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-0.5">
          {alert.station}
        </p>
      )}
      <p className={`text-gray-800 dark:text-gray-200 ${expanded ? '' : 'line-clamp-2'}`}>
        {expanded ? alert.detail : alert.message}
      </p>
      {alert.affectedStops.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
          {alert.affectedStops.join(' — ')}
        </p>
      )}
      {hasDetail && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {expanded ? '▲' : '▼ details'}
        </p>
      )}
    </div>
  );
}

export function TransitStrip() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useTransit(cityId);
  const { t } = useTranslation();

  const alerts = data ?? [];
  const sorted = [...alerts].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
  );

  return (
    <section className="border-b border-gray-200 dark:border-gray-800 px-4 py-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {t('panel.transit.title')}
      </h2>

      {isLoading ? (
        <Skeleton lines={4} />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-gray-400 py-2 text-center">{t('panel.transit.empty')}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </section>
  );
}
