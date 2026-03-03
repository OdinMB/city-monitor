# Plan: Political Layer Refactor + GeoJSON Boundaries

## Problem

1. **Political is a separate "map mode"** that hides all other data layers — it should be a data layer with mutually exclusive sub-options instead
2. **Switching to political mode does nothing visible** — no boundaries colored, no party overlays shown
3. **Missing GeoJSON files** — Bundestag and state parliament constituency boundaries don't exist, so only district (Bezirke) boundaries can render
4. **Bug**: `applyPoliticalStyling()` hardcodes `['get', 'name']` but Hamburg uses `bezirk_name`

## Changes

### 1. State Management — `useCommandCenter.ts`

- Add `'political'` to the `DataLayer` union type
- Remove `MapMode` type and `mapMode` state entirely
- Keep `PoliticalLayer` and `politicalLayer` state (for sub-option selection)
- Remove `setMapMode` action
- When `'political'` is toggled on, it works like any other layer via `activeLayers`

### 2. UI — Merge into `DataLayerToggles.tsx`

- Delete `MapModeSelector.tsx`
- Remove `<MapModeSelector />` from `Sidebar.tsx`
- In `DataLayerToggles.tsx`, render `'political'` as a normal checkbox
- When `activeLayers.has('political')`, show the 3 sub-layer radio buttons (bezirke/bundestag/landesparlament) indented below
- The pattern: checkbox toggles the layer on/off, radio buttons select which political level to show

### 3. GeoJSON Boundaries

Source real constituency GeoJSON files from German open data portals:

| File | Source | Features |
|---|---|---|
| `berlin-bundestag.geojson` | bundeswahlleiterin.de | 12 Bundestag constituencies |
| `hamburg-bundestag.geojson` | bundeswahlleiterin.de | 6 Bundestag constituencies |
| `berlin-agh.geojson` | daten.berlin.de | 78 AGH constituencies |
| `hamburg-buergerschaft.geojson` | transparenz.hamburg.de | 17 Buergerschaft constituencies |

All files: WGS84 projection, normalized `name`/`number` properties, simplified to <500KB each.

### 4. CityMap.tsx — Rendering Refactor

- Add `CONSTITUENCY_URLS` mapping for the new GeoJSON files
- Replace `mapMode === 'political'` checks with `activeLayers.has('political')`
- New effect: when `politicalLayer` changes, swap the GeoJSON source (remove + re-add the `districts` source with the correct GeoJSON for the selected level)
- Pass `nameField` to `applyPoliticalStyling()` to fix the Hamburg bug
- Political layer coexists with other data layers (no mutual exclusion)

### 5. i18n

- Add `"political"` key under `sidebar.layers`
- Remove `sidebar.mapMode` section entirely
- Keep `sidebar.political` sub-keys as-is

## Files Changed

| File | Change |
|---|---|
| `packages/web/src/hooks/useCommandCenter.ts` | Add 'political' to DataLayer, remove MapMode |
| `packages/web/src/components/sidebar/DataLayerToggles.tsx` | Add political toggle with radio sub-options |
| `packages/web/src/components/sidebar/MapModeSelector.tsx` | Delete |
| `packages/web/src/components/sidebar/Sidebar.tsx` | Remove MapModeSelector import |
| `packages/web/src/components/map/CityMap.tsx` | Swap GeoJSON per level, fix nameField bug |
| `packages/web/src/data/districts/*.geojson` | 4 new boundary files |
| `packages/web/src/i18n/{en,de,ar,tr}.json` | Move political to layers, remove mapMode |
| `.plans/08-geojson-boundaries.md` | Superseded by this plan |

## Implementation Order

1. Source and create the 4 new GeoJSON boundary files
2. Refactor state management (useCommandCenter)
3. Update UI (delete MapModeSelector, update DataLayerToggles)
4. Update CityMap.tsx rendering logic
5. Update i18n translations
6. Typecheck + lint + test
