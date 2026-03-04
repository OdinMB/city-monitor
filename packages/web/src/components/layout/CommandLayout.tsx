import { lazy, Suspense, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from '../sidebar/Sidebar.js';
import { MobileLayerDrawer } from '../sidebar/MobileLayerDrawer.js';
import { NinaBanner } from '../alerts/NinaBanner.js';
import { DashboardGrid } from './DashboardGrid.js';
import { Tile } from './Tile.js';
import { BriefingStrip } from '../strips/BriefingStrip.js';
import { NewsStrip } from '../strips/NewsStrip.js';
import { EventsStrip } from '../strips/EventsStrip.js';
import { TransitStrip } from '../strips/TransitStrip.js';
import { AirQualityStrip } from '../strips/AirQualityStrip.js';
import { WeatherStrip } from '../strips/WeatherStrip.js';
import { PoliticalStrip } from '../strips/PoliticalStrip.js';
import { WaterLevelStrip } from '../strips/WaterLevelStrip.js';
import { BathingStrip, useBathingOffSeason } from '../strips/BathingStrip.js';
import { AppointmentsStrip } from '../strips/AppointmentsStrip.js';
import { BudgetStrip } from '../strips/BudgetStrip.js';
import { LaborMarketStrip } from '../strips/LaborMarketStrip.js';
import { WastewaterStrip } from '../strips/WastewaterStrip.js';
import { PopulationStrip } from '../strips/PopulationStrip.js';
import { Skeleton } from './Skeleton.js';
import { ErrorBoundary } from 'react-error-boundary';
import { MapErrorFallback } from '../ErrorFallback.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNina } from '../../hooks/useNina.js';
import { useCommandCenter, type DataLayer } from '../../hooks/useCommandCenter.js';

const CityMap = lazy(() =>
  import('../map/CityMap.js').then((m) => ({ default: m.CityMap })),
);

function BathingTile({ isDesktop }: { isDesktop: boolean }) {
  const { t } = useTranslation();
  const { id: cityId } = useCityConfig();
  const offSeason = useBathingOffSeason(cityId);
  const badge = offSeason ? (
    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
      {t('panel.bathing.offSeason')}
    </span>
  ) : undefined;
  return (
    <Tile title={t('panel.bathing.title')} titleBadge={badge} span={1} expandable defaultExpanded={isDesktop}>
      {(expanded) => <BathingStrip expanded={expanded} />}
    </Tile>
  );
}

export function CommandLayout() {
  const { t } = useTranslation();
  const { id: cityId } = useCityConfig();
  const isDesktop = typeof window !== 'undefined'
    && window.matchMedia('(min-width: 640px)').matches;

  // Once NINA data loads, switch default layer: warnings if alerts exist, traffic otherwise
  const { data: ninaWarnings } = useNina(cityId);
  const setActiveLayers = useCommandCenter((s) => s.setActiveLayers);
  const layerInitRef = useRef(false);
  useEffect(() => {
    if (layerInitRef.current || ninaWarnings === undefined) return;
    layerInitRef.current = true;
    const layer: DataLayer = ninaWarnings.length > 0 ? 'warnings' : 'traffic';
    setActiveLayers(new Set<DataLayer>([layer]));
  }, [ninaWarnings, setActiveLayers]);

  return (
    <>
      {/* Upper zone: sidebar + map filling viewport height */}
      <div className="flex h-[50vh] lg:h-[calc(100vh-37px)]">
        <Sidebar />
        <div className="flex-1 min-w-0 relative">
          <ErrorBoundary FallbackComponent={MapErrorFallback}>
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><Skeleton lines={4} /></div>}>
              <CityMap />
            </Suspense>
          </ErrorBoundary>
          <MobileLayerDrawer />
        </div>
      </div>

      {/* Lower zone: dashboard tiles */}
      <div className="bg-gray-50 dark:bg-gray-950">
        <div className="px-4 pt-4">
          <NinaBanner />
        </div>
        <DashboardGrid>
          <Tile title={t('panel.news.briefing')} span={2}>
            <BriefingStrip />
          </Tile>
          <Tile title={t('panel.weather.title')} span={1} expandable defaultExpanded={isDesktop}>
            {(expanded) => <WeatherStrip expanded={expanded} />}
          </Tile>
          <Tile title={t('panel.airQuality.title')} span={1} expandable defaultExpanded={isDesktop}>
            {(expanded) => <AirQualityStrip expanded={expanded} />}
          </Tile>
          <Tile title={t('panel.news.title')} span={2} expandable defaultExpanded={false}>
            {(expanded, setExpanded) => <NewsStrip expanded={expanded} onExpand={() => setExpanded(true)} />}
          </Tile>
          <Tile title={t('panel.transit.title')} span={1} expandable defaultExpanded={isDesktop}>
            {(expanded, setExpanded) => <TransitStrip expanded={expanded} onExpand={() => setExpanded(true)} />}
          </Tile>
          {cityId === 'berlin' && (
            <Tile title={t('panel.wastewater.title')} span={1} expandable defaultExpanded={isDesktop}>
              {(expanded) => <WastewaterStrip expanded={expanded} />}
            </Tile>
          )}
          {cityId === 'berlin' && (
            <Tile title={t('panel.laborMarket.title')} span={1} expandable defaultExpanded={isDesktop}>
              {() => <LaborMarketStrip />}
            </Tile>
          )}
          {cityId === 'berlin' && (
            <Tile title={t('panel.population.title')} span={1}>
              <PopulationStrip />
            </Tile>
          )}
          <Tile title={t('panel.appointments.title')} span={1} expandable defaultExpanded={isDesktop}>
            {(expanded, setExpanded) => <AppointmentsStrip expanded={expanded} onExpand={() => setExpanded(true)} />}
          </Tile>
          <BathingTile isDesktop={isDesktop} />

          <Tile title={t('panel.budget.title')} span={2}>
            <BudgetStrip />
          </Tile>
          <Tile title={t('support.title')} span={1}>
            <div className="flex flex-col items-center justify-center gap-6 h-full pb-4">
              <div className="grid grid-cols-3 gap-4 text-center w-full">
                {(['cost', 'ads', 'tracking'] as const).map((key) => (
                  <div key={key}>
                    <div className="text-4xl font-extrabold tabular-nums text-green-600 dark:text-green-400">0</div>
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">{t(`support.${key}`)}</div>
                  </div>
                ))}
              </div>
              <a
                href="https://ko-fi.com/OdinMB"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <span className="inline-flex items-center gap-2 text-xl font-bold text-gray-700 dark:text-gray-200">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-red-400" aria-hidden="true">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  {t('support.title')}
                </span>
                <span className="text-lg text-gray-400 dark:text-gray-500 mt-0.5">{t('support.cta')}</span>
              </a>
            </div>
          </Tile>
          <Tile title={t('sidebar.layers.political')} expandable>
            {(expanded, setExpanded) => <PoliticalStrip expanded={expanded} onExpand={() => setExpanded(true)} />}
          </Tile>
          <Tile title={t('panel.events.title')} span={2} expandable>
            {(expanded, setExpanded) => <EventsStrip expanded={expanded} onExpand={() => setExpanded(true)} />}
          </Tile>
          <Tile title={t('panel.waterLevels.title')} span={1}>
            <WaterLevelStrip />
          </Tile>
        </DashboardGrid>
      </div>
    </>
  );
}
