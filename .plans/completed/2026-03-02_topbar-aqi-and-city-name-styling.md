# TopBar: AQI stat + city name styling

## Goal

1. Add a high-level AQI stat (e.g. "20 AQI") to the TopBar, next to the weather element
2. Style "BERLIN" as all uppercase, larger, with more spacing to the stats after it
3. Remove the AQI badge overlay from the map corner when the air-quality data layer is active (it currently shows "20 AQI" in the top-left of the map — that's now redundant since the TopBar will show it)

## Current State

- **TopBar** (`packages/web/src/components/layout/TopBar.tsx`): Shows `city.name` ("Berlin") as `text-sm font-bold` with accent color, followed by weather button (icon + temp) in a `gap-3` flex row.
- **CityMap** (`packages/web/src/components/map/CityMap.tsx`, lines 1005–1030): When `air-quality` layer is active, renders an absolute-positioned AQI badge in the map's top-left corner.
- **AirQualityStrip** (`packages/web/src/components/strips/AirQualityStrip.tsx`): Exports `getAqiLevel()` utility. The strip shows the full AQI card with pollutant bars and sparkline.

## Changes

### 1. TopBar — city name styling
**File:** `packages/web/src/components/layout/TopBar.tsx`

- Change city name to uppercase: `city.name.toUpperCase()`
- Increase size: `text-sm` → `text-base` (or `text-lg`)
- Add right margin/gap to separate it from the stats: increase `gap-3` to a larger gap after the city name, or add `mr-2` to the Link

### 2. TopBar — add AQI stat
**File:** `packages/web/src/components/layout/TopBar.tsx`

- Import `useAirQuality` and `getAqiLevel`
- Fetch AQI data: `const { data: airQuality } = useAirQuality(city.id)`
- After the weather button (and WeatherPopover), add a new inline element showing AQI:
  ```tsx
  {airQuality?.current && (
    <span className="text-sm text-gray-600 dark:text-gray-300">
      <span style={{ color: aqiLevel.color, fontWeight: 600 }}>
        {Math.round(airQuality.current.europeanAqi)}
      </span>{' '}
      <span className="text-xs text-gray-500">AQI</span>
    </span>
  )}
  ```
- Color the AQI number using `getAqiLevel(aqi).color` for at-a-glance quality indication

### 3. CityMap — remove AQI badge overlay
**File:** `packages/web/src/components/map/CityMap.tsx`

- Remove the `showAqi`/`aqiLevel` variables (lines 1005–1006)
- Remove the AQI overlay JSX (lines 1015–1030)
- Remove the `useAirQuality` import and `getAqiLevel` import (lines 20, 25) if no longer used elsewhere in the file
- Remove the `airQuality` data fetch (line 814) if no longer used

**Air quality data layer toggle:** Keep the toggle in the sidebar as a no-op placeholder. The current server API only fetches a single coordinate point — showing spatial areas of bad air quality on the map requires querying a grid of points across the bounding box. That's a separate feature to plan later.

**City name size:** `text-lg` (18px)

## Files Modified

| File | Change |
|------|--------|
| `packages/web/src/components/layout/TopBar.tsx` | Uppercase city name, larger font, add AQI stat |
| `packages/web/src/components/map/CityMap.tsx` | Remove AQI badge overlay + related imports/data |

## Testing

- Verify TopBar shows "BERLIN" in larger uppercase text with spacing
- Verify AQI stat appears next to weather with correct color
- Verify toggling air-quality layer no longer shows badge on map
- Run typecheck and lint
