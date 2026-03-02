/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { Panel } from '../layout/Panel.js';
import { Skeleton } from '../layout/Skeleton.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTransit } from '../../hooks/useTransit.js';
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

export function TransitPanel() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useTransit(cityId);
  const { t } = useTranslation();

  if (isLoading) {
    return <Panel title={t('panel.transit.title')}><Skeleton lines={4} /></Panel>;
  }

  const alerts = data ?? [];
  const sorted = [...alerts].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
  );

  return (
    <Panel title={t('panel.transit.title')}>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
          {t('panel.transit.empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((alert) => (
            <div
              key={alert.id}
              className={`p-2.5 rounded border text-sm ${getSeverityColor(alert.severity)}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${getLineBadgeColor(alert.line)}`}
                >
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
              <p className="text-gray-800 dark:text-gray-200">{alert.message}</p>
              {alert.affectedStops.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {alert.affectedStops.join(' — ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
