# Social Atlas & Labor Market

## Social Atlas Map Layer (MSS 2023)

**Monitoring Soziale Stadtentwicklung (MSS) 2023** from Berlin Senate, served via WFS.

- **WFS URL:** `https://gdi.berlin.de/services/wfs/mss_2023`
- **License:** dl-de-zero-2.0 (free, no attribution required)
- **Data period:** 2020-2022 observation, published 2023 (biennial)
- **Granularity:** 536 valid Planungsraume (smallest LOR planning area unit)

Two WFS layers are fetched and joined on `plr_id`:

| Layer | Purpose |
|-------|---------|
| `mss2023_indexind_542` | Raw indicators: unemployment (s1), single-parent (s2), welfare (s3), child poverty (s4), population (ew), geometry |
| `mss2023_indizes_542` | Composite status index: si_n (1-4 scale), si_v (verbal label) |

Features with `kom !== 'gultig'` (uninhabited areas) are filtered out.

### Architecture

Cache-only (no Postgres table).

- **Cron:** `ingest-social-atlas` runs weekly (Sunday 5AM), `runOnStart: true`
- **Cache key:** `${cityId}:social-atlas:geojson` (full GeoJSON ~500KB)
- **TTL:** 604800 seconds (7 days)
- **City config:** `dataSources.socialAtlas: { provider: 'mss-wfs', wfsUrl: string }` - Berlin only
- **API:** `GET /api/:city/social-atlas` - full GeoJSON FeatureCollection (for map layer)

### Frontend Map Layer
- **DataLayer:** `'social-atlas'` - Berlin-only, gated by `cities: ['berlin']`
- **Lazy fetch:** GeoJSON only fetched when user toggles the layer on (`useSocialAtlas` with `enabled` flag)
- **Choropleth:** Fill layer colored by composite status index (1=green, 2=yellow, 3=orange, 4=red) + thin line borders
- **Popup:** Shows area name, status badge, and all 4 indicator percentages

## Labor Market Dashboard Tile (BA Monthly)

**Bundesagentur fur Arbeit (BA) Statistics API** - monthly unemployment key figures for Berlin.

- **URL:** `https://statistik-dr.arbeitsagentur.de/bifrontend/bids-api/ct/v1/tableFetch/csv/EckwerteTabelleALOBL?Bundesland=Berlin`
- **Auth:** None
- **Format:** CSV (semicolons, German number formatting)
- **Update:** Monthly
- **License:** Government open data

### Architecture

Cache-only, Berlin-only (hardcoded, like wastewater).

- **Cron:** `ingest-labor-market` runs daily (7AM), `runOnStart: true`
- **Cache key:** `berlin:labor-market`
- **TTL:** 86400 seconds (1 day)
- **API:** `GET /api/:city/labor-market` - `LaborMarketSummary`

### Shared Types

- `SocialAtlasFeatureProps` - properties on each GeoJSON feature (map layer)
- `LaborMarketSummary` - unemploymentRate, totalUnemployed, sgbIIRate, sgbIICount, underemploymentRate, underemploymentCount, yoyChangeAbsolute/Percent per indicator, reportMonth

### Dashboard Tile
- `LaborMarketStrip` - 3 headline percentages: overall unemployment rate, SGB II rate, and underemployment rate, each with count + YoY trend, plus report month
- Berlin-only: tile gated in `CommandLayout.tsx` (`cityId === 'berlin'`)
- Data pre-populated from bootstrap for instant display

### i18n
- Map layer: keys under `sidebar.layers.social-atlas`
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
| `packages/web/src/components/map/CityMap.tsx` | `updateSocialAtlasLayer` function |
