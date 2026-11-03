import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CityFeature } from '@city-monitor/shared';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { usePolitical } from '../../hooks/usePolitical.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { useTabKeys } from '../../hooks/useTabKeys.js';
import { getPartyColor } from '../../lib/party-colors.js';
import { safeUrl } from '../../lib/safe-url.js';
import { forwardArrow } from '../../lib/bidi.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { SourceText } from '../SourceText.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import { Ltr } from '../Ltr.js';
import { useElectionResults } from '../../hooks/useElectionResults.js';
import { electionTitle, leadersOf } from '../map/layers/elections.js';
import type { ElectionResults, PoliticalDistrict, PoliticalLevel, Representative } from '../../lib/api.js';

type View = 'state' | 'mayor' | 'bezirke' | 'bundestag' | 'election';

/**
 * The views the city has data for, each with the level it reads. The state
 * parliament's seat chart reads its members grouped by Bezirk where the
 * political job groups them (Berlin), otherwise by constituency; the
 * Oberbürgermeister and the district mayors exist only where they are kept
 * (Köln, München; Berlin, Köln). The election view (the latest election's
 * city-wide result) reads no political level.
 */
function viewsOf(features: readonly CityFeature[]): Array<{ key: View; level: PoliticalLevel | null }> {
  const views: Array<{ key: View; level: PoliticalLevel | null }> = [
    { key: 'state', level: features.includes('stateByDistrict') ? 'state-bezirke' : 'state' },
  ];
  if (features.includes('mayor')) views.push({ key: 'mayor', level: 'mayor' });
  if (features.includes('districtMayors')) views.push({ key: 'bezirke', level: 'bezirke' });
  views.push({ key: 'bundestag', level: 'bundestag' });
  if (features.includes('electionResults')) views.push({ key: 'election', level: null });
  return views;
}

/* ── Election: the city-wide result ───────────────────────── */

const ELECTION_PREVIEW = 5;

/**
 * The latest election's city-wide shares as bars in the parties' colours,
 * the other parties together and turnout; expanded, every party and the
 * number of areas each is strongest in.
 */
