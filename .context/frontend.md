# Frontend Architecture

## Stack

React 19, TypeScript, Vite 6 (dev + build), Tailwind v4, Zustand (theme state), React Query (data fetching + polling). Client-rendered SPA — no SSR.

## Component Tree

```
App
  QueryClientProvider
    CityProvider (context: CityConfig)
      Dashboard
        Shell
          TopBar (city name, theme toggle)
          PanelGrid (responsive CSS grid)
            NewsBriefingPanel
            WeatherPanel
            TransitPanel
            EventsPanel
            SafetyPanel
            MapPanel
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
- **TopBar** — City name, theme toggle button.
- **Footer** — AGPL-required source code link (Section 13 compliance).

## Theme System

Zustand store in `useTheme.ts`:
- State: `{ theme: 'light' | 'dark', toggle() }`
- Initial: reads `localStorage.theme`, falls back to `prefers-color-scheme` media query
- Persistence: writes to `localStorage` on toggle
- Effect: `App` component toggles `dark` class on `<html>` element for Tailwind dark mode

## City Context

`CityProvider` wraps the app, provides `useCityConfig()` hook that returns the active `CityConfig` object. Default city: `berlin`. Config loaded from `packages/web/src/config/` (mirrors server config structure).

## Map (`packages/web/src/components/map/CityMap.tsx`)

- MapLibre GL JS (open-source Mapbox fork)
- CARTO basemaps: dark-matter (dark theme), positron (light theme) — free, no API key
- Initialized from city config: center, zoom, minZoom, maxZoom, maxBounds
- Controls: NavigationControl (zoom only, no compass), AttributionControl (compact)
- Theme-aware: swaps map style on dark/light toggle via `map.setStyle()`
- No data overlays yet — ready for event/safety markers in future milestones

## Frontend Utilities

| File | Purpose |
|---|---|
| `lib/format-time.ts` | `formatRelativeTime(iso)` — "just now", "5 min ago", "2h ago", "3d ago" |
| `lib/weather-codes.ts` | WMO code to emoji + label mapping |
