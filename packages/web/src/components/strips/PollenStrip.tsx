import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { usePollen } from '../../hooks/usePollen.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';
import type { PollenType, PollenIntensity } from '../../lib/api.js';

const POLLEN_TYPES: PollenType[] = [
  'Hasel', 'Erle', 'Esche', 'Birke', 'Graeser', 'Roggen', 'Beifuss', 'Ambrosia',
];

/** Each intensity's state badge (globals.css): none, then soft and strong steps up to high. */
const INTENSITY_BADGES: Record<PollenIntensity, string> = {
  '-1': 'badge-neutral',
  '0': 'badge-neutral',
  '0-1': 'badge-good',
  '1': 'badge-good-strong',
  '1-2': 'badge-fair',
  '2': 'badge-moderate',
  '2-3': 'badge-moderate-strong',
  '3': 'badge-severe',
};

function isActive(v: PollenIntensity): boolean {
  return v !== '0' && v !== '-1';
}

function isOffSeason(pollen: Record<PollenType, { today: PollenIntensity }>): boolean {
  return POLLEN_TYPES.every((t) => pollen[t].today === '-1');
}

function Badge({ value, t }: { value: PollenIntensity; t: (k: string) => string }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium leading-tight ${INTENSITY_BADGES[value]}`}>
      {t(`panel.pollen.level.${value}`)}
    </span>
  );
}

const FRESH_MAX_AGE = staleAfter('pollen');

export function PollenStrip({ expanded }: { expanded: boolean }) {
  const { id: cityId } = useCityConfig();
  const { data, fetchedAt, isLoading, isError, refetch } = usePollen(cityId);
  const { t } = useTranslation();
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  if (isLoading) return <Skeleton lines={2} />;
  if (isError) return <StripErrorFallback domain={t('panel.pollen.title')} onRetry={refetch} />;
  if (!data) return <p className="text-sm text-muted py-2 text-center">{t('panel.pollen.empty')}</p>;

  const offSeason = isOffSeason(data.pollen);

  if (offSeason) {
    return (
      <>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted">{t('panel.pollen.offSeason')}</p>
        </div>
        {agoText && (
          <TileFooter stale={isStale}>
            {t('stale.updated', { time: agoText })}
          </TileFooter>
        )}
      </>
    );
  }

  const activeTypes = POLLEN_TYPES.filter((type) => isActive(data.pollen[type].today));

  if (!expanded) {
    // Collapsed: show active pollen badges
    if (activeTypes.length === 0) {
      return (
        <>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-success font-medium">{t('panel.pollen.noActive')}</p>
          </div>
          {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
        </>
      );
    }

    return (
      <>
        <div className="flex-1 flex flex-col justify-center pb-2">
          <div className="flex flex-wrap gap-2.5 justify-center">
            {activeTypes.map((type) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t(`panel.pollen.type.${type}`)}
                </span>
                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold leading-tight ${INTENSITY_BADGES[data.pollen[type].today]}`}>
                  {t(`panel.pollen.level.${data.pollen[type].today}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
        {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
      </>
    );
  }

  // Expanded: full 3-day forecast table
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted">
              <th className="text-start font-medium pb-1.5 pe-2" />
              <th className="text-center font-medium pb-1.5 px-1">{t('panel.pollen.today')}</th>
              <th className="text-center font-medium pb-1.5 px-1">{t('panel.pollen.tomorrow')}</th>
              <th className="text-center font-medium pb-1.5 px-1">{t('panel.pollen.dayAfter')}</th>
            </tr>
          </thead>
          <tbody>
            {POLLEN_TYPES.map((type) => {
              const p = data.pollen[type];
              const rowActive = isActive(p.today) || isActive(p.tomorrow) || isActive(p.dayAfterTomorrow);
              return (
                <tr
                  key={type}
                  className={rowActive ? '' : 'opacity-40'}
                >
                  <td className="py-1 pe-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {t(`panel.pollen.type.${type}`)}
                  </td>
                  <td className="py-1 px-1 text-center"><Badge value={p.today} t={t} /></td>
                  <td className="py-1 px-1 text-center"><Badge value={p.tomorrow} t={t} /></td>
                  <td className="py-1 px-1 text-center"><Badge value={p.dayAfterTomorrow} t={t} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {agoText && <TileFooter stale={isStale}>{t('stale.updated', { time: agoText })}</TileFooter>}
    </>
  );
}
