/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useBudget } from '../../hooks/useBudget.js';
import { useTabKeys } from '../../hooks/useTabKeys.js';
import { Skeleton } from '../layout/Skeleton.js';
import type { BudgetAreaSummary, BudgetCategoryAmount } from '../../lib/api.js';

type Mode = 'city' | 'districts';

/* ── colors ──────────────────────────────────────────────── */

const CATEGORY_COLORS: Record<number, string> = {
  0: '#6366f1', // General — indigo
  1: '#3b82f6', // Education — blue
  2: '#f59e0b', // Social — amber
  3: '#22c55e', // Health — green
  4: '#ec4899', // Housing — pink
  5: '#84cc16', // Agriculture — lime
  6: '#f97316', // Energy — orange
  7: '#8b5cf6', // Transport — violet
  8: '#64748b', // Finance — slate
};

/* ── helpers ──────────────────────────────────────────────── */

function formatAmount(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} bn`;
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toFixed(0)} M`;
  if (abs >= 1_000) return `${(amount / 1_000).toFixed(0)} K`;
  return String(amount);
}

function mergeCategories(a: BudgetCategoryAmount[], b: BudgetCategoryAmount[]): BudgetCategoryAmount[] {
  const map = new Map<number, BudgetCategoryAmount>();
  for (const item of a) map.set(item.code, item);
  for (const item of b) {
    if (!map.has(item.code)) map.set(item.code, item);
  }
  return [...map.values()].sort((x, y) => y.amount - x.amount);
}

/* ── Pie Chart (SVG) ─────────────────────────────────────── */

interface PieSlice {
  startAngle: number;
  endAngle: number;
  color: string;
  code: number;
  amount: number;
  pct: number;
}

function buildSlices(items: BudgetCategoryAmount[], total: number): PieSlice[] {
  if (total === 0) return [];
  const slices: PieSlice[] = [];
  let angle = -Math.PI / 2; // start at top
  for (const item of items) {
    const pct = item.amount / total;
    const sweep = pct * Math.PI * 2;
    slices.push({
      startAngle: angle,
      endAngle: angle + sweep,
      color: CATEGORY_COLORS[item.code] ?? '#9ca3af',
      code: item.code,
      amount: item.amount,
      pct,
    });
    angle += sweep;
  }
  return slices;
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function PieChart({
  items,
  total,
  label,
  t,
}: {
  items: BudgetCategoryAmount[];
  total: number;
  label: string;
  t: (k: string) => string;
}) {
  const slices = buildSlices(items, total);
  const cx = 60, cy = 60, r = 52, innerR = 30;

  return (
    <div className="flex-1 min-w-0">
      <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 text-center mb-1">
        {label}
      </div>
      <svg role="img" aria-label={`${label}: ${formatAmount(total)}`} viewBox="0 0 120 120" className="w-full max-w-[140px] mx-auto">
        {slices.length === 1 ? (
          /* Single-slice case: full circle (SVG arc can't draw 360°) */
          <>
            <circle cx={cx} cy={cy} r={r} fill={slices[0]!.color} opacity={0.85}>
              <title>{t(`panel.budget.category.${slices[0]!.code}`)}: {formatAmount(slices[0]!.amount)} (100%)</title>
            </circle>
            <circle cx={cx} cy={cy} r={innerR} className="fill-white dark:fill-gray-900" />
          </>
        ) : (
          slices.map((slice, i) => {
            const sweep = slice.endAngle - slice.startAngle;
            const large = sweep > Math.PI ? 1 : 0;
            const [x1, y1] = polarToCartesian(cx, cy, r, slice.startAngle);
            const [x2, y2] = polarToCartesian(cx, cy, r, slice.endAngle);
            const [ix1, iy1] = polarToCartesian(cx, cy, innerR, slice.startAngle);
            const [ix2, iy2] = polarToCartesian(cx, cy, innerR, slice.endAngle);
            const d = [
              `M${x1},${y1}`,
              `A${r},${r},0,${large},1,${x2},${y2}`,
              `L${ix2},${iy2}`,
              `A${innerR},${innerR},0,${large},0,${ix1},${iy1}`,
              'Z',
            ].join(' ');
            return (
              <path key={i} d={d} fill={slice.color} opacity={0.85}>
                <title>{t(`panel.budget.category.${slice.code}`)}: {formatAmount(slice.amount)} ({(slice.pct * 100).toFixed(1)}%)</title>
              </path>
            );
          })
        )}
        <text x={cx} y={cy + 2} textAnchor="middle" dominantBaseline="middle"
          className="fill-gray-800 dark:fill-gray-200" style={{ fontSize: 11, fontWeight: 700 }}>
          {formatAmount(total)}
        </text>
      </svg>
    </div>
  );
}

function PieLegend({ items, t }: { items: BudgetCategoryAmount[]; t: (k: string) => string }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-0.5 mt-1">
      {items.filter((c) => c.amount > 0).map((item) => (
        <span key={item.code} className="inline-flex items-center gap-1 text-[10px] text-gray-600 dark:text-gray-400">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[item.code] ?? '#9ca3af' }} />
          {t(`panel.budget.category.${item.code}`)}
        </span>
      ))}
    </div>
  );
}

/* ── Dropdown ────────────────────────────────────────────── */

