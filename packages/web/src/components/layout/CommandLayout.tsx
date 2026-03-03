/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { lazy, Suspense } from 'react';
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
import { AppointmentsStrip } from '../strips/AppointmentsStrip.js';
import { BudgetStrip } from '../strips/BudgetStrip.js';
import { Skeleton } from './Skeleton.js';

const CityMap = lazy(() =>
  import('../map/CityMap.js').then((m) => ({ default: m.CityMap })),
);

export function CommandLayout() {
  const { t } = useTranslation();
  const isDesktop = typeof window !== 'undefined'
    && window.matchMedia('(min-width: 640px)').matches;

  return (
    <>
      {/* Upper zone: sidebar + map filling viewport height */}
      <div className="flex h-[50vh] lg:h-[calc(100vh-37px)]">
        <Sidebar />
        <div className="flex-1 min-w-0 relative">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><Skeleton lines={4} /></div>}>
            <CityMap />
          </Suspense>
          <MobileLayerDrawer />
        </div>
      </div>

      {/* Lower zone: dashboard tiles */}
      <div className="bg-gray-50 dark:bg-gray-950">
        <div className="px-4 pt-4">
          <NinaBanner />
        </div>
        <DashboardGrid>
          <Tile title={t('panel.weather.title')} span={1} expandable defaultExpanded={isDesktop}>
            {(expanded) => <WeatherStrip expanded={expanded} />}
          </Tile>
          <Tile title={t('panel.airQuality.title')} span={1} expandable defaultExpanded={isDesktop}>
            {(expanded) => <AirQualityStrip expanded={expanded} />}
          </Tile>
          <Tile title={t('panel.news.briefing')} span={2}>
            <BriefingStrip />
          </Tile>
          <Tile title={t('panel.news.title')} span={2}>
            <NewsStrip />
          </Tile>
          <Tile title={t('panel.events.title')} span={2}>
            <EventsStrip />
          </Tile>
          <Tile title={t('panel.transit.title')} span={2}>
            <TransitStrip />
          </Tile>
          <Tile title={t('panel.waterLevels.title')} span={1}>
            <WaterLevelStrip />
          </Tile>
          <Tile title={t('panel.appointments.title')} span={1}>
            <AppointmentsStrip />
          </Tile>
          <Tile title={t('panel.budget.title')} span={2}>
            <BudgetStrip />
          </Tile>
          <Tile title={t('sidebar.layers.political')} span={2} expandable>
            {(expanded, setExpanded) => <PoliticalStrip expanded={expanded} onExpand={() => setExpanded(true)} />}
          </Tile>
        </DashboardGrid>
      </div>
    </>
  );
}
