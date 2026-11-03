import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useSoilMoisture } from '../../hooks/useSoilMoisture.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { formatCount, formatPercent } from '../../lib/format-value.js';
import { isolate } from '../../lib/bidi.js';
import { changeOver, LEVEL_STROKE, LEVEL_TEXT, soilMoistureLevel } from '../../lib/soil-moisture.js';
import type { SoilMoistureDay, TreeWateringSummary } from '../../lib/api.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

const FRESH_MAX_AGE = staleAfter('soilMoisture');

/** The DWD's source note (its "Vorgaben für die Gestaltung des DWD-Quellenvermerks"), kept in German in every UI language. */
const DWD_URL = 'https://opendata.dwd.de/climate_environment/CDC/derived_germany/soil/daily/recent/';
const DWD_NOTE = 'Quelle: Deutscher Wetterdienst';
const DWD_NOTE_AVERAGED = 'Datenbasis: Deutscher Wetterdienst, Einzelwerte gemittelt';
const LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const GDK_URL = 'https://www.giessdenkiez.de/';

/** "1 Nov" / "1. Nov." in the UI language, from a YYYY-MM-DD day. */
function formatDay(date: string, lang: string): string {
  return isolate(new Date(`${date}T00:00:00Z`).toLocaleDateString(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }));
}

function trendArrow(change: number): string {
  return change > 0 ? '↑' : change < 0 ? '↓' : '→';
}

/** The stations' sandy-soil mean over 90 days on a 0–100 % scale (higher values clipped), with the 30 and 50 % marks. */
const HistorySparkline = memo(function HistorySparkline({ history, color, label, lang }: {
  history: SoilMoistureDay[];
  color: string;
  label: string;
  lang: string;
}) {
  if (history.length < 2) return null;
  const w = 200;
  const h = 36;
  const step = w / (history.length - 1);
  const y = (pct: number) => h - 2 - (Math.min(pct, 100) / 100) * (h - 4);
  return (
    <div>
      <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} className="block w-full h-9" preserveAspectRatio="none">
        {[30, 50].map((mark) => (
          <line key={mark} x1={0} y1={y(mark)} x2={w} y2={y(mark)} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" className="text-gray-500" />
        ))}
        <polyline
          points={history.map((d, i) => `${i * step},${y(d.sandy)}`).join(' ')}
          fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between mt-0.5 text-[10px] text-muted" dir="ltr">
        <span>{formatDay(history[0]!.date, lang)}</span>
        <span>{formatDay(history.at(-1)!.date, lang)}</span>
      </div>
    </div>
  );
});

