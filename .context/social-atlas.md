# Social Atlas & Labor Market

## Social Atlas Map Layer (MSS 2025)

**Monitoring Soziale Stadtentwicklung (MSS) 2025** from Berlin Senate, served via WFS.

- **WFS URL:** `https://gdi.berlin.de/services/wfs/mss_2025` (switched from `mss_2023` on 2026-11-01; same fields)
- **License:** dl-de-zero-2.0 (free, no attribution required)
- **Data period:** data as of 31 Dec 2024 (`zeit` 202412), report 2025, WFS registered on daten.berlin.de 2026-10 (biennial; MSS 2027 next)
- **Granularity:** 535 valid of 542 Planungsräume (LOR 2021, the same areas as the population XLSX); MSS 2023 had 536

Two WFS layers are fetched and joined on `plr_id`. `mssLayerNames` derives them from the edition at the end of `wfsUrl`, so a new edition is a one-line change in `berlin.ts` as long as its fields stay the same:

| Layer | Purpose |
|-------|---------|
| `mss2025_indexind_542` | Raw indicators: unemployment (s1), single-parent (s2), welfare (s3), child poverty (s4), population (ew), geometry |
| `mss2025_indizes_542` | Composite status index: si_n (1-4 scale), si_v (verbal label) |

Features with `kom !== 'gültig'` (`ungültig (EW unter 300)`, `ungültig (Ausreißer)`) are filtered out. The population layer takes its PLR outlines from this layer's cache entry, so an area dropped here also drops from the population map.

### Architecture

- **Cron:** `ingest-social-atlas` runs weekly (Sunday 5AM), conditional `runOnStart` based on DB freshness
- **DB:** Unified `snapshots` table, type `mss-social-atlas`
- **Cache key:** `${cityId}:social-atlas:geojson` (full GeoJSON ~500KB)
- **TTL:** 604800 seconds (7 days)
- **City config:** `dataSources.socialAtlas: { provider: 'mss-wfs', wfsUrl: string }` - Berlin only
- **API:** `GET /api/:city/social-atlas` - full GeoJSON FeatureCollection (for map layer)

### Frontend Map Layer
- **DataLayer:** `'social'` - Berlin-only, gated by `cities: ['berlin']` in `DataLayerToggles.tsx` and `city.id === 'berlin'` in `CityMap.tsx`. Sub-layers (`SocialLayer`): `unemployment` (default), `single-parent`, `welfare`, `child-poverty` draw this choropleth; `rent` swaps it for the rent-map WMS overlay instead.
- **Lazy fetch:** GeoJSON only fetched while one of the four indicator sub-layers is on (`useSocialAtlas` with `enabled` flag)
- **Choropleth:** Fill layer colored by the selected indicator's percentage, each with its own 5-stop ramp (`SOCIAL_ATLAS_COLOR_RAMPS` in `map/constants.ts`) + thin line borders. The composite status index (`statusIndex`/`statusLabel`) is in the data but not drawn.
- **Popup:** Shows area name and all 4 indicator percentages (`socialAtlasPopupHtml`); no status index

## Labor Market Dashboard Tile (BA Monthly)

**Bundesagentur für Arbeit (BA) Statistics API** - monthly unemployment key figures (Eckwertetabelle) for all four cities.

- **Config:** `dataSources.laborMarket: { provider: 'ba', scope: 'bundesland' | 'kreis', name }`. `baTableUrl` turns it into `…/tableFetch/csv/EckwerteTabelleALOBL?Bundesland=<name>` (Land table) or `…/EckwerteTabelleALOKr?Kreis=<name>` (Kreis table), with `name` URL-encoded:

