import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useAirQuality } from '../../hooks/useAirQuality.js';
import { useAirQualityGrid } from '../../hooks/useAirQualityGrid.js';
import { useAirQualityStations } from '../../hooks/useAirQualityStations.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { formatClockTime } from '../../lib/format-time.js';
import type { AirQualityStation } from '../../lib/api.js';
import {
  AQI_SCALE_NAME, UBA_SOURCE_LINE, getAqiLevel, getUbaLevel, getUsAqiLevel, isWaqiStation, measuredSummary, shortStationName,
} from '../../lib/aqi.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Ltr } from '../Ltr.js';
import { SourceText } from '../SourceText.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

/* ── AQI scale segments ───────────────────────────────────── */

const SCALE_SEGMENTS = [
  { max: 20, color: '#50C878', key: 'good' },
  { max: 40, color: '#FFD700', key: 'fair' },
  { max: 60, color: '#FF8C00', key: 'moderate' },
  { max: 80, color: '#FF4444', key: 'poor' },
  { max: 100, color: '#8B008B', key: 'veryPoor' },
] as const;

const SCALE_MAX = 100;

function AqiScale({ aqi, t }: { aqi: number; t: (k: string) => string }) {
  const pct = Math.min(Math.max(aqi / SCALE_MAX, 0), 1) * 100;

  return (
    <div className="space-y-1" role="img" aria-label={`AQI ${aqi} — ${t(`panel.airQuality.level.${getAqiLevel(aqi).label}`)}`}>
      <div className="relative">
        <div className="flex h-2 rounded-full overflow-hidden" aria-hidden="true">
          {SCALE_SEGMENTS.map((s) => (
            <div key={s.key} className="flex-1" style={{ backgroundColor: s.color }} />
          ))}
        </div>
        {/* Marker: placed from the scale's start, which mirrors with the
            segments (the right edge in Arabic). The box has no width, so the
            dot is centred on it by pulling it back half its own width. */}
        <div
          className="absolute -top-0.5 w-0 h-0"
          style={{ insetInlineStart: `${pct}%` }}
        >
          <div
            className="w-3 h-3 -ms-1.5 rounded-full border-2 border-white dark:border-gray-900 shadow"
            style={{ backgroundColor: getAqiLevel(aqi).color }}
          />
        </div>
      </div>
      {/* Labels */}
      <div className="flex">
        {SCALE_SEGMENTS.map((s) => (
          <span key={s.key} className="flex-1 text-center text-[9px] text-muted">
            {t(`panel.airQuality.level.${s.key}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Pollutant mini-card ──────────────────────────────────── */

const POLLUTANTS = [
  { key: 'pm25', label: 'PM2.5', max: 75 },
  { key: 'no2', label: 'NO₂', max: 200 },
  { key: 'pm10', label: 'PM10', max: 150 },
  { key: 'o3', label: 'O₃', max: 180 },
] as const;

interface PollutantCardProps {
  label: string;
  value: number;
  max: number;
  color: string;
  /** The model's value standing in where the official stations measured none. */
  modelled?: boolean;
  modelLabel?: string;
}

const PollutantCard = memo(function PollutantCard({ label, value, max, color, modelled, modelLabel }: PollutantCardProps) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1 mb-0.5">
        <span className="text-[11px] text-muted font-medium">
          {label}
          {modelled && <span className="ms-1 text-[9px] font-normal">({modelLabel})</span>}
        </span>
        {/* <Ltr>: the number and its unit run left to right in Arabic too, and
            the unit's ms-0.5 has to follow that direction to land between them. */}
        <span className="text-[11px] tabular-nums text-gray-700 dark:text-gray-200 font-semibold">
          <Ltr>
            {value.toFixed(1)}
            <span className="font-normal text-muted ms-0.5">&#xb5;g/m&#xb3;</span>
          </Ltr>
        </span>
      </div>
      <div className="h-1 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
        />
      </div>
    </div>
  );
});

/* ── Station row ──────────────────────────────────────────── */

/** A WAQI station; its value is on the US AQI scale, not the European one above. */
const StationEntry = memo(function StationEntry({ name, aqi }: { name: string; aqi: number }) {
  const level = getUsAqiLevel(aqi);
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="w-2 h-2 rounded-full shrink-0 ring-1 ring-black/20 dark:ring-white/20" style={{ backgroundColor: level.color }} />
      <SourceText as="span" className="text-[11px] text-gray-600 dark:text-gray-400 truncate">{name}</SourceText>
      <span className="text-[11px] tabular-nums font-semibold text-gray-700 dark:text-gray-200 ms-auto shrink-0">
        {aqi}
      </span>
    </div>
  );
});

/** An official (UBA) station; its colour and name are UBA's index class. */
const OfficialStationEntry = memo(function OfficialStationEntry({ name, index, setting, t }: {
  name: string;
  index: number | null;
  setting: string;
  t: (k: string) => string;
}) {
  const level = getUbaLevel(index);
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="w-2 h-2 rounded-full shrink-0 ring-1 ring-black/20 dark:ring-white/20" style={{ backgroundColor: level.color }} />
      <SourceText as="span" className="text-[11px] text-gray-600 dark:text-gray-400 truncate">{name}</SourceText>
      {setting === 'traffic' && (
        <span className="text-[9px] text-muted shrink-0">{t('panel.airQuality.setting.traffic')}</span>
      )}
      <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 ms-auto shrink-0">
        {t(level.labelKey)}
      </span>
    </div>
  );
});

/* ── Main component ───────────────────────────────────────── */

const FRESH_MAX_AGE = staleAfter('airQuality');

/** Worst index first, then by name: the stations to worry about lead the list. */
function byIndexThenName(a: AirQualityStation, b: AirQualityStation): number {
  return (b.index ?? -1) - (a.index ?? -1) || a.name.localeCompare(b.name);
}

export function AirQualityStrip({ expanded }: { expanded: boolean }) {
  const { id: cityId, name: cityName, timezone, features } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = useAirQuality(cityId);
  const { data: gridData } = useAirQualityGrid(cityId);
  const { data: ubaData } = useAirQualityStations(cityId, features?.includes('airQualityStations') ?? false);
  const { t, i18n } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  // Must be above early returns to satisfy Rules of Hooks
  const official = useMemo(() => [...(ubaData ?? [])].sort(byIndexThenName), [ubaData]);
  const measured = useMemo(() => measuredSummary(ubaData ?? []), [ubaData]);
  // WAQI stations, only for a city without official ones: sorted by name for stable order, take 8
  const stations = useMemo(
    () => official.length > 0 ? [] : (gridData ?? [])
      .filter((s) => isWaqiStation(s))
      .sort((a, b) => a.station.localeCompare(b.station))
      .slice(0, 8),
    [gridData, official.length],
  );

  if (isLoading) {
    return <Skeleton lines={2} />;
  }
  if (isError) return <StripErrorFallback domain={t('panel.airQuality.title')} onRetry={refetch} />;

  if (!data) return null;

  const level = getAqiLevel(data.current.europeanAqi);
  const aqiValue = Math.round(data.current.europeanAqi);

  return (
    <>
      <div className={expanded ? '' : 'flex-1 flex flex-col justify-center'}>
        {/* Centered AQI number + level */}
        <div className="flex flex-col items-center gap-2 mb-3">
          <span className="text-3xl font-bold leading-none" style={{ color: level.color }}>
            {aqiValue}
          </span>
          <span className="text-sm font-semibold" style={{ color: level.color }}>
            {t(`panel.airQuality.level.${level.label}`)} (AQI)
          </span>
        </div>

        {/* Scale bar */}
        <AqiScale aqi={aqiValue} t={t} />
      </div>

      {/* Expanded: trend → pollutants → stations */}
      {expanded && (
        <>
          {/* Pollutant grid: measured at the official stations where they have the
              value, else the model's (CAMS forecast) */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            {POLLUTANTS.map(({ key, label, max }) => {
              const m = measured?.values[key];
              return (
                <PollutantCard
                  key={key}
                  label={label}
                  value={m ? m.value : data.current[key]}
                  max={max}
                  color={level.color}
                  modelled={measured !== null && !m}
                  modelLabel={t('panel.airQuality.model')}
                />
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-muted">
            {measured
              ? t(measured.basis === 'background' ? 'panel.airQuality.measuredBackground' : 'panel.airQuality.measuredAll', {
                time: formatClockTime(measured.measuredAt, i18n.language, timezone ?? 'Europe/Berlin'),
              })
              : t('panel.airQuality.modelled')}
          </p>

          {/* Official stations (UBA index) */}
          {official.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="mb-1.5 text-[10px] font-medium text-muted">
                {t('panel.airQuality.officialStations')}
              </div>
              <div className="grid grid-cols-1 gap-y-1.5">
                {official.map((s) => (
                  <OfficialStationEntry
                    key={s.code}
                    name={shortStationName(s.name, cityName)}
                    index={s.index}
                    setting={s.setting}
                    t={t}
                  />
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted">
                {t('panel.airQuality.officialCredit')}{' '}
                <SourceText as="span" lang="de">{UBA_SOURCE_LINE}</SourceText>
              </p>
            </div>
          )}

          {/* Station measurements (WAQI, US AQI), for a city without official stations */}
          {stations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="mb-1.5 text-[10px] font-medium text-muted">
                {AQI_SCALE_NAME.us}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {stations.map((s) => (
                  <StationEntry
                    key={s.url ?? s.station}
                    name={s.station.replace(/,\s+(?:\w+,\s+)?Germany$/, '')}
                    aqi={s.europeanAqi}
                  />
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted">
                {t('panel.airQuality.stationCredit')}
              </p>
            </div>
          )}
        </>
      )}
      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </>
  );
}