/** Gieß den Kiez: what residents watered in the last 30 days of the data and this year. */
function WateringSection({ watering, lang }: { watering: TreeWateringSummary; lang: string }) {
  const { t } = useTranslation();
  const litres = (n: number) => t('panel.soilMoisture.watering.litresValue', { n: formatCount(n, lang) });
  const recent = watering.last30Days;
  const through = formatDay(watering.dataThrough, lang);
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">{t('panel.soilMoisture.watering.title')}</div>
      {recent.waterings > 0 ? (
        <>
          <div className="text-[11px] text-muted">{t('panel.soilMoisture.watering.last30', { date: through })}</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([
              ['litres', formatCount(recent.litres, lang)],
              ['trees', formatCount(recent.trees, lang)],
              ['waterings', formatCount(recent.waterings, lang)],
            ] as const).map(([key, value]) => (
              <div key={key}>
                <div className="text-base font-bold tabular-nums text-sky-700 dark:text-sky-300">{value}</div>
                <div className="text-[10px] text-muted">{t(`panel.soilMoisture.watering.${key}`)}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted">{t('panel.soilMoisture.watering.none', { date: through })}</p>
      )}
      <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
        <li>{t('panel.soilMoisture.watering.season', { year: watering.season.year, litres: litres(watering.season.litres), trees: formatCount(watering.season.trees, lang) })}</li>
        {watering.previousSeason.waterings > 0 && (
          <li>{t('panel.soilMoisture.watering.previous', { year: watering.previousSeason.year, litres: litres(watering.previousSeason.litres), trees: formatCount(watering.previousSeason.trees, lang) })}</li>
        )}
        {watering.topDistricts.length > 0 && (
          <li>{t('panel.soilMoisture.watering.top', { districts: watering.topDistricts.map((d) => d.district).join(', ') })}</li>
        )}
      </ul>
      <p className="text-[10px] text-muted">{t('panel.soilMoisture.watering.cadence')}</p>
    </div>
  );
}

/**
 * Drought: plant-available water in the soil under grass at the city's DWD
 * stations (their mean), with its level, trend and 90-day course; for Berlin
 * the street-tree waterings residents log on Gieß den Kiez.
 */
export function SoilMoistureStrip({ expanded = false }: { expanded?: boolean }) {
  const { id: cityId, features } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useSoilMoisture(cityId);
  const { t, i18n } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);
  const lang = i18n.language;

  if (isLoading) return <Skeleton lines={3} />;
  if (isError) return <StripErrorFallback domain={t('panel.soilMoisture.title')} onRetry={refetch} />;
  const latest = data?.history.at(-1);
  if (!data || !latest) {
    return <p className="text-sm text-muted py-2 text-center">{t('panel.soilMoisture.empty')}</p>;
  }

  const level = soilMoistureLevel(latest.sandy);
  const changes = ([7, 30] as const)
    .map((days) => ({ days, change: changeOver(data.history, days) }))
    .filter((c): c is { days: 7 | 30; change: number } => c.change !== null);
  const watering = features.includes('treeWatering') ? data.watering : null;
  const averaged = data.stations.length > 1;

  return (
    <>
      <div className="flex flex-col gap-3 py-1">
        <div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold tabular-nums leading-none ${LEVEL_TEXT[level]}`}>
              {formatPercent(Math.round(latest.sandy))}
            </span>
            <span className="text-xs text-muted leading-tight">
              {t('panel.soilMoisture.headline', { date: formatDay(latest.date, lang) })}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <span className={`text-sm font-bold ${LEVEL_TEXT[level]}`}>{t(`panel.soilMoisture.level.${level}`)}</span>
            {changes.map(({ days, change }) => (
              <span key={days} className="text-xs text-gray-700 dark:text-gray-300 tabular-nums">
                {trendArrow(change)} {t('panel.soilMoisture.change', { change: isolate(`${change > 0 ? '+' : ''}${change}`), days })}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-0.5">{t(`panel.soilMoisture.hint.${level}`)}</p>
        </div>

        {!expanded && watering && watering.last30Days.waterings > 0 && (
          <p className="text-xs text-gray-700 dark:text-gray-300">
            {t('panel.soilMoisture.watering.teaser', {
              litres: t('panel.soilMoisture.watering.litresValue', { n: formatCount(watering.last30Days.litres, lang) }),
              date: formatDay(watering.dataThrough, lang),
            })}
          </p>
        )}

        {expanded && (
          <div className="space-y-3 border-t border-border-subtle pt-3">
            <div>
              <div className="text-[11px] text-muted mb-1">
                {averaged ? t('panel.soilMoisture.historyMean', { n: data.stations.length }) : t('panel.soilMoisture.history')}
              </div>
              <HistorySparkline history={data.history} color={LEVEL_STROKE[level]} label={t('panel.soilMoisture.historyLabel')} lang={lang} />
            </div>
            <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
              <li>{t('panel.soilMoisture.loamy', { value: formatPercent(Math.round(latest.loamy)) })}</li>
              {data.stations.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span>{t('panel.soilMoisture.station', { name: s.name })}</span>
                  <span className="tabular-nums">{formatPercent(Math.round(s.sandy))} <span className="text-muted">({formatDay(s.date, lang)})</span></span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted">{t('panel.soilMoisture.explain')}</p>
            {watering && <div className="border-t border-border-subtle pt-3"><WateringSection watering={watering} lang={lang} /></div>}
          </div>
        )}
      </div>
      <TileFooter stale={isStale}>
        <span>
          <a href={DWD_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">{averaged ? DWD_NOTE_AVERAGED : DWD_NOTE}</a>
          {' · '}
          <a href={LICENCE_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">CC BY 4.0</a>
          {watering && (
            <>
              {' · '}
              <a href={GDK_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">Gieß den Kiez</a>
            </>
          )}
          {agoText && (' · ' + t('stale.updated', { time: agoText }))}
        </span>
      </TileFooter>
    </>
  );
}
