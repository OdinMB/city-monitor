# Transit Map Toggle & Distinctive Icons

## Problem

1. **Toggle is broken**: The "transit" data layer checkbox in the sidebar doesn't control map marker visibility. All other layers (news, safety, warnings, pharmacies, traffic) correctly gate their markers behind `activeLayers.has(...)`, but transit markers are always shown regardless of the toggle.

2. **Generic appearance**: Transit markers are plain severity-colored circles — identical in shape to news and safety markers. When multiple layers are active, there's no way to tell which dots are transit vs. other data.

## Changes

### 1. Wire transit toggle to map markers (`CityMap.tsx`)

Follow the exact pattern used by other layers:

- Add `const transitItems = activeLayers.has('transit') ? (transitAlerts ?? []) : [];` alongside the existing `newsItems`, `safetyItems`, etc. (line 828-832)
- Add a ref `transitItemsRef` and keep it in sync (like the others)
- Change the transit `useEffect` (line 925-930) to depend on `transitItems` instead of raw `transitAlerts`
- Update the `map.on('load')` and `styledata` handlers to use `transitItemsRef.current` instead of `transitAlertsRef.current`
- Remove the now-unused `transitAlertsRef`

### 2. Replace generic circles with transit icons (`CityMap.tsx`)

Replace the `circle` layer with a `symbol` layer using a custom canvas-drawn train icon:

- Add a `createTransitIcon()` function that draws a rounded-square marker with a simple train silhouette in white on a colored background (one image per severity level)
- Register three icon images on map load: `transit-icon-high`, `transit-icon-medium`, `transit-icon-low`
- Convert `updateTransitMarkers()` from a `circle` layer to a `symbol` layer using `icon-image` with a `match` expression on severity
- Keep the existing label layer below for line names
- Keep the existing click popup behavior

The result: transit markers will be visually distinct rounded squares with a train icon, clearly different from the circular dots used by news, safety, and pharmacy layers.

## Files

| File | Change |
|---|---|
| `packages/web/src/components/map/CityMap.tsx` | Both changes above |