function AreaSelect({
  areas,
  value,
  onChange,
  label,
}: {
  areas: BudgetAreaSummary[];
  value: number;
  onChange: (code: number) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded px-1.5 py-1 border-none cursor-pointer"
    >
      {areas.map((a) => (
        <option key={a.areaCode} value={a.areaCode}>
          {a.areaName}
        </option>
      ))}
    </select>
  );
}

/* ── Main component ──────────────────────────────────────── */

export function BudgetStrip() {
  const { id: cityId } = useCityConfig();
  const { data, isLoading } = useBudget(cityId);
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('city');

  // District pickers: only real districts (codes 31-42), not Hauptverwaltung (30)
  const districts = useMemo(() => data?.areas.filter((a) => a.areaCode > 30) ?? [], [data]);
  const [leftArea, setLeftArea] = useState<number | null>(null);
  const [rightArea, setRightArea] = useState<number | null>(null);
  const effectiveLeft = leftArea ?? districts[0]?.areaCode ?? 0;
  const effectiveRight = rightArea ?? districts[1]?.areaCode ?? districts[0]?.areaCode ?? 0;

  const modes: { key: Mode; label: string }[] = useMemo(() => [
    { key: 'city', label: t('panel.budget.city') },
    { key: 'districts', label: t('panel.budget.districts') },
  ], [t]);
  const modeIdx = modes.findIndex((m) => m.key === mode);
  const selectModeByIdx = useCallback((i: number) => setMode(modes[i]!.key), [modes]);
  const { setTabRef: setModeRef, onKeyDown: onModeKeyDown } = useTabKeys(modes.length, modeIdx, selectModeByIdx);

  if (isLoading) return <Skeleton lines={3} />;
  if (!data || data.areas.length === 0) {
    return <p className="text-sm text-gray-400 py-2 text-center">{t('panel.budget.empty')}</p>;
  }

  const total = data.areas.find((a) => a.areaCode === -1);

  return (
    <>
      {/* Mode selector */}
      <div role="tablist" className="flex gap-0.5 mb-3 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        {modes.map((m, i) => (
          <button
            key={m.key}
            ref={setModeRef(i)}
            id={`budget-tab-${m.key}`}
            role="tab"
            aria-selected={mode === m.key}
            aria-controls="budget-panel"
            tabIndex={mode === m.key ? 0 : -1}
            onClick={() => setMode(m.key)}
            onKeyDown={onModeKeyDown}
            className={`flex-1 px-1.5 py-1 rounded-md text-[11px] font-medium text-center transition-colors ${
              mode === m.key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div id="budget-panel" role="tabpanel" aria-labelledby={`budget-tab-${mode}`}>
        {mode === 'city' && total ? (
          <CityView area={total} t={t} />
        ) : (
          <DistrictView
          areas={districts}
          leftArea={effectiveLeft}
          rightArea={effectiveRight}
          onLeftChange={setLeftArea}
          onRightChange={setRightArea}
          t={t}
        />
        )}
      </div>
    </>
  );
}

/* ── City Mode ───────────────────────────────────────────── */

function CityView({ area, t }: { area: BudgetAreaSummary; t: (k: string) => string }) {
  const deficit = area.totalExpense - area.totalRevenue;
  const isDeficit = deficit > 0;

  return (
    <>
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <PieChart items={area.revenues} total={area.totalRevenue} label={t('panel.budget.revenues')} t={t} />
          <PieLegend items={area.revenues} t={t} />
        </div>
        <div className="flex-1 min-w-0">
          <PieChart items={area.expenses} total={area.totalExpense} label={t('panel.budget.expenses')} t={t} />
          <PieLegend items={area.expenses} t={t} />
        </div>
      </div>
      <div className="flex justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        <div className="text-[11px]">
          <span className="text-gray-500 dark:text-gray-400">
            {isDeficit ? t('panel.budget.newDebt') : t('panel.budget.surplus')}:{' '}
          </span>
          <span className={`font-semibold ${isDeficit ? 'text-red-500' : 'text-green-500'}`}>
            {formatAmount(Math.abs(deficit))}
          </span>
        </div>
        <div className="text-[11px]">
          <span className="text-gray-500 dark:text-gray-400">{t('panel.budget.totalBudget')}: </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{formatAmount(area.totalExpense)}</span>
        </div>
      </div>
    </>
  );
}

/* ── District Mode ───────────────────────────────────────── */

function DistrictView({
  areas,
  leftArea,
  rightArea,
  onLeftChange,
  onRightChange,
  t,
}: {
  areas: BudgetAreaSummary[];
  leftArea: number;
  rightArea: number;
  onLeftChange: (code: number) => void;
  onRightChange: (code: number) => void;
  t: (k: string) => string;
}) {
  const left = areas.find((a) => a.areaCode === leftArea) ?? areas[0]!;
  const right = areas.find((a) => a.areaCode === rightArea) ?? areas[0]!;
  const legendItems = mergeCategories(left.expenses, right.expenses);

  return (
    <>
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <AreaSelect areas={areas} value={left.areaCode} onChange={onLeftChange} label={t('panel.budget.selectDistrict')} />
          <PieChart items={left.expenses} total={left.totalExpense} label={t('panel.budget.expenses')} t={t} />
        </div>
        <div className="flex-1 min-w-0">
          <AreaSelect areas={areas} value={right.areaCode} onChange={onRightChange} label={t('panel.budget.selectDistrict')} />
          <PieChart items={right.expenses} total={right.totalExpense} label={t('panel.budget.expenses')} t={t} />
        </div>
      </div>
      <PieLegend items={legendItems} t={t} />
    </>
  );
}
