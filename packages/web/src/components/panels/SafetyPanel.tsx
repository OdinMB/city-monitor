/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Panel } from '../layout/Panel.js';
import { Skeleton } from '../layout/Skeleton.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useSafety } from '../../hooks/useSafety.js';
import { formatRelativeTime } from '../../lib/format-time.js';

export function SafetyPanel() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useSafety(cityId);

  if (isLoading) {
    return <Panel title="Safety"><Skeleton lines={4} /></Panel>;
  }

  const reports = data ?? [];

  return (
    <Panel title="Safety">
      {reports.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
          No recent reports
        </p>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <a
              key={report.id}
              href={report.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2.5 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {report.title}
                  </div>
                  {report.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                      {report.description}
                    </p>
                  )}
                </div>
                {report.district && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {report.district}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {formatRelativeTime(report.publishedAt)}
              </div>
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}
