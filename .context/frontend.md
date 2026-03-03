# Frontend Architecture

## Stack

React 19, TypeScript, Vite 6 (dev + build), Tailwind v4, Zustand (theme state), React Query (data fetching + polling), react-router-dom (client routing), react-i18next (translations). Client-rendered SPA — no SSR.

## Routing

react-router-dom with `BrowserRouter` in `main.tsx`. Routes defined in `App.tsx`:

| Path | Component | Description |
|---|---|---|
| `/` | `CityPicker` | Grid of city cards linking to `/:cityId` |
| `/:cityId` | `CityRoute` → `Dashboard` | City dashboard with all panels |
| `*` | redirect to `/` | Unknown paths redirect to city picker |

`CityRoute` validates the `cityId` param against `getCityConfig()`. Unknown cities redirect to `/`.

## Component Tree

```
App
  QueryClientProvider
    Routes
      / → CityPicker (city cards grid)
      /:cityId → CityRoute
        CityProvider (context: CityConfig from URL param)
          Dashboard
            Shell
              TopBar (city name link, weather, language switcher, theme toggle)
              CommandLayout
                Sidebar (single/multi view toggle, data layer icon toggles) — hidden < lg
                CityMap (full viewport height, transit markers)
                DashboardGrid
                  Tile(span=1, expandable) → WeatherStrip (current + hourly/daily)
                  Tile(span=1, expandable) → AirQualityStrip (AQI gauge + pollutants)
                  Tile(span=2) → BriefingStrip (AI summary)
                  Tile(span=2) → NewsStrip (category filter + headlines)
                  Tile(span=2) → EventsStrip (day/time-of-day/category filters, 2-col grid, future-only)
                  Tile(span=2) → TransitStrip (line badges + expandable alert cards, container queries)
                  Tile(span=1) → WaterLevelStrip (gauge bars with MNW–MHW range)
                  Tile(span=1) → AppointmentsStrip (Bürgeramt service availability)
              Footer (AGPL source link)
```

## Data Fetching

### Bootstrap Pattern

On mount, `useBootstrap(cityId)` fetches `GET /api/:city/bootstrap` — a single request returning all data types (news, weather, transit, events, safety, warnings, air quality, pharmacies, traffic, construction, water levels, appointments). The response is split and injected into React Query's cache via `queryClient.setQueryData()`, so downstream hooks get instant data without their own initial fetch.

### Per-Domain Hooks

Each panel has a dedicated hook that polls its endpoint independently after bootstrap:

| Hook | Query Key | Refetch | Stale Time |
|---|---|---|---|
| `useBootstrap` | `['bootstrap', cityId]` | — | 60s |
| `useWeather` | `['weather', cityId]` | 15 min | 5 min |
| `useNewsDigest` | `['news', 'digest', cityId]` | 5 min | 2 min |
| `useNewsSummary` | `['news', 'summary', cityId]` | 15 min | 2 min |
| `useTransit` | `['transit', cityId]` | 5 min | 2 min |
| `useEvents` | `['events', cityId]` | 60 min | 2 min |
| `useSafety` | `['safety', cityId]` | 10 min | 2 min |
| `useConstruction` | `['construction', cityId]` | 15 min | 10 min |
| `useWaterLevels` | `['water-levels', cityId]` | 15 min | 5 min |
| `useAppointments` | `['appointments', cityId]` | 30 min | 15 min |

All hooks use `keepPreviousData` as placeholder during refetch, `retry: 2`, and `refetchIntervalInBackground: false`.

### Query Client Defaults

- `staleTime`: 2 min
- `gcTime`: 30 min
- `refetchOnWindowFocus`: true
- `retry`: 2

## API Client (`packages/web/src/lib/api.ts`)

Thin wrapper: `fetchJson<T>(url)` calls `fetch()`, checks `response.ok`, returns typed JSON. All endpoints under `/api`. Exports typed methods: `api.getBootstrap()`, `api.getWeather()`, `api.getNewsDigest()`, `api.getNewsSummary()`, `api.getTransit()`, `api.getEvents()`, `api.getSafety()`.

