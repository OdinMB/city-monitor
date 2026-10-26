# Frontend Architecture

## Stack

React 19, TypeScript, Vite 6 (dev + build), Tailwind v4, Zustand (theme state), React Query (data fetching + polling), react-router-dom (client routing), react-i18next (translations). Client-rendered SPA — no SSR.

## Routing

react-router-dom with `BrowserRouter` in `main.tsx`. Routes defined in `App.tsx`:

| Path | Component | Description |
|---|---|---|
| `/` | redirect to `/${getDefaultCityId()}` | Home redirect (Berlin while active, else the first active city) |
| `/imprint` | `ImprintPage` | Legal notice / Impressum |
| `/privacy` | `PrivacyPage` | Privacy policy |
| `/no-ads-no-tracking` | `NoTrackingPage` | No ads, no tracking pledge |
| `/:cityId` | `CityRoute` → `Dashboard` | City dashboard with all panels |
| `/:cityId/sources` | `SourcesPage` | Per-city data sources list |
| `/:cityId/*` | redirect to `/:cityId` | Unknown sub-paths redirect to dashboard |

`CityRoute` validates the `cityId` param against `getCityConfig()`. Unknown cities redirect to `/`. Static pages (imprint, privacy, no-tracking) use `PageShell` layout (no city context). Sources page uses `PageShell` within `CityProvider`.

## Component Tree

```
App (HelmetProvider)
  QueryClientProvider
    ErrorBoundary (AppErrorFallback)
      Routes
        / → redirect to the default city (/berlin)
        /imprint → ImprintPage (PageShell)
        /privacy → PrivacyPage (PageShell)
        /no-ads-no-tracking → NoTrackingPage (PageShell)
        /:cityId/* → CityRoute
          CityProvider (context: CityConfig from URL param)
            Dashboard or SourcesPage
              Shell / PageShell
                TopBar (city name link, weather, HeaderControls)
                CommandLayout
                  Sidebar (single/multi view toggle, data layer icon toggles) — hidden < lg
                  CityMap (hero height, lazy) + MobileLayerDrawer
                  NinaBanner
                  DashboardGrid (tiles in CommandLayout.tsx order; † = Berlin only)
                    Tile(span=2, rowSpan=2) → BriefingStrip (AI briefing, AiLabel in the heading)
                    Tile(span=2, < sm only) → NewsStrip
                    Tile(expandable) → WeatherStrip
                    Tile(expandable) → AirQualityStrip
                    Tile(expandable) → TransitStrip (6 rows collapsed / 12 expanded; each row expands to its full text)
                    Tile → support tile (Ko-fi link)
                    Tile(expandable) → PollenStrip
                    Tile(expandable) → WastewaterStrip †
                    Tile(expandable) → FeuerwehrStrip †
                    Tile(expandable) → BathingStrip (off-season badge in the heading)
                    Tile(span=2, ≥ sm only) → NewsStrip (category tabs + headlines)
                    Tile(span=2) → EventsStrip
                    Tile(expandable) → AppointmentsStrip
                    Tile(expandable) → LaborMarketStrip †
                    Tile → PopulationStrip †
                    Tile(expandable) → CrisisStrip †
                    Tile(span=2) → BudgetStrip
                    Tile(span=2) → CouncilMeetingsStrip †
                    Tile(expandable) → PoliticalStrip
                    Tile → WaterLevelStrip (gauge bars)
                Footer (AGPL source link)
```

## Data Fetching

### Bootstrap Pattern

On mount, `useBootstrap(cityId)` fetches `GET /api/:city/bootstrap` — a single request returning the cached value of every domain in `CK.bootstrapKeys` (news, weather, transit, events, safety, NINA warnings, air quality, pharmacies, AEDs, traffic, construction, water levels, budget, appointments, labor market, wastewater, population summary, Feuerwehr, pollen, noise sensors, council meetings). Large GeoJSON (social atlas, population map) is not included. The response is split and injected into React Query's cache via `queryClient.setQueryData()`, so downstream hooks get instant data without their own initial fetch.

