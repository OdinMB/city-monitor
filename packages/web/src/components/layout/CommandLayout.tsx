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
import { SocialAtlasStrip } from '../strips/SocialAtlasStrip.js';
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
          <Tile title={t('panel.socialAtlas.title')} span={1}>
            <SocialAtlasStrip />
          </Tile>
          <Tile title={t('panel.budget.title')} span={2}>
            <BudgetStrip />
          </Tile>
          <Tile title={t('sidebar.layers.political')} span={2} expandable>
            {(expanded, setExpanded) => <PoliticalStrip expanded={expanded} onExpand={() => setExpanded(true)} />}
          </Tile>
          <Tile title={t('support.title')} span={1}>
            <div className="flex flex-col items-center text-center py-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-pink-500 dark:text-pink-400 mb-3" aria-hidden="true">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <p className="text-base font-medium text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('support.message')}
              </p>
              <a
                href="https://ko-fi.com/OdinMB"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-pink-50 dark:bg-pink-950/40 px-4 py-2 text-sm font-semibold text-pink-600 dark:text-pink-400 transition-colors hover:bg-pink-100 dark:hover:bg-pink-950/60"
              >
                {t('support.cta')}
              </a>
            </div>
          </Tile>
        </DashboardGrid>
      </div>
    </>
  );
}
