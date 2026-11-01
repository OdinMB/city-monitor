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

**Bundesagentur fur Arbeit (BA) Statistics API** - monthly unemployment key figures for Berlin.

- **URL:** `https://statistik-dr.arbeitsagentur.de/bifrontend/bids-api/ct/v1/tableFetch/csv/EckwerteTabelleALOBL?Bundesland=Berlin`
- **Auth:** None
- **Format:** CSV (semicolons, German number formatting)
- **Update:** Monthly
- **License:** Government open data

### Architecture

Berlin-only (hardcoded, like wastewater). The cron job fetches nothing when Berlin is not active.

- **Cron:** `ingest-labor-market` runs daily (7AM), conditional `runOnStart` based on DB freshness
- **DB:** Unified `snapshots` table, type `ba-labor-market` (one JSONB row per run), kept 730 days (`HISTORY_RETENTION` in `cron/data-retention.ts`) for the history endpoint
- **Cache key:** `berlin:labor-market`
- **TTL:** 86400 seconds (1 day)
- **API:** `GET /api/:city/labor-market` - `LaborMarketSummary`; `GET /api/:city/labor-market/history?range=Nd` - `HistoryPoint[]` (default 365d, max 730d, cached 86400s; the web `useLaborMarketHistory` hook exists but no component calls it)

### Shared Types

- `SocialAtlasFeatureProps` - properties on each GeoJSON feature (map layer)
- `LaborMarketSummary` - unemploymentRate, totalUnemployed, sgbIIRate, sgbIICount, underemploymentRate, underemploymentCount, yoyChangeAbsolute/Percent per indicator, reportMonth

### Dashboard Tile
- `LaborMarketStrip` - 3 headline percentages: overall unemployment rate, SGB II rate, and underemployment rate, each with count + YoY trend, plus report month
- Berlin-only: tile gated in `CommandLayout.tsx` (`cityId === 'berlin'`)
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