function ElectionResult({ results, expanded, onExpand }: { results: ElectionResults; expanded: boolean; onExpand?: () => void }) {
  const { t, i18n } = useTranslation();
  const { total } = results;
  const shares = expanded ? total.shares : total.shares.slice(0, ELECTION_PREVIEW);
  const hidden = total.shares.length - shares.length;
  const max = Math.max(...total.shares.map((s) => s.pct), 1);
  const pct = (n: number) => `${n.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  const leaders = leadersOf(results);
  return (
    <div>
      <div className="text-[11px] text-muted mb-1.5">
        {electionTitle(results)} · {t(`panel.elections.vote.${results.election}`)}
      </div>
      <ul className="space-y-1" aria-label={electionTitle(results)}>
        {shares.map((s) => (
          <li key={s.party} className="flex items-center gap-1.5 text-[11px]">
            <SourceText as="span" className="w-20 shrink-0 truncate text-gray-800 dark:text-gray-200 font-medium">{s.party}</SourceText>
            <span className="flex-1 h-2.5 rounded-sm bg-gray-100 dark:bg-gray-800 overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-sm" style={{ width: `${(s.pct / max) * 100}%`, backgroundColor: getPartyColor(s.party) }} />
            </span>
            <span className="w-12 shrink-0 text-end tabular-nums text-gray-700 dark:text-gray-300"><Ltr>{pct(s.pct)}</Ltr></span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={onExpand} className="mt-1 text-xs text-link hover:underline cursor-pointer">
          {t('panel.political.showMore', { count: hidden })}
        </button>
      )}
      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
        {total.otherPct > 0 && <span>{t('panel.elections.others')}: <Ltr>{pct(total.otherPct)}</Ltr></span>}
        {total.turnout !== null && <span>{t('panel.elections.turnout')}: <Ltr>{pct(total.turnout)}</Ltr></span>}
      </div>
      {expanded && leaders.length > 0 && (
        <div className="mt-2">
          <div className="text-[11px] text-muted mb-0.5">{t('sidebar.electionLegend.strongest', { context: results.areaLevel })}</div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
            {leaders.map(([party, count]) => (
              <span key={party} className="inline-flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-400">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getPartyColor(party) }} />
                <SourceText>{party}</SourceText> ({count.toLocaleString(i18n.language)})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const { t, i18n } = useTranslation();
  // A German name or district runs left to right inside an Arabic row, so
  // truncate cuts it at its end rather than its first letters. The district's
  // ms-auto sits on a wrapper, since a margin-inline-start follows the
  // direction of the element it is on.
  return (
    <div className="flex items-center gap-1.5 py-1 px-1.5 text-[11px]">
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: getPartyColor(rep.party) }}
      />
      <SourceText as="span" className="text-gray-800 dark:text-gray-200 font-medium truncate">{rep.name}</SourceText>
      <span className="text-muted shrink-0">{rep.party}</span>
      <span className="text-muted hidden @xs:inline ms-auto min-w-0">
        <SourceText as="span" className="block truncate">{rep.district}</SourceText>
      </span>
      {/* min-w-6 min-h-6: a 24px target around the arrow (WCAG 2.5.8); -my-1
          keeps the row height. */}
      {rep.profileUrl && (
        <a
          href={safeUrl(rep.profileUrl)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('panel.political.profileLink', { name: rep.name })}
          className="inline-flex items-center justify-center min-w-6 min-h-6 -my-1 text-link hover:underline ms-auto shrink-0 @xs:ms-1"
        >
          {forwardArrow(i18n.language)}
        </a>
      )}
    </div>
  );
}

function RepList({ districts, limit, onExpand }: { districts: PoliticalDistrict[]; limit?: number; onExpand?: () => void }) {
  const { t } = useTranslation();
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
          className="w-full py-1.5 px-2 text-xs text-link hover:underline text-start cursor-pointer"
        >
          {t('panel.political.showMore', { count: remaining })}
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

function SeatChart({ districts }: { districts: PoliticalDistrict[] }) {
  const { t } = useTranslation();
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
          className="fill-gray-500 dark:fill-gray-400" style={{ fontSize: 10 }}>
          {t('panel.political.seats', { count: total })}
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

const FRESH_MAX_AGE = staleAfter('political');

export function PoliticalStrip({ expanded, onExpand }: { expanded: boolean; onExpand?: () => void }) {
  const [selected, setView] = useState<View>('state');
  const { id: cityId, features } = useCityConfig();
  const { t } = useTranslation();

  // The state parliament has its own name per city (the `_<city id>` keys).
  const views = useMemo(() => viewsOf(features).map((v) => ({
    ...v,
    label: v.key === 'election'
      ? t('panel.elections.tab')
      : t(`sidebar.political.${v.key === 'state' ? 'landesparlament' : v.key}`, { context: cityId }),
  })), [features, cityId, t]);
  const current = views.find((v) => v.key === selected) ?? views[0]!;
  const view = current.key;

  const isElection = current.level === null;
  const political = usePolitical(cityId, current.level ?? 'state', !isElection);
  const election = useElectionResults(cityId, isElection);
  const { data } = political;
  const { isLoading, isError, refetch } = isElection ? election : political;
  const electionResults = election.data?.data ?? null;
  // A final election result has no staleness to show
  const fetchedAt = isElection ? null : political.fetchedAt;
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  const viewIdx = views.indexOf(current);
  const selectViewByIdx = useCallback((i: number) => setView(views[i]!.key), [views]);
  const { setTabRef, onKeyDown } = useTabKeys(views.length, viewIdx, selectViewByIdx);

  if (isLoading) return <Skeleton lines={2} />;
  if (isError) return <StripErrorFallback domain={t('sidebar.layers.political')} onRetry={refetch} />;

  const totalReps = data ? data.reduce((sum, d) => sum + d.representatives.length, 0) : 0;

  return (
    <div className="flex flex-col flex-1 h-full">
      {/* View selector */}
      <div role="tablist" className="flex gap-0.5 mb-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        {views.map((v, i) => (
          <button
            key={v.key}
            ref={setTabRef(i)}
            id={`political-tab-${v.key}`}
            role="tab"
            aria-selected={view === v.key}
            aria-controls="political-panel"
            tabIndex={view === v.key ? 0 : -1}
            onClick={() => setView(v.key)}
            onKeyDown={onKeyDown}
            className={`flex-1 px-1.5 py-1 rounded-md text-[11px] font-medium text-center transition-colors ${
              view === v.key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div id="political-panel" role="tabpanel" aria-labelledby={`political-tab-${view}`}>
        {isElection ? (
          electionResults ? <ElectionResult results={electionResults} expanded={expanded} onExpand={onExpand} />
            : <div className="text-sm text-muted text-center py-2">{t('panel.political.empty')}</div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted text-center py-2">
            {t('panel.political.empty')}
          </div>
        ) : view === 'state' ? (
          /* State Parliament: always show seat chart */
          <div className="flex-1 flex items-center justify-center">
            <SeatChart districts={data} />
          </div>
        ) : view === 'mayor' ? (
          /* Oberbürgermeister: one person, no count */
          <RepList districts={data} />
        ) : (
          /* Bezirke / Bundestag: summary + rep list */
          <>
            <div className="mb-1">
              <span className="text-[11px] text-muted">
                {view === 'bezirke'
                  ? t('panel.political.districtMayors', { count: totalReps })
                  : t('panel.political.representatives', { count: totalReps })}
              </span>
            </div>
            <RepList districts={data} limit={expanded ? undefined : PREVIEW_COUNT} onExpand={onExpand} />
          </>
        )}
      </div>
      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </div>
  );
}
