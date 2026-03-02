/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { lazy, Suspense } from 'react';
import { Sidebar } from '../sidebar/Sidebar.js';
import { BriefingStrip } from '../strips/BriefingStrip.js';
import { NewsStrip } from '../strips/NewsStrip.js';
import { EventsStrip } from '../strips/EventsStrip.js';
import { TransitStrip } from '../strips/TransitStrip.js';
import { Skeleton } from './Skeleton.js';

const CityMap = lazy(() =>
  import('../map/CityMap.js').then((m) => ({ default: m.CityMap })),
);

export function CommandLayout() {
  return (
    <>
      {/* Upper zone: sidebar + map filling viewport height */}
      <div className="flex h-[50vh] lg:h-[calc(100vh-37px)]">
        <Sidebar />
        <div className="flex-1 min-w-0">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><Skeleton lines={4} /></div>}>
            <CityMap />
          </Suspense>
        </div>
      </div>

      {/* Lower zone: content strips */}
      <div className="bg-white dark:bg-gray-900">
        <BriefingStrip />
        <NewsStrip />
        <EventsStrip />
        <TransitStrip />
      </div>
    </>
  );
}