### Per-Domain Hooks

Each panel has a dedicated hook that polls its endpoint independently after bootstrap:

| Hook | Query Key | Refetch | Stale Time |
|---|---|---|---|
| `useBootstrap` | `['bootstrap', cityId]` | — | 60s |
| `useWeather` | `['weather', cityId]` | 15 min | 5 min |
| `useNewsDigest` | `['news', 'digest', cityId]` | 5 min | 2 min |
| `useNewsSummary` | `['news', 'summary', cityId, lang]` | 60 min | 30 min |
| `useTransit` | `['transit', cityId]` | 5 min | 2 min |
| `useEvents` | `['events', cityId]` | 30 min | 15 min |
| `useSafety` | `['safety', cityId]` | 10 min | 5 min |
| `useConstruction` | `['construction', cityId]` | 15 min | 10 min |
| `useWaterLevels` | `['water-levels', cityId]` | 15 min | 5 min |
| `useAppointments` | `['appointments', cityId]` | 30 min | 15 min |

The other domains (NINA, air quality, pharmacies, AEDs, traffic, budget, labor market, wastewater, bathing, population, Feuerwehr, pollen, noise sensors, council meetings, political, social atlas) have hooks of the same shape in `packages/web/src/hooks/`. Most use `keepPreviousData` as placeholder during refetch and `retry: 2`, and most polling ones set `refetchIntervalInBackground: false` (`usePolitical` and `useNoiseSensors` leave React Query's default, also false); `useNewsSummary` retries once and keeps no placeholder.

#### History Hooks (Lazy-loaded)

`hooks/useHistory.ts` fetches historical time-series from `/api/:city/{domain}/history?range=Nd` endpoints, only while `enabled` is true. No component calls these hooks at the moment (the tile trend charts were removed with `TrendChart`). Air quality has no history: WAQI's terms forbid archiving its station data (see [weather.md](weather.md#waqi-terms-shown-live-not-archived-credited)).

| Hook | Query Key | Range | Stale Time |
|---|---|---|---|
| `useWeatherHistory` | `['weather-history', cityId]` | 7d | 30 min |
| `useWaterLevelHistory` | `['water-level-history', cityId]` | 7d | 15 min |
| `useLaborMarketHistory` | `['labor-market-history', cityId]` | 365d | 24h |

### Query Client Defaults

- `staleTime`: 2 min
- `gcTime`: 30 min
- `refetchOnWindowFocus`: true
- `retry`: 2

## API Client (`packages/web/src/lib/api.ts`)

Thin wrapper: `fetchJson<T>(url)` calls `fetch()` with `cache: 'no-store'`, checks `response.ok`, returns typed JSON. All endpoints under `/api`. The `api` object has one typed method per endpoint (`api.getBootstrap()`, `api.getWeather()`, `api.getNewsSummary(city, lang)`, … `api.getCouncilMeetings()`, plus the three `get*History(city, range)` methods).

All data types come from `@city-monitor/shared`; `api.ts` re-exports them so components can import types from `lib/api.js`. Nothing is duplicated in the web package.

## Layout

- **Shell** — Full-height flex column: TopBar, main content, Footer. Dark mode via Tailwind `dark:` classes. The TopBar slides in on scroll through an inline transform, but its buttons stay in the Tab order, so `.topbar-slide` in `globals.css` shows it while it holds keyboard focus (`:focus-visible`, not `:focus-within`, so mouse and touch scrolling are unchanged). Keep the class names if you rework the slide; `topbar-focus.test.ts` guards the wiring. On phones (below `sm`, `useIsDesktop()` false) the bar does not slide: it is `sticky` at the top of the page from the first screen, and the news ticker moves out of the bar's block into `CommandLayout` (see the hero below). `Shell.test.tsx` covers both modes.
- **DashboardGrid** — CSS Grid: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 p-4`. No 3-column breakpoint to avoid gaps with span-2 tiles.
- **Tile** — Card wrapper with `title`, optional `titleBadge` (node next to the heading), `span` (1 | 2 | 'full'), `rowSpan` (1 | 2, `xl:row-span-2`), optional `expandable` + `defaultExpanded` (chevron toggle in header, render-function children receiving `(expanded, setExpanded)`), optional `height` ('auto' | 'sm' | 'md' | 'lg'). Rounded border, shadow, `@container` body for container queries. Maps span to `col-span-*` classes.
- **Tile content accessibility (WCAG 2.2 AA)** — Muted text is `text-gray-500 dark:text-gray-400` (4.8:1 on white, 6.8:1 on the dark surfaces); `text-gray-400` in light mode is 2.6:1 and `dark:text-gray-500` 3.7:1, so neither is used for text. On a `bg-gray-100` track or badge, muted text is `text-gray-600` (gray-500 there is 4.4:1). Only decorative separators and dimmed off-season or inactive rows stay lighter. Interactive targets are at least 24×24 CSS px (2.5.8): small ones get `min-h-6`/`min-w-6` or extra padding, with a matching negative margin so the layout does not move (`StripErrorFallback`'s Retry, the "+N more" buttons, the council and political row links). Prefer letting a row of focusable children wrap, as the Events filter chip rows do; a horizontally scrolling container with focusable children needs 4px of padding (and `scroll-px-1`) so the 2px focus outline at 2px offset is not clipped.
- **TopBar** — City name (link back to `/`), current weather + AQI popovers, `HeaderControls` (language switcher + theme toggle).
- **PageShell** — Simplified layout for static pages (imprint, privacy, etc.). "City Monitor" logo link, `HeaderControls`, centered prose container, Footer. No city context dependency.
- **HeaderControls** — Shared language switcher + theme toggle. Language buttons are built dynamically from `useCityConfig().languages` (per-city: Berlin shows DE/EN/TR/AR, Hamburg shows DE/EN). Desktop: inline buttons. Mobile: hamburger menu dropdown. Used by both TopBar and PageShell.
- **Footer** — AGPL source code link, World Monitor attribution, Ko-fi support link, internal legal links (Legal Notice, Privacy, No Tracking).
- **CommandLayout hero** — Full-bleed map sized with the `h-hero` utility (`globals.css`), **never `h-screen`/`100vh`**. Mobile browsers resolve `vh` against the viewport with their chrome retracted, so a `100vh` hero runs 50–160 CSS px past what iOS Safari paints at page load, and anything anchored to its bottom edge (`ScrollIndicator`, `SkylineSeparator`) lands under the browser's own bottom bar — invisible and untappable. `h-hero` is `100svh` with a `100vh` fallback nested in `@supports`; the nesting is load-bearing (a plain two-declaration fallback is stripped by Tailwind's Lightning CSS pass). Use `h-hero` for any future full-screen section with bottom-anchored controls. Note `Sidebar` scrolls its own content for the same reason — the hero clips overflow. **Phones (below `sm`)** get a different first screen: sticky TopBar, then any active `NinaBanner` warnings, then the news ticker (`NewsMarquee reserveSpace`, which holds an empty bar of its height while the news loads so the map doesn't jump), then a shorter hero (`max(40vh, 300px)`, the floor matching `CityMap`'s `min-h-[300px]`), so the start of the tiles shows without scrolling. `vh` is fine there because nothing is anchored to the bottom of the screen. Phones get no `ScrollIndicator`; the skyline stays. Because nothing overlays the map's top edge on phones, `globals.css` resets the top-right map controls' marquee offset below 640px and `MobileLayerDrawer` drops its matching top padding. Tablets and desktops are unchanged.

Tile assignments: see the component tree above (`CommandLayout.tsx` is the source). Weather, Air Quality, Transit, Appointments, Labor Market and Crisis start expanded on desktop (`defaultExpanded={isDesktop}`); Pollen, Wastewater, Feuerwehr, Bathing and Political start collapsed. News renders twice, as a mobile-only tile near the top and a `sm`-and-up tile in the information row. Expandable tiles use render-function children `(expanded, setExpanded) => ReactNode` to pass expand state. Strips with internal grids (Events) use Tailwind v4 container query variants (`@xs:`, `@lg:`, `@2xl:`) so internal layouts respond to tile width, not viewport.

## Internationalization (i18n)

See [i18n.md](i18n.md) for details. 4 languages supported: German, English, Turkish, Arabic. All UI strings use `useTranslation()` hook with translation keys from JSON files.

## Theme System

Zustand store in `useTheme.ts`:
- State: `{ theme: 'light' | 'dark', toggle() }`
- Initial: reads `localStorage.theme`, falls back to `prefers-color-scheme` media query
- Persistence: writes to `localStorage` on toggle
- Effect: `App` component toggles `dark` class on `<html>` element
- An inline script in `index.html` reads the same key to preload the matching CARTO style before the app loads

Tailwind v4 dark mode requires `@custom-variant dark (&:where(.dark, .dark *));` in `globals.css` for class-based toggling (v4 defaults to `prefers-color-scheme` media query). Smooth 150ms transitions on `background-color`, `color`, and `border-color`.

City accent colors are set via CSS custom property `--accent` with `[data-city='berlin']` / `[data-city='hamburg']` selectors.

## Browser Storage

Browsers that block site data (cookie blocking, some private modes, sandboxed iframes) throw a `SecurityError` on any `localStorage` access, and some older private modes throw from its methods. Every read and write therefore sits in its own `try`/`catch` and falls back to the default (system theme, browser language, hint not yet seen, nothing dismissed), so the setting simply isn't remembered. `useTheme` reads storage when its module loads, so an unguarded read there blanks the whole app. Keep each call in the shape `localStorage.getItem('key')` or `localStorage.getItem(KEY)` with a `const KEY` in the same file, not a generic wrapper that takes the key from elsewhere, so every stored key can be found at its call site. `src/storage-blocked.test.tsx` renders the app and each storage-using component with storage blocked both ways; extend it when adding a key.

The privacy page lists every `localStorage` key the app uses (`STORED_VALUES` in `pages/PrivacyPage.tsx`: `theme`, `language`, `nina-dismissed`, `cm-drawer-seen`, `hasSeenKeyboardHints`). `PrivacyPage.test.tsx` scans the web source for storage keys and fails when the two lists differ, so a new key also needs a line there. The scan reads keys only in the call-site shape above: a string literal or a same-file `const`.

## City Context

`CityProvider` wraps each city dashboard, provides `useCityConfig()` hook that returns the active `CityConfig` object. City ID comes from the URL `:cityId` param. Config loaded from `packages/web/src/config/` (mirrors server config structure).

`getAllCities()` returns the active city configs. `getDefaultCityId()` returns `'berlin'` while Berlin is active, otherwise the first active city, so the home redirect never targets an inactive city (which would redirect back to `/` in a loop).

## Map (`packages/web/src/components/map/CityMap.tsx`)

- MapLibre GL JS (open-source Mapbox fork), lazy-loaded via `React.lazy`
- CARTO basemaps: dark-matter-nolabels (dark theme), positron-nolabels (light theme) — free, no API key
- **Pre-processed styles:** CARTO style JSON is fetched, processed to set `visibility: 'none'` on unwanted layers, then passed as an object to the Map constructor (not as a URL). This prevents the flash of detailed street tiles before `simplifyMap()` runs. The `loadStyle()` helper in `base.ts` handles fetch + processing + caching. Both initial load and theme swaps use it.
- Minimal style: only keeps background, landcover, parks, and boundary layers (water, roads, labels hidden via `simplifyMap()`). Major road case layers (`TRAFFIC_ROAD_LAYERS` — motorway, trunk, primary, secondary + bridges) are excluded from `simplifyMap` and controlled via `setTrafficRoadVisibility()` which uses `line-opacity` (0 hidden, 1 visible) with overridden color/width paint properties. Roads appear as semi-transparent dark lines (light mode) or light lines (dark mode) when the traffic data layer is active
- Initialized from city config: `bounds` (auto-fit to show full city), minZoom, maxZoom, maxBounds
- Controls: NavigationControl (zoom only, no compass), AttributionControl (compact, collapsed on load)
- Theme-aware: swaps map style on dark/light toggle via `map.setStyle()` with `isFirstRender` ref to prevent race condition on mount
- District boundaries: GeoJSON overlay with fill, line (dashed), and label layers per city (`DISTRICT_URLS` in `map/constants.ts`, bundled files in `src/data/districts/`). There are no constituency GeoJSONs: every political sub-layer draws on the same Bezirke boundaries. Turning the political layer on re-fetches that GeoJSON and swaps the `districts` source for one with political paint (`addDistrictSource`, remove/re-add) with an AbortController for race protection
- Political layer (`map/layers/political.ts`): data layer toggle (not a separate map mode) with mutually exclusive sub-options (bezirke/bundestag/landesparlament), all drawn on the Bezirke boundaries; landesparlament uses the `state-bezirke` level (MdAs aggregated per Bezirk, Berlin only). Data names and boundary names differ (`Steglitz-Zehlendorf` vs. Bundestag `Berlin-Steglitz-Zehlendorf`, `Hamburg-Bergedorf – Harburg`), so the fill, the party markers (`updatePoliticalMarkers`) and the click popups all resolve a boundary to its district with `findPoliticalDistrict()`: exact name, then the name minus one leading city segment, then an area named after a spaced dash. Party colors (`lib/party-colors.ts`) are applied via a MapLibre `match` expression on `district-fill` keyed by the raw boundary names. Click popups show representatives from abgeordnetenwatch API. `political-matching.test.ts` checks every Berlin and Hamburg Bezirk against the server's names
- Hover effect: feature-state-based fill opacity change + cursor pointer on district polygons (`setupDistrictHover()`)
- Map icons: `lib/map-icons.ts` renders Lucide SVG icons onto canvas via `Path2D` (synchronous, no async image loading). `registerAllMapIcons(map, isDark)` pre-registers icon variants (rounded-square background + white Lucide glyph): 8 news (one glyph per category from `NEWS_CATEGORY_ICONS`, coloured by category), 1 police report (Siren), 1 pharmacy (Pill), 1 AED (HeartPulse), 3 construction (Construction × subtype), 3 bathing (Waves × quality). Called once on `load` and `styledata`, before any marker updates. Transit (TrainFront) and water-level (Droplets) markers carry their label inside the icon, so their layer modules build them per feature with `createVerticalBadgeIcon`; political icons come from `registerPoliticalIcons`. Exports the colour maps (`SEVERITY_COLORS`, `NEWS_CATEGORY_COLORS`, `CONSTRUCTION_SUBTYPE_COLORS`, `AQI_LEVEL_COLORS`, `WATER_STATE_COLORS`, `BATHING_QUALITY_COLORS`, `NOISE_LEVEL_COLORS`) used by the layer modules.
- Construction layer: VIZ Berlin roadworks data rendered as dashed amber/red/orange lines (LineString) + point icons (Point) with subtype-based coloring (construction=amber, closure=red, disruption=orange). GeometryCollection geometries are split into separate line/point features. Click popups show street, section, description, validity dates, and direction.
- Point markers: icon markers are `symbol` layers. News uses a category-based `match` expression and bathing a quality-based one; police reports, pharmacies and AEDs use fixed icon IDs; transit, water levels, air-quality stations, noise sensors and political markers read each feature's own badge icon (`iconId`). Click popups and hover cursors on each layer. News and safety markers use interactive spiderfying — markers at identical coordinates are grouped with a "+N" count badge; clicking expands the group outward in an adaptive-radius circle (base 300m + 80m per item) with connecting spider legs; clicking the map background collapses the expansion. Count badges hide when expanded. Expansion state survives data refreshes if the group key persists. State managed via module-level `SpiderState` per marker type with proper handler cleanup on data updates.
- **Popup markup is an HTML string** that `showMapPopup` (`map/popups.ts`) hands to MapLibre's `setHTML`, and its text comes from feeds, OSM, APIs and the LLM. Pass every data-derived value through `escapeHtml()` (`lib/escape-html.ts`) and every link target through `safeUrl()` and then `escapeHtml()`; omit the link when `safeUrl` returns nothing. Only constant markup and internal lookups (colours) go in unescaped. The deployed CSP allows inline script, so a missed value is script injection. `news-safety.test.ts` shows the malicious-input test pattern
- **Popup words follow the UI language.** Each layer exports a pure builder (`trafficPopupHtml`, `bathingPopupHtml`, `aedPopupHtml`, …) that looks its words up with `i18n.t` when the popup opens: `mapPopup.*` keys, or the matching tile's own keys (`panel.waterLevels.*`, `panel.bathing.*`, `panel.population.*`, `nina.severity.*`) so popup and tile say the same thing. Enum values from feeds (incident type, transit alert type, OSM `access`) are translated with the raw value as fallback; names and descriptions from feeds stay as sent. Translated text is escaped like data. A number with a unit or a phone number that follows a translated label goes through `ltr()` (`map/popups.ts`, a `<bdi dir="ltr">`), or Arabic's right-to-left layout reorders it ("21°C" as "C°21"); so does the roadworks validity range, feed data in German format with no words. "Read more", "Details" and "Profile" links end in `forwardArrow()` ("←" in Arabic). The traffic delay is a plural string (`mapPopup.delay` with `count`). Pharmacy duty dates use `i18n.language` for month names, on a 24-hour clock. `popup-language.test.ts` renders every builder in DE/TR/AR and fails on leftover English UI words or raw keys; a new popup or popup string goes in all four bundles and in that test
- Transit markers: GeoJSON point source from `TransitAlert[]` with severity-colored icons (red/amber/gray) + line label below. Click popup shows the station as heading, then for each alert its line, translated type label and the full `detail` text. Updated from map `load` handler and `styledata` handler using refs to bridge async map events with React state.
- Weather overlay: raster tile layer (`type: 'raster'`) sourced from `/api/weather-tiles/{z}/{x}/{y}.png` — server-side proxy to RainViewer precipitation radar tiles (free, no API key). Server fetches latest radar timestamp from RainViewer API every 5 min. Added/removed via `setWeatherOverlay()` based on `activeLayers.has('weather')`. Uses `raster-opacity: 0.65` for semi-transparent overlay. Sidebar label: "Rain Radar" / "Regenradar".
- Rent map overlay (Berlin only): raster WMS tile layer from Berlin Open Data (`gdi.berlin.de/services/wms/wohnlagenadr2024`). Shows Wohnlagenkarte residential quality zones (einfach/mittel/gut) that drive Mietspiegel rent ranges. Added/removed via `setRentMapOverlay()` when the `social` layer is on with its `rent` sub-layer selected (`activeLayers.has('social') && city.id === 'berlin' && socialLayer === 'rent'`). No server proxy needed (public WMS, no API key). The `social` toggle is hidden for non-Berlin cities via `cities` filter in `LAYER_META`. License: dl-de-zero-2.0.
- Vite config requires `target: 'esnext'` (both `build.target` and `optimizeDeps.esbuildOptions.target`) to prevent MapLibre's GeoJSON web worker crash (`__publicField is not defined`)
- MapLibre v6 is ESM-only with no default export: import it as `import * as maplibregl from 'maplibre-gl'` (or named imports). Its worker is a separate module, wired up once in `CityMap.tsx` via `setWorkerUrl()` with a `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` import — `?worker&url`, not `?url`, or production builds emit the worker without its shared chunk and no tiles load. The global `GeoJSON` namespace comes from `"geojson"` in the web `tsconfig.json` `types` (v6's typings no longer pull it in). The test mock in `test-setup.ts` must export every named export the map code calls, including `setWorkerUrl`

## Data Freshness

API responses include `fetchedAt` (ISO string) indicating when data was last ingested from external sources. The frontend uses this to show staleness indicators.

- **`useFreshness(fetchedAt, freshMaxAge)`** — hook that returns `{ isStale, agoText }`. Re-evaluates every 60s. `agoText` uses i18n `time.*` keys.
- **`TileFooter`** — unified footnote component (`text-[11px]`, centered; `gray-500` light / `gray-400` dark, at least 4.5:1 on the tile surface in both themes). Used for staleness badges and domain-specific notes (measurement dates, generation times).
- Each strip's `FRESH_MAX_AGE` comes from `staleAfter(feed)` in `lib/freshness.ts`: the feeding cron job's interval plus half an interval of grace (at least 15 min), plus the hook's refetch interval and the route's HTTP max-age, so data counts as stale only after a scheduled run was missed. Update its table when a cron schedule, `cacheFor()` value or hook refetch interval changes. When stale, a `TileFooter` with "Updated X ago" (translated) appears at the bottom. `TileFooter stale` turns the text amber (`amber-700` light, AA on white) and appends the translated word `stale.outdated`, so staleness isn't shown by colour alone.
- Strips with domain-specific footnotes (BriefingStrip, WastewaterStrip, BathingStrip, LaborMarketStrip, PopulationStrip) use `TileFooter` for those notes as well, ensuring consistent styling.

## Reusable Components

| Component | File | Description |
|---|---|---|
| `Tile`, `TileFooter`, `Skeleton` | `components/layout/` | Tile card (see Layout), footnote/staleness line, loading placeholder |
| `StripErrorFallback`, `MapErrorFallback`, `AppErrorFallback` | `components/ErrorFallback.tsx` | Error states for a strip (with retry), the map and the whole app |
| `AiLabel` | `components/AiLabel.tsx` | The Briefing tile's AI tag (see `ai-transparency.md`) |

There is no shared chart component: `TrendChart` was removed, and the wastewater tile draws its own sparkline (`Sparkline` in `WastewaterStrip.tsx`).

## Frontend Utilities

| File | Purpose |
|---|---|
| `lib/format-time.ts` | `formatRelativeTimeI18n(iso, t)` — relative time in the UI language from the `time.*` keys ("5 min ago", "vor 5 Min.", "5 dk önce"). The result already holds the "ago" word, so a string that embeds it (`panel.news.generatedAgo`, `stale.updated`) must not add one. |
| `lib/bidi.ts` | `forwardArrow(lng)` — "→", or "←" in a right-to-left language, for "more / until" marks (see i18n.md → Right-to-left) |
| `components/Ltr.tsx` | `<Ltr>` — isolates a phone number or numeric range left-to-right in an Arabic layout; React counterpart of the popups' `ltr()` |
| `lib/map-icons.ts` | Lucide-to-canvas icon renderer, `registerAllMapIcons()`, color maps, exports `IconNode` type |
| `lib/weather-codes.ts` | WMO code to emoji + label mapping |

## SEO & PWA

- `react-helmet-async` — dynamic `<title>` and OG meta tags per page in the browser
- `vite-plugin-seo.ts` — build-time plugin that generates per-route HTML files with correct `<head>` meta tags (title, description, og:title, og:description, og:url, canonical) for social media crawlers that don't execute JS. Also generates `sitemap.xml` with all known routes.
- `index.html` — generic "City Monitor" meta tags (fallback for crawlers on unregistered routes)
- `public/robots.txt` — allows all crawlers, references sitemap
- `public/manifest.json` — PWA manifest for installability
- `public/favicon.svg` — SVG favicon