Frontend type definitions for `NewsDigest`, `TransitAlert`, `CityEvent`, `SafetyReport` are duplicated in `api.ts` (not imported from server — separate package boundary). `WeatherData`, `BuergeramtData`, and `BuergeramtService` are imported from `@city-monitor/shared`.

## Layout

- **Shell** — Full-height flex column: TopBar, main content, Footer. Dark mode via Tailwind `dark:` classes.
- **DashboardGrid** — CSS Grid: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 p-4`. No 3-column breakpoint to avoid gaps with span-2 tiles.
- **Tile** — Card wrapper with `title`, `span` (1 | 2 | 'full'), optional `expandable` (chevron toggle in header, render-function children receiving `expanded` boolean), optional `height` ('auto' | 'sm' | 'md' | 'lg'). Rounded border, shadow, `@container` body for container queries. Maps span to `col-span-*` classes.
- **TopBar** — City name (link back to `/`), current weather, language switcher (DE/EN/TR/AR), theme toggle.
- **Footer** — AGPL-required source code link (Section 13 compliance).

Tile assignments: Weather (1, expandable), Air Quality (1, expandable), Briefing (2), News (2), Events (2), Transit (2), Water Levels (1), Appointments (1). Expandable tiles use render-function children `(expanded: boolean) => ReactNode` to pass expand state. Strips with internal grids (Events, Transit) use Tailwind v4 container query variants (`@xs:`, `@lg:`, `@2xl:`) so internal layouts respond to tile width, not viewport.

## Internationalization (i18n)

See [i18n.md](i18n.md) for details. 4 languages supported: German, English, Turkish, Arabic. All UI strings use `useTranslation()` hook with translation keys from JSON files.

## Theme System

Zustand store in `useTheme.ts`:
- State: `{ theme: 'light' | 'dark', toggle() }`
- Initial: reads `localStorage.theme`, falls back to `prefers-color-scheme` media query
- Persistence: writes to `localStorage` on toggle
- Effect: `App` component toggles `dark` class on `<html>` element

Tailwind v4 dark mode requires `@custom-variant dark (&:where(.dark, .dark *));` in `globals.css` for class-based toggling (v4 defaults to `prefers-color-scheme` media query). Smooth 150ms transitions on `background-color`, `color`, and `border-color`.

City accent colors are set via CSS custom property `--accent` with `[data-city='berlin']` / `[data-city='hamburg']` selectors.

## City Context

`CityProvider` wraps each city dashboard, provides `useCityConfig()` hook that returns the active `CityConfig` object. City ID comes from the URL `:cityId` param. Config loaded from `packages/web/src/config/` (mirrors server config structure).

`getAllCities()` returns all registered city configs (used by CityPicker). `getDefaultCityId()` returns `'berlin'`.

## Map (`packages/web/src/components/map/CityMap.tsx`)

- MapLibre GL JS (open-source Mapbox fork), lazy-loaded via `React.lazy`
- CARTO basemaps: dark-matter-nolabels (dark theme), positron-nolabels (light theme) — free, no API key
- Minimal style: only keeps background, landcover, parks, and boundary layers (water, roads, labels hidden via `simplifyMap()`). Major road case layers (`TRAFFIC_ROAD_LAYERS` — motorway, trunk, primary, secondary + bridges) are excluded from `simplifyMap` and controlled via `setTrafficRoadVisibility()` which uses `line-opacity` (0 hidden, 1 visible) with overridden color/width paint properties. Roads appear as semi-transparent dark lines (light mode) or light lines (dark mode) when the traffic data layer is active
- Initialized from city config: `bounds` (auto-fit to show full city), minZoom, maxZoom, maxBounds
- Controls: NavigationControl (zoom only, no compass), AttributionControl (compact, collapsed on load)
- Theme-aware: swaps map style on dark/light toggle via `map.setStyle()` with `isFirstRender` ref to prevent race condition on mount
- District boundaries: GeoJSON overlay with fill, line (dashed), and label layers per city (`DISTRICT_URLS` config). Constituency-level GeoJSON (`CONSTITUENCY_URLS`) used when political layer selects bundestag or landesparlament — source is swapped via fetch + remove/re-add pattern with AbortController for race protection
- Political layer: data layer toggle (not a separate map mode) with mutually exclusive sub-options (bezirke/bundestag/landesparlament). Party colors from `PARTY_COLORS` map applied via MapLibre `match` expression on `district-fill`. Click popups show representatives from abgeordnetenwatch API. Available GeoJSON: Berlin bezirke + bundestag; Hamburg bezirke only. Berlin AGH and Hamburg bundestag/buergerschaft deferred
- Hover effect: feature-state-based fill opacity change + cursor pointer on district polygons (`setupDistrictHover()`)
- Map icons: `lib/map-icons.ts` renders Lucide SVG icons onto canvas via `Path2D` (synchronous, no async image loading). `registerAllMapIcons(map, isDark)` pre-registers icon variants (rounded-square background + white Lucide glyph): 3 transit (TrainFront × severity), 8 news (Newspaper × category), 1 safety (ShieldAlert), 1 pharmacy (Pill), 3 construction (Construction × subtype), 5 water levels (Droplets × state). Called once on `load` and `styledata`, before any marker updates. Exports `SEVERITY_COLORS`, `NEWS_CATEGORY_COLORS`, `CONSTRUCTION_SUBTYPE_COLORS`, and `WATER_STATE_COLORS` used by both map-icons and CityMap.
- Construction layer: VIZ Berlin roadworks data rendered as dashed amber/red/orange lines (LineString) + point icons (Point) with subtype-based coloring (construction=amber, closure=red, disruption=orange). GeometryCollection geometries are split into separate line/point features. Click popups show street, section, description, validity dates, and direction.
- Point markers: All 4 point data layers use `symbol` layers with pre-registered icon images. Transit uses severity-based `match` expression; news uses category-based `match`; safety and pharmacy use fixed icon IDs. Click popups and hover cursors on each layer.
- Transit markers: GeoJSON point source from `TransitAlert[]` with severity-colored icons (red/amber/gray) + line label below. Click popup shows line, type, station, message. Updated from map `load` handler and `styledata` handler using refs to bridge async map events with React state.
- Weather overlay: raster tile layer (`type: 'raster'`) sourced from `/api/weather-tiles/{z}/{x}/{y}.png` — server-side proxy to OpenWeatherMap `clouds_new` tiles (API key hidden). Added/removed via `setWeatherOverlay()` based on `activeLayers.has('weather')`. Uses `raster-opacity: 0.65` for semi-transparent overlay. Sidebar label: "Rain Radar" / "Regenradar". Requires `OPENWEATHERMAP_API_KEY` env var on the server.
- Rent map overlay (Berlin only): raster WMS tile layer from Berlin Open Data (`gdi.berlin.de/services/wms/wohnlagenadr2024`). Shows Wohnlagenkarte residential quality zones (einfach/mittel/gut) that drive Mietspiegel rent ranges. Added/removed via `setRentMapOverlay()` based on `activeLayers.has('rent-map') && city.id === 'berlin'`. No server proxy needed (public WMS, no API key). Sidebar toggle hidden for non-Berlin cities via `cities` filter in `LAYER_META`. License: dl-de-zero-2.0.
- Vite config requires `target: 'esnext'` (both `build.target` and `optimizeDeps.esbuildOptions.target`) to prevent MapLibre's GeoJSON web worker crash (`__publicField is not defined`)

## Frontend Utilities

| File | Purpose |
|---|---|
| `lib/format-time.ts` | `formatRelativeTime(iso)` — "just now", "5 min ago", "2h ago", "3d ago" |
| `lib/map-icons.ts` | Lucide-to-canvas icon renderer, `registerAllMapIcons()`, color maps, exports `IconNode` type |
| `lib/weather-codes.ts` | WMO code to emoji + label mapping |

## SEO & PWA

- `index.html` — meta description, Open Graph tags, noscript fallback
- `public/manifest.json` — PWA manifest for installability
- `public/favicon.svg` — SVG favicon
