# Traffic Roads & Data Layer Icon Toggles

## Goal
1. When the **traffic** data layer is activated, show major streets on the map (hidden by default)
2. Add a **Traffic** icon (lucide `Car`) for the traffic data layer button
3. Replace checkboxes with **highlighted icon badges** for active layers

## Files to Change

### 1. `packages/web/src/components/sidebar/DataLayerToggles.tsx`
- Add icons for every layer (not just 4):
  - transit: `TrainFront` #f59e0b
  - weather: `CloudSun` #3b82f6
  - news: `Newspaper` #6366f1
  - safety: `ShieldAlert` #f97316
  - warnings: `TriangleAlert` #ef4444
  - air-quality: `Wind` #50C878
  - pharmacies: `Pill` #10b981
  - traffic: `Car` #8b5cf6
  - political: `Landmark` #64748b
- Remove `<input type="checkbox">` from each layer row
- `LayerBadge` receives `active` prop: colored background when active, gray (`#9ca3af`) when inactive
- Row stays clickable via the existing label/click handler

### 2. `packages/web/src/components/map/CityMap.tsx`
- Define `TRAFFIC_ROAD_LAYERS` — CARTO style layer IDs to show when traffic is active:
  ```
  road_sec_case_noramp, road_sec_fill_noramp,
  road_pri_case_noramp, road_pri_fill_noramp, road_pri_case_ramp, road_pri_fill_ramp,
  road_trunk_case_noramp, road_trunk_fill_noramp, road_trunk_case_ramp, road_trunk_fill_ramp,
  road_mot_case_noramp, road_mot_fill_noramp, road_mot_case_ramp, road_mot_fill_ramp,
  bridge_sec_case, bridge_sec_fill,
  bridge_pri_case, bridge_pri_fill,
  bridge_trunk_case, bridge_trunk_fill,
  bridge_mot_case, bridge_mot_fill,
  ```
- Add `setTrafficRoadVisibility(map, visible)` helper
- Exempt `TRAFFIC_ROAD_LAYERS` from `simplifyMap` hiding (they start with `road_`/`bridge_`, not custom prefixes)
- Add a `useEffect` that toggles road visibility when `activeLayers.has('traffic')` changes
- Also call `setTrafficRoadVisibility` in the `style.load` and `styledata` handlers

## Out of Scope
- No backend changes
- No new data fetching
- Political sub-layer radio buttons remain unchanged
