import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useElectricity } from '../../hooks/useElectricity.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { formatClockTime } from '../../lib/format-time.js';
import { formatDecimal, formatPercent, withUnit } from '../../lib/format-value.js';
import { isolate } from '../../lib/bidi.js';
import {
  co2Now, gridPointAt, greenestHour, groupMix, nextGreenWindow, SIGNAL_COLORS, type MixShare,
} from '../../lib/electricity.js';
import type { ElectricityData, GridPoint } from '../../lib/api.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Ltr } from '../Ltr.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

const FRESH_MAX_AGE = staleAfter('electricity');

/** CC BY 4.0 credits as the two licensors ask for them, in every UI language. */
const SMARD_CREDIT = 'Bundesnetzagentur | SMARD.de';
const SMARD_URL = 'https://www.smard.de/';
const ENERGY_CHARTS_CREDIT = 'Energy-Charts.info';
const ENERGY_CHARTS_URL = 'https://www.energy-charts.info/';
const LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/';

/** The current time, moved on every minute, so "now" on the grid follows the clock between fetches. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** The control area's generation as one stacked bar, renewables and the rest split by a gap. */
function MixBar({ groups, label }: { groups: MixShare[]; label: string }) {
  const sides = [groups.filter((g) => g.renewable), groups.filter((g) => !g.renewable)].filter((s) => s.length > 0);
  return (
    <div role="img" aria-label={label} className="flex h-2.5 w-full gap-0.5">
      {sides.map((side, i) => (
        <div
          key={i}
          className="flex h-full overflow-hidden rounded-full"
          style={{ width: `${side.reduce((s, g) => s + g.share, 0)}%` }}
        >
          {side.map((g) => (
            <div key={g.group} className="h-full" style={{ flexGrow: g.share, backgroundColor: g.color }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The groups in two columns, renewables and the rest, each under its total. */
function MixLegend({ groups, withPower }: { groups: MixShare[]; withPower: boolean }) {
  const { t } = useTranslation();
  const columns = [
    { key: 'renewables', items: groups.filter((g) => g.renewable) },
    { key: 'conventional', items: groups.filter((g) => !g.renewable) },
  ].filter((c) => c.items.length > 0);
  return (
    <div className="grid grid-cols-2 gap-x-4">
      {columns.map(({ key, items }) => (
        <div key={key}>
          <div className="flex justify-between text-[11px] font-semibold text-gray-900 dark:text-gray-100">
            <span>{t(`panel.electricity.${key}`)}</span>
            <span className="tabular-nums">{formatPercent(Math.round(items.reduce((s, g) => s + g.share, 0)))}</span>
          </div>
          <ul className="mt-0.5 space-y-0.5 text-[11px] text-muted">
            {items.map((g) => (
              <li key={g.group} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: g.color }} />
                <span className="flex-1 min-w-0 truncate">{t(`panel.electricity.kind.${g.group}`)}</span>
                {withPower && <span className="tabular-nums">{withUnit(formatDecimal(g.mw / 1000, 1), 'GW')}</span>}
                <span className="tabular-nums text-gray-700 dark:text-gray-300 w-8 text-end">{formatPercent(Math.round(g.share))}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The control area's hourly renewable share, on a 0–100 % scale. */
const ShareSparkline = memo(function ShareSparkline({ history, label, lang, timeZone }: {
  history: ElectricityData['renewableHistory'];
  label: string;
  lang: string;
  timeZone: string;
}) {
  if (history.length < 2) return null;
  const w = 200;
  const h = 32;
  const step = w / (history.length - 1);
  const y = (share: number) => h - 2 - (share / 100) * (h - 4);
  return (
    <div>
      <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} className="block w-full h-8" preserveAspectRatio="none">
        <line x1={0} y1={y(50)} x2={w} y2={y(50)} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="3 3" className="text-gray-500" />
        <polyline
          points={history.map((p, i) => `${i * step},${y(p.share)}`).join(' ')}
          fill="none" stroke="#22c55e" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between mt-0.5 text-[10px] text-muted">
        <Ltr>{formatClockTime(history[0]!.t, lang, timeZone)}</Ltr>
        <Ltr>{formatClockTime(history.at(-1)!.t, lang, timeZone)}</Ltr>
      </div>
    </div>
  );
});

/** Germany's traffic light for each quarter-hour of the grid, the ones gone by faded. */
function SignalTimeline({ grid, now, label, lang, timeZone }: { grid: GridPoint[]; now: number; label: string; lang: string; timeZone: string }) {
  const points = grid.filter((p) => p.signal !== null);
  if (points.length < 2) return null;
  const first = Date.parse(points[0]!.t);
  const last = Date.parse(points.at(-1)!.t) + 15 * 60_000;
  const nowAt = now > first && now < last ? ((now - first) / (last - first)) * 100 : null;
  return (
    <div>
      <div className="relative" dir="ltr">
        <div role="img" aria-label={label} className="flex h-3 w-full gap-px overflow-hidden rounded-sm">
          {points.map((p) => (
            <div
              key={p.t}
              className={`flex-1 ${SIGNAL_COLORS[p.signal!]} ${Date.parse(p.t) + 15 * 60_000 <= now ? 'opacity-30' : ''}`}
            />
          ))}
        </div>
        {nowAt !== null && (
          <div aria-hidden="true" className="absolute -top-1 -bottom-1 w-0.5 -ms-px rounded bg-gray-900 dark:bg-gray-100" style={{ insetInlineStart: `${nowAt}%` }} />
        )}
      </div>
      <div className="flex justify-between mt-0.5 text-[10px] text-muted" dir="ltr">
        <span>{formatClockTime(points[0]!.t, lang, timeZone)}</span>
        <span>{formatClockTime(new Date(Date.parse(points.at(-1)!.t) + 15 * 60_000).toISOString(), lang, timeZone)}</span>
      </div>
    </div>
  );
}

/**
 * Electricity now: the renewable share and mix of the control area whose grid
 * serves the city (SMARD), and Germany's CO₂ intensity and traffic light with
 * the next green window (Energy-Charts), which no source gives per region.
 */
export function ElectricityStrip({ expanded = false }: { expanded?: boolean }) {
  const { id: cityId, timezone } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useElectricity(cityId);
  const { t, i18n } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);
  const lang = i18n.language;
  const now = useNow();

  if (isLoading) return <Skeleton lines={3} />;
  if (isError) return <StripErrorFallback domain={t('panel.electricity.title')} onRetry={refetch} />;
  if (!data || (!data.mix && data.grid.length === 0)) {
    return <p className="text-sm text-muted py-2 text-center">{t('panel.electricity.empty')}</p>;
  }

  // One isolated run each, so an Arabic sentence keeps the time and a range in order
  const clock = (iso: string) => isolate(formatClockTime(iso, lang, timezone, now));
  const groups = data.mix ? groupMix(data.mix) : [];
  const current = gridPointAt(data.grid, now);
  const co2 = co2Now(data.grid, now);
  const green = nextGreenWindow(data.grid, now);
  const best = expanded ? greenestHour(data.grid, now) : null;

  return (
    <>
      <div className={`flex flex-col gap-4 py-1 ${expanded ? '' : 'flex-1 justify-center'}`}>
        {data.mix && (
          <div>
            <div className="text-center">
              <div className="flex items-baseline justify-center gap-2 text-green-600 dark:text-green-400">
                <span className="text-4xl font-extrabold tabular-nums leading-none">{formatPercent(Math.round(data.mix.renewableShare))}</span>
                <span className="text-lg font-bold">{t('panel.electricity.renewableWord')}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {t('panel.electricity.renewableCaption', { area: data.controlArea, time: clock(data.mix.at) })}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <MixBar groups={groups} label={t('panel.electricity.mixLabel', { area: data.controlArea })} />
              <MixLegend groups={groups} withPower={expanded} />
            </div>
          </div>
        )}

        {data.grid.length > 0 && (
          <div className="rounded-md px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border border-border-subtle text-gray-900 dark:text-gray-100">
            <div className="flex items-baseline justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-muted">
              <span>{t('panel.electricity.signal')}</span>
              {co2 && (
                <span className="normal-case tracking-normal tabular-nums">
                  {withUnit(formatDecimal(co2.value), 'g CO₂/kWh')}
                  {co2.forecast && ` (${t('panel.electricity.forecast')})`}
                </span>
              )}
            </div>
            {current?.signal != null && (
              <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                <span aria-hidden="true" className={`shrink-0 w-2.5 h-2.5 rounded-full ${SIGNAL_COLORS[current.signal]}`} />
                <span className="leading-snug">{t(`panel.electricity.signalLevel.${current.signal}`)}</span>
              </div>
            )}
            <div className="text-[11px] mt-0.5 text-muted">
              {green
                ? Date.parse(green.start) <= now
                  ? t('panel.electricity.greenUntil', { end: clock(green.end) })
                  : t('panel.electricity.greenWindow', { start: clock(green.start), end: clock(green.end) })
                : t('panel.electricity.noGreen')}
            </div>
          </div>
        )}

        {expanded && (
          <div className="space-y-3 border-t border-border-subtle pt-3">
            {data.renewableHistory.length > 1 && (
              <div>
                <div className="text-[11px] text-muted mb-1">{t('panel.electricity.history', { area: data.controlArea })}</div>
                <ShareSparkline
                  history={data.renewableHistory}
                  label={t('panel.electricity.history', { area: data.controlArea })}
                  lang={lang}
                  timeZone={timezone}
                />
              </div>
            )}
            {data.grid.some((p) => p.signal !== null) && (
              <div>
                <div className="text-[11px] text-muted mb-1">{t('panel.electricity.signalTimeline')}</div>
                <SignalTimeline grid={data.grid} now={now} label={t('panel.electricity.signalTimeline')} lang={lang} timeZone={timezone} />
              </div>
            )}
            <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
              {best && (
                <li>
                  {t('panel.electricity.greenestHour', { time: clock(best.start), share: formatPercent(Math.round(best.share)) })}
                </li>
              )}
              {current?.share != null && (
                <li>{t('panel.electricity.germanyShare', { share: formatPercent(Math.round(current.share)) })}</li>
              )}
            </ul>
          </div>
        )}
      </div>
      <TileFooter stale={isStale}>
        <span>
          <a href={SMARD_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">{SMARD_CREDIT}</a>
          {' · '}
          <a href={ENERGY_CHARTS_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">{ENERGY_CHARTS_CREDIT}</a>
          {' · '}
          <a href={LICENCE_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">CC BY 4.0</a>
          {agoText && (' · ' + t('stale.updated', { time: agoText }))}
        </span>
      </TileFooter>
    </>
  );
}
