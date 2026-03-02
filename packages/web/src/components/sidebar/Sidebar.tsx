/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TimeRangeSelector } from './TimeRangeSelector.js';
import { DataLayerToggles } from './DataLayerToggles.js';
import { MapModeSelector } from './MapModeSelector.js';

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-[260px] shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 gap-6">
      <TimeRangeSelector />
      <MapModeSelector />
      <DataLayerToggles />
    </aside>
  );
}
