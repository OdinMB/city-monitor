/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Panel } from '../layout/Panel.js';
import { CityMap } from '../map/CityMap.js';

export function MapPanel() {
  return (
    <Panel title="Map" className="col-span-1 lg:col-span-2">
      <div className="h-[400px] -m-4 mt-0">
        <CityMap />
      </div>
    </Panel>
  );
}
