import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { usePolitical } from '../../hooks/usePolitical.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { getPartyColor } from '../../lib/party-colors.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import type { PoliticalDistrict, Representative } from '../../lib/api.js';

type View = 'state' | 'bezirke' | 'bundestag';

const VIEW_LEVELS: Record<View, 'bezirke' | 'bundestag' | 'state-bezirke'> = {
  state: 'state-bezirke',
  bezirke: 'bezirke',
  bundestag: 'bundestag',
};

/* ── helpers ──────────────────────────────────────────────── */

function countByParty(districts: PoliticalDistrict[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const d of districts) {
    for (const r of d.representatives) {
      counts.set(r.party, (counts.get(r.party) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function flatReps(districts: PoliticalDistrict[]): (Representative & { district: string })[] {
  const all: (Representative & { district: string })[] = [];
  for (const d of districts) {
    for (const r of d.representatives) {
      all.push({ ...r, district: d.name });
    }
  }
  const partyCounts = new Map<string, number>();
  for (const r of all) partyCounts.set(r.party, (partyCounts.get(r.party) ?? 0) + 1);
  return all.sort((a, b) => {
    const ca = partyCounts.get(a.party) ?? 0;
    const cb = partyCounts.get(b.party) ?? 0;
    if (ca !== cb) return cb - ca;
    if (a.party !== b.party) return a.party.localeCompare(b.party);
    return a.name.localeCompare(b.name);
  });
}

/* ── sub-components ───────────────────────────────────────── */

function RepRow({ rep }: { rep: Representative & { district: string } }) {
  return (
    <div className="flex items-center gap-1.5 py-1 px-1.5 text-[11px]">
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: getPartyColor(rep.party) }}
      />
      <span className="text-gray-800 dark:text-gray-200 font-medium truncate">{rep.name}</span>
      <span className="text-gray-400 dark:text-gray-500 shrink-0">{rep.party}</span>
      <span className="text-gray-400 dark:text-gray-500 hidden @xs:inline ml-auto truncate">{rep.district}</span>
      {rep.profileUrl && (
        <a
          href={rep.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-400 ml-auto shrink-0 @xs:ml-1"
        >
          &rarr;
        </a>
      )}
    </div>
  );
}

function RepList({ districts, limit, onExpand }: { districts: PoliticalDistrict[]; limit?: number; onExpand?: () => void }) {
  const reps = flatReps(districts);
  const shown = limit ? reps.slice(0, limit) : reps;
  const remaining = limit ? reps.length - shown.length : 0;
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {shown.map((rep) => (
        <RepRow key={`${rep.name}-${rep.party}-${rep.district}`} rep={rep} />
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={onExpand}
          className="w-full py-1.5 px-2 text-xs text-blue-500 hover:text-blue-400 text-left cursor-pointer"
        >
          +{remaining} more…
        </button>
      )}
    </div>
  );
}

/* ── Semi-circle donut seat chart ─────────────────────────── */

const GAP_RAD = 0.02;

function arcPath(
  cx: number, cy: number,
  outerR: number, innerR: number,
  startAngle: number, endAngle: number,
): string {
  const px = (r: number, a: number) => cx + r * Math.cos(a);
  const py = (r: number, a: number) => cy - r * Math.sin(a);
  const sweep = startAngle - endAngle;
  const large = sweep > Math.PI ? 1 : 0;
  return [
    `M${px(outerR, startAngle)},${py(outerR, startAngle)}`,
    `A${outerR},${outerR},0,${large},0,${px(outerR, endAngle)},${py(outerR, endAngle)}`,
    `L${px(innerR, endAngle)},${py(innerR, endAngle)}`,
    `A${innerR},${innerR},0,${large},1,${px(innerR, startAngle)},${py(innerR, startAngle)}`,
    'Z',
  ].join(' ');
}

function SeatChart({ districts, seatsLabel }: { districts: PoliticalDistrict[]; seatsLabel: string }) {
  const parties = countByParty(districts);
  const total = parties.reduce((s, [, c]) => s + c, 0);
  if (total === 0) return null;

  const cx = 100, cy = 98;
  const outerR = 88, innerR = 54;

  const arcs = parties.reduce<{ angle: number; items: { d: string; color: string; party: string; count: number }[] }>(
    (acc, [party, count], i) => {
      const sweep = (count / total) * Math.PI;
      const start = acc.angle - (i === 0 ? 0 : GAP_RAD / 2);
      const end = acc.angle - sweep + (i === parties.length - 1 ? 0 : GAP_RAD / 2);
      acc.items.push({ d: arcPath(cx, cy, outerR, innerR, start, end), color: getPartyColor(party), party, count });
      return { angle: acc.angle - sweep, items: acc.items };
    },
    { angle: Math.PI, items: [] },
  ).items;

  return (
    <div>
      <svg viewBox="0 0 200 108" className="w-full max-w-[180px] sm:max-w-[240px] mx-auto">
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} opacity={0.85}>
            <title>{a.party}: {a.count}</title>
          </path>
        ))}
        <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="auto"
          className="fill-gray-800 dark:fill-gray-200" style={{ fontSize: 22, fontWeight: 700 }}>
          {total}
        </text>
        <text x={cx} y={cy + 6} textAnchor="middle" dominantBaseline="auto"
          className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: 10 }}>
          {seatsLabel}
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-0.5 mt-1.5">
        {parties.map(([party, count]) => (
          <span key={party} className="inline-flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-400">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getPartyColor(party) }} />
            {party} ({count})
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── main component ───────────────────────────────────────── */

const PREVIEW_COUNT = 5;

const FRESH_MAX_AGE = 8 * 24 * 60 * 60 * 1000; // 8 days (cron weekly)

export function PoliticalStrip({ expanded, onExpand }: { expanded: boolean; onExpand?: () => void }) {
  const [view, setView] = useState<View>('state');
  const { id: cityId } = useCityConfig();
  const { t } = useTranslation();

  const { data, fetchedAt, isLoading, isError, refetch } = usePolitical(cityId, VIEW_LEVELS[view]);
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  if (isLoading) return <Skeleton lines={2} />;
  if (isError) return <StripErrorFallback domain="Political" onRetry={refetch} />;

  const views: { key: View; label: string }[] = [
    { key: 'state', label: t('sidebar.political.landesparlament') },
    { key: 'bezirke', label: t('sidebar.political.bezirke') },
    { key: 'bundestag', label: t('sidebar.political.bundestag') },
  ];

  const totalReps = data ? data.reduce((sum, d) => sum + d.representatives.length, 0) : 0;

  return (
    <div className="flex flex-col flex-1 h-full">
      {/* View selector */}
      <div className="flex gap-0.5 mb-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        {views.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`flex-1 px-1.5 py-1 rounded-md text-[11px] font-medium text-center transition-colors ${
              view === v.key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {!data || data.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">
          {t('panel.political.empty')}
        </div>
      ) : view === 'state' ? (
        /* State Parliament: always show seat chart */
        <div className="flex-1 flex items-center justify-center">
          <SeatChart districts={data} seatsLabel={t('panel.political.seats')} />
        </div>
      ) : (
        /* Bezirke / Bundestag: summary + rep list */
        <>
          <div className="mb-1">
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {totalReps}{' '}
              {view === 'bezirke'
                ? t('panel.political.districtMayors')
                : t('panel.political.representatives')}
            </span>
          </div>
          <RepList districts={data} limit={expanded ? undefined : PREVIEW_COUNT} onExpand={onExpand} />
        </>
      )}
      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </div>
  );
}
