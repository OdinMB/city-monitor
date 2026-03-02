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
                Sidebar (time range selector, data layer toggles) — hidden < lg
                CityMap (full viewport height, transit markers)
                BriefingStrip (AI summary)
                NewsStrip (category filter + headlines)
                EventsStrip (compact event cards)
                SafetyStrip (compact report cards)
                TransitStrip (line badges + expandable alert cards)
              Footer (AGPL source link)
```

## Data Fetching

### Bootstrap Pattern

On mount, `useBootstrap(cityId)` fetches `GET /api/:city/bootstrap` — a single request returning all 5 data types (news, weather, transit, events, safety). The response is split and injected into React Query's cache via `queryClient.setQueryData()`, so downstream hooks get instant data without their own initial fetch.

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

All hooks use `keepPreviousData` as placeholder during refetch, `retry: 2`, and `refetchIntervalInBackground: false`.

### Query Client Defaults

- `staleTime`: 2 min
- `gcTime`: 30 min
- `refetchOnWindowFocus`: true
- `retry`: 2

## API Client (`packages/web/src/lib/api.ts`)

Thin wrapper: `fetchJson<T>(url)` calls `fetch()`, checks `response.ok`, returns typed JSON. All endpoints under `/api`. Exports typed methods: `api.getBootstrap()`, `api.getWeather()`, `api.getNewsDigest()`, `api.getNewsSummary()`, `api.getTransit()`, `api.getEvents()`, `api.getSafety()`.

Frontend type definitions for `NewsDigest`, `TransitAlert`, `CityEvent`, `SafetyReport` are duplicated in `api.ts` (not imported from server — separate package boundary). `WeatherData` is imported from `@city-monitor/shared`.

## Layout

- **Shell** — Full-height flex column: TopBar, main content, Footer. Dark mode via Tailwind `dark:` classes.
- **PanelGrid** — `grid-cols-[repeat(auto-fill,minmax(320px,1fr))]` with 4px gap. Responsive: 1 column on mobile, 2-3 on desktop.
- **TopBar** — City name (link back to `/`), current weather, language switcher (DE/EN/TR/AR), theme toggle.
- **Footer** — AGPL-required source code link (Section 13 compliance).

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
- Minimal style: only keeps background, landcover, parks, and boundary layers (water, roads, labels hidden via `simplifyMap()`)
- Initialized from city config: `bounds` (auto-fit to show full city), minZoom, maxZoom, maxBounds
- Controls: NavigationControl (zoom only, no compass), AttributionControl (compact, collapsed on load)
- Theme-aware: swaps map style on dark/light toggle via `map.setStyle()` with `isFirstRender` ref to prevent race condition on mount
- District boundaries: GeoJSON overlay with fill, line (dashed), and label layers per city (`DISTRICT_URLS` config)
- Hover effect: feature-state-based fill opacity change + cursor pointer on district polygons (`setupDistrictHover()`)
- Transit markers: GeoJSON point source from `TransitAlert[]` with severity-colored circles (red/amber/gray) + line label below. Click popup shows line, type, station, message. Updated from map `load` handler and `styledata` handler using refs to bridge async map events with React state.
- Vite config requires `target: 'esnext'` (both `build.target` and `optimizeDeps.esbuildOptions.target`) to prevent MapLibre's GeoJSON web worker crash (`__publicField is not defined`)

## Frontend Utilities

| File | Purpose |
|---|---|
| `lib/format-time.ts` | `formatRelativeTime(iso)` — "just now", "5 min ago", "2h ago", "3d ago" |
| `lib/weather-codes.ts` | WMO code to emoji + label mapping |

## SEO & PWA

- `index.html` — meta description, Open Graph tags, noscript fallback
- `public/manifest.json` — PWA manifest for installability
- `public/favicon.svg` — SVG favicon