| City | Scope | `name` (the BA's spelling) | Encoded query |
|---|---|---|---|
| Berlin | `bundesland` | `Berlin` | `Bundesland=Berlin` |
| Hamburg | `bundesland` | `Hamburg` | `Bundesland=Hamburg` |
| Köln | `kreis` | `Köln, Stadt` | `Kreis=K%C3%B6ln%2C%20Stadt` |
| München | `kreis` | `München, Landeshauptstadt` | `Kreis=M%C3%BCnchen%2C%20Landeshauptstadt` |

- **Base URL:** `https://statistik-dr.arbeitsagentur.de/bifrontend/bids-api/ct/v1/tableFetch/csv/` (API documented at statistik.arbeitsagentur.de, "API-ALO"; the official area names are in `DR-LZR-persistListenfelderJSON.js`)
- **Kreis vs Land table:** same header and the same eight rows; only the metadata line reads `Kreis:;` instead of `Land:;`, which the parser ignores (it starts at "Ausgewählte Merkmale"). Verified live 2026-11-02, all four answering with October 2026. Use the Kreis table of a kreisfreie Stadt, never its Agentur für Arbeit district (AA München covers more than the city)
- **Auth:** None
- **Format:** CSV (semicolons, German number formatting)
- **Update:** Monthly
- **License:** the CSV footer allows storing and passing the data on with the source named, and asks web publications to link statistik.arbeitsagentur.de. The Sources page credits "© Statistik der Bundesagentur für Arbeit" with that link for each city (`baSource` in `SourcesPage.tsx`)

### Architecture

- **Cron:** `ingest-labor-market` runs daily (7AM), one request per active city with `dataSources.laborMarket`; a failing city is logged and skipped. Conditional `runOnStart` based on DB freshness (`serves`: cities with the source)
- **DB:** Unified `snapshots` table, type `ba-labor-market` (one JSONB row per city and run), kept 730 days (`HISTORY_RETENTION` in `cron/data-retention.ts`) for the history endpoint
- **Cache key:** `${cityId}:labor-market`
- **Tests:** `cron/fixtures/ba-eckwerte-koeln.csv` and `ba-eckwerte-muenchen.csv`, the Kreis tables recorded 2026-11-02
- **TTL:** 86400 seconds (1 day)
- **API:** `GET /api/:city/labor-market` - `LaborMarketSummary`; `GET /api/:city/labor-market/history?range=Nd` - `HistoryPoint[]` (default 365d, max 730d, cached 86400s; the web `useLaborMarketHistory` hook exists but no component calls it)

### Shared Types

- `SocialAtlasFeatureProps` - properties on each GeoJSON feature (map layer)
- `LaborMarketSummary` - unemploymentRate, totalUnemployed, sgbIIRate, sgbIICount, underemploymentRate, underemploymentCount, yoyChangeAbsolute/Percent per indicator, reportMonth

### Dashboard Tile
- `LaborMarketStrip` - 3 headline percentages: overall unemployment rate, SGB II rate, and underemployment rate, each with count + YoY trend, plus report month
- Shown for a city whose web config lists the `laborMarket` feature (`CommandLayout.tsx`); all four do
- Data pre-populated from bootstrap for instant display

### i18n
- Map layer: `sidebar.layers.social`, sub-layer labels under `sidebar.social.*`, popup labels under `mapPopup.socialAtlas.*`
- Dashboard tile: keys under `panel.laborMarket.*`
- All 4 languages: EN, DE, TR, AR

## Key Files

| File | Role |
|------|------|
| `packages/server/src/cron/ingest-social-atlas.ts` | MSS WFS fetch, join, transform, cache (map layer) |
| `packages/server/src/cron/ingest-labor-market.ts` | BA CSV fetch, parse, cache (dashboard tile) |
| `packages/server/src/routes/social-atlas.ts` | GeoJSON endpoint (map layer) |
| `packages/server/src/routes/labor-market.ts` | Labor market endpoint (dashboard tile) |
| `packages/web/src/hooks/useSocialAtlas.ts` | Lazy GeoJSON hook (map layer) |
| `packages/web/src/hooks/useLaborMarket.ts` | Labor market hook (dashboard tile) |
| `packages/web/src/components/strips/LaborMarketStrip.tsx` | Dashboard tile |
| `packages/web/src/components/map/layers/choropleth.ts` | `updateSocialAtlasLayer` and `socialAtlasPopupHtml` (map layer) |
