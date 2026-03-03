/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useWastewater } from '../../hooks/useWastewater.js';
import { Skeleton } from '../layout/Skeleton.js';
import type { WastewaterPathogen } from '../../lib/api.js';

const TREND_ARROWS: Record<WastewaterPathogen['trend'], string> = {
  rising: '\u2191',
  falling: '\u2193',
  stable: '\u2192',
  new: '\u2191',
  gone: '\u2193',
};

const LEVEL_COLORS: Record<WastewaterPathogen['level'], string> = {
  none: 'text-green-500 dark:text-green-400',
  low: 'text-green-500 dark:text-green-400',
  moderate: 'text-amber-500 dark:text-amber-400',
  high: 'text-red-500 dark:text-red-400',
};

const SPARKLINE_STROKES: Record<WastewaterPathogen['level'], string> = {
  none: '#22c55e',
  low: '#22c55e',
  moderate: '#f59e0b',
  high: '#ef4444',
};

function pathogenLabel(name: string, t: (key: string) => string): string {
  if (name === 'Influenza A') return t('panel.wastewater.fluA');
  if (name === 'Influenza B') return t('panel.wastewater.fluB');
  if (name === 'RSV') return t('panel.wastewater.rsv');
  return name;
}

function formatValue(v: number): string {
  if (v === 0) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}

function formatWeekLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function Sparkline({ data, color, sampleDate, label }: { data: number[]; color: string; sampleDate: string; label: string }) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const endDate = new Date(sampleDate);
  const startDate = new Date(endDate);
  // history[] entries are 7 days apart by contract (weekly CSV samples)
  startDate.setUTCDate(startDate.getUTCDate() - (data.length - 1) * 7);

  const w = 200;
  const h = 28;
  const step = w / (data.length - 1);

  return (
    <div>
      <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} className="block w-full h-7" preserveAspectRatio="none">
        {max === 0 ? (
          <line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke={color} strokeWidth={1.5} strokeOpacity={0.4} />
        ) : (
          <polyline
            points={data.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`).join(' ')}
            fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
          />
        )}
      </svg>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatWeekLabel(startDate)}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatWeekLabel(endDate)}</span>
      </div>
    </div>
  );
}

export function WastewaterStrip({ expanded }: { expanded: boolean }) {
  const { id: cityId } = useCityConfig();
  const isBerlin = cityId === 'berlin';
  const { data, isLoading } = useWastewater(cityId, isBerlin);
  const { t } = useTranslation();

  if (!isBerlin) return null;
  if (isLoading) return <Skeleton lines={2} />;
  if (!data) return <p className="text-sm text-gray-400 py-2 text-center">{t('panel.wastewater.empty')}</p>;

  if (!expanded) {
    return (
      <div className="flex-1 flex flex-col justify-center">
        <div className="flex justify-around text-center">
          {data.pathogens.map((p) => (
            <div key={p.name}>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {pathogenLabel(p.name, t)}
              </div>
              <div className="flex items-baseline justify-center gap-1">
                <span className={`text-2xl font-extrabold ${LEVEL_COLORS[p.level]}`}>
                  {t(`panel.wastewater.level.${p.level}`)}
                </span>
                {(p.value > 0 || p.trend === 'gone') && (
                  <span className={`text-lg font-bold ${LEVEL_COLORS[p.level]}`}>
                    {TREND_ARROWS[p.trend]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-2">
          {t('panel.wastewater.sampleDate', { date: new Date(data.sampleDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.pathogens.map((p) => (
        <div key={p.name}>
          <div className="flex items-baseline justify-between mb-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {pathogenLabel(p.name, t)}
              </span>
              <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
                {formatValue(p.value)} gc/L
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-sm font-bold leading-none ${LEVEL_COLORS[p.level]}`}>
                {t(`panel.wastewater.level.${p.level}`)}
              </span>
              {(p.value > 0 || p.trend === 'gone') && (
                <span className={`text-xs ${LEVEL_COLORS[p.level]}`}>
                  {TREND_ARROWS[p.trend]}
                </span>
              )}
            </div>
          </div>
          <Sparkline data={p.history} color={SPARKLINE_STROKES[p.level]} sampleDate={data.sampleDate} label={`${pathogenLabel(p.name, t)} trend`} />
        </div>
      ))}
      <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
        {t('panel.wastewater.sampleDate', { date: new Date(data.sampleDate).toLocaleDateString(undefined, { timeZone: 'UTC' }) })}
      </p>
    </div>
  );
}
