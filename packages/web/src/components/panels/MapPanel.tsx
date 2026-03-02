/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../layout/Panel.js';
import { Skeleton } from '../layout/Skeleton.js';

const CityMap = lazy(() =>
  import('../map/CityMap.js').then((m) => ({ default: m.CityMap })),
);

export function MapPanel() {
  const { t } = useTranslation();

  return (
    <Panel title={t('panel.map.title')} className="col-span-1 lg:col-span-2">
      <div className="h-[400px] -m-4 mt-0">
        <Suspense fallback={<Skeleton lines={8} />}>
          <CityMap />
        </Suspense>
      </div>
    </Panel>
  );
}
