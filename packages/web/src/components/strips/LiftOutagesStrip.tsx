import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useLiftOutages } from '../../hooks/useLiftOutages.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { formatClockTime } from '../../lib/format-time.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Ltr } from '../Ltr.js';
import { SourceText } from '../SourceText.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import type { LiftOutage } from '../../lib/api.js';

/** Lifts listed while collapsed; the rest, and the escalators by station, when expanded. */
const COLLAPSED_LIFTS = 5;

const FRESH_MAX_AGE = staleAfter('liftOutages');

/** DB's planned return date (YYYY-MM-DD) as a short day and month in the UI language. */
function formatResumeDate(date: string, lang: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** One lift; `markDb` tags a DB station's where the list mixes operators (Köln: KVB and DB). */
function LiftRow({ outage, markDb }: { outage: LiftOutage; markDb: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <li className="flex items-baseline gap-2 min-w-0 text-sm">
      <span aria-hidden="true" className="shrink-0 w-2 h-2 rounded-full bg-signal-bad translate-y-[-1px]" />
      {markDb && outage.operator === 'db' && (
        <span className="shrink-0 px-1 rounded text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-muted">{t('panel.liftOutages.db')}</span>
      )}
      <SourceText as="span" lang="de" className="min-w-0 truncate text-gray-900 dark:text-gray-100">{outage.station}</SourceText>
      {outage.unit && <SourceText as="span" lang="de" className="shrink-0 text-[11px] text-muted">{outage.unit}</SourceText>}
      {outage.resumeDate && (
        <span className="shrink-0 text-[11px] text-muted">{t('panel.liftOutages.until', { date: formatResumeDate(outage.resumeDate, i18n.language) })}</span>
      )}
    </li>
  );
}

/**
 * Lifts and escalators out of service at the city's stations. Lifts come
 * first, one row each, as they are what wheelchair users and people with
 * prams depend on; escalators are counted per station.
 */
export function LiftOutagesStrip({ expanded = false }: { expanded?: boolean }) {
  const { id: cityId, timezone } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useLiftOutages(cityId);
  const { t, i18n } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  const { lifts, escalatorStations, escalatorCount, mixed } = useMemo(() => {
    const outages = data?.outages ?? [];
    const dbCount = outages.filter((o) => o.operator === 'db').length;
    const byStation = new Map<string, number>();
    for (const o of outages) {
      if (o.kind === 'escalator') byStation.set(o.station, (byStation.get(o.station) ?? 0) + 1);
    }
    return {
      lifts: outages.filter((o) => o.kind === 'lift'),
      escalatorStations: [...byStation.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')),
      escalatorCount: outages.length - outages.filter((o) => o.kind === 'lift').length,
      mixed: dbCount > 0 && dbCount < outages.length,
    };
  }, [data]);

  if (isLoading) return <Skeleton lines={3} />;
  if (isError) return <StripErrorFallback domain={t('panel.liftOutages.title')} onRetry={refetch} />;
  if (!data) return <p className="text-sm text-muted py-2 text-center">{t('panel.liftOutages.empty')}</p>;

  const shownLifts = expanded ? lifts : lifts.slice(0, COLLAPSED_LIFTS);
  const updated = data.updated ? formatClockTime(data.updated, i18n.language, timezone) : '';

  return (
    <>
      <div className="space-y-3 flex-1">
        {data.outages.length === 0 ? (
          <p className="text-sm text-signal-good py-2 text-center">{t('panel.liftOutages.allWorking')}</p>
        ) : (
          <>
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                {t('panel.liftOutages.lifts', { n: lifts.length })}
              </h4>
              {lifts.length === 0 ? (
                <p className="text-xs text-muted">{t('panel.liftOutages.noLifts')}</p>
              ) : (
                <ul className="space-y-1">
                  {shownLifts.map((o) => <LiftRow key={o.id} outage={o} markDb={mixed} />)}
                  {shownLifts.length < lifts.length && (
                    <li className="text-[11px] text-muted">{t('panel.liftOutages.more', { n: lifts.length - shownLifts.length })}</li>
                  )}
                </ul>
              )}
            </section>
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                {t('panel.liftOutages.escalators', { n: escalatorCount })}
              </h4>
              {escalatorCount === 0 ? (
                <p className="text-xs text-muted">{t('panel.liftOutages.noEscalators')}</p>
              ) : expanded ? (
                <ul className="space-y-0.5">
                  {escalatorStations.map(([station, count]) => (
                    <li key={station} className="flex items-baseline gap-2 min-w-0 text-xs">
                      <SourceText as="span" lang="de" className="min-w-0 truncate text-gray-900 dark:text-gray-100">{station}</SourceText>
                      <span className="shrink-0 text-muted tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">{t('panel.liftOutages.atStations', { n: escalatorStations.length })}</p>
              )}
            </section>
          </>
        )}
      </div>
      <TileFooter stale={isStale}>
        <span>
          {updated && <>{t('panel.liftOutages.asOf')} <Ltr>{updated}</Ltr></>}
          {updated && agoText && ' · '}
          {agoText && t('stale.updated', { time: agoText })}
        </span>
      </TileFooter>
    </>
  );
}
