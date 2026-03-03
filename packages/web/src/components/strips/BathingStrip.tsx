/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useBathing } from '../../hooks/useBathing.js';
import { Skeleton } from '../layout/Skeleton.js';
import type { BathingSpot } from '../../lib/api.js';

const QUALITY_COLORS: Record<string, string> = {
  good: '#22c55e',
  warning: '#f59e0b',
  poor: '#ef4444',
};

const SLOTS = 7;

const SpotRow = memo(function SpotRow({ spot, t }: { spot: BathingSpot; t: (k: string) => string }) {
  const color = QUALITY_COLORS[spot.quality] ?? QUALITY_COLORS.good;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Quality dot */}
      <div className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />

      {/* Name + water body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
            {spot.name}
          </span>
          {!spot.inSeason && (
            <span className="shrink-0 px-1 py-0.5 rounded text-[9px] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              {t('panel.bathing.offSeason')}
            </span>
          )}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
          {spot.waterBody}
          {spot.waterTemp != null && <span className="ml-1.5">{spot.waterTemp}°C</span>}
        </div>
      </div>

      {/* Quality badge */}
      <div
        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-white leading-tight"
        style={{ backgroundColor: color }}
      >
        {t(`panel.bathing.quality.${spot.quality}`)}
      </div>
    </div>
  );
});

export function BathingStrip({ expanded = true }: { expanded?: boolean }) {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useBathing(cityId);
  const { t } = useTranslation();

  if (isLoading) {
    return <Skeleton lines={3} />;
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400 py-2 text-center">{t('panel.bathing.empty')}</p>;
  }

  const { goodDisplay, warnDisplay, goodCount, warnCount, poorCount } = useMemo(() => {
    // Separate by quality
    const flagged = data.filter((s) => s.quality === 'warning' || s.quality === 'poor');
    const good = data
      .filter((s) => s.quality === 'good')
      .sort((a, b) => (b.waterTemp ?? -Infinity) - (a.waterTemp ?? -Infinity));

    // Fill slots: warnings first, then good to fill remaining
    const goodSlots = Math.max(0, SLOTS - flagged.length);
    const selected = [...flagged, ...good.slice(0, goodSlots)];

    return {
      // Display order: good first, then warnings
      goodDisplay: selected.filter((s) => s.quality === 'good'),
      warnDisplay: selected.filter((s) => s.quality !== 'good'),
      goodCount: data.filter((s) => s.quality === 'good').length,
      warnCount: data.filter((s) => s.quality === 'warning').length,
      poorCount: data.filter((s) => s.quality === 'poor').length,
    };
  }, [data]);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex justify-center gap-3 text-xs font-medium">
        <span style={{ color: QUALITY_COLORS.good }}>{goodCount} {t('panel.bathing.quality.good')}</span>
        {warnCount > 0 && <span style={{ color: QUALITY_COLORS.warning }}>{warnCount} {t('panel.bathing.quality.warning')}</span>}
        {poorCount > 0 && <span style={{ color: QUALITY_COLORS.poor }}>{poorCount} {t('panel.bathing.quality.poor')}</span>}
      </div>

      {/* Warnings */}
      {warnDisplay.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
            {t('panel.bathing.warnings')}
          </div>
          <div className="space-y-2">
            {warnDisplay.map((spot) => <SpotRow key={spot.id} spot={spot} t={t} />)}
          </div>
        </div>
      )}

      {/* Good spots — only when expanded */}
      {expanded && goodDisplay.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
            {t('panel.bathing.best')}
          </div>
          <div className="space-y-2">
            {goodDisplay.map((spot) => <SpotRow key={spot.id} spot={spot} t={t} />)}
          </div>
        </div>
      )}
    </div>
  );
}
