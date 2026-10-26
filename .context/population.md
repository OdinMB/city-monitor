# Population Demographics

## Data Source

**Amt für Statistik Berlin-Brandenburg** — semi-annual Einwohnerregisterstatistik (EWR) for Berlin, published as XLSX.

- **File pattern**: `SB_A01-16-00_{YYYY}h{01|02}_BE.xlsx`
- **Download base**: `https://download.statistik-berlin-brandenburg.de/` (hashed URL paths, see freshness inventory)
- **Current URL**: `https://download.statistik-berlin-brandenburg.de/1df9da7ea6dbfa3a/f6ac408f14cd/SB_A01-16-00_2025h02_BE.xlsx`
- **Snapshots**: h01 = June 30, h02 = December 31 (published ~3 months later)
- **Granularity**: 536 LOR Planungsräume
- **License**: CC-BY
- **Dependency**: `exceljs` npm package for XLSX parsing

### XLSX Structure

| Sheet | Contents |
|-------|----------|
| **Schlüssel** | PLR name lookup (BEZ, PGR, BZR, PLR, Planungsraumname) |
| **T2** | Population by age groups per PLR (total, under6, 6-15, 15-18, 18-27, 27-45, 45-55, 55-65, 65+, female, foreigners) |

Numbers use spaces as thousands separators. PLR-level rows are identified by all 4 geographic columns (BEZ, PGR, BZR, PLR) being filled numeric values — aggregation rows have text headers.

**Important**: The old CSV URLs (`/opendata/EWR_L21_*`) are broken. The site migrated to a Scrivito SPA that returns HTML for all `/opendata/` paths. Use XLSX files from the `download.` subdomain.

## Architecture

Berlin-only (hardcoded, same pattern as wastewater/labor market). The cron job fetches nothing when Berlin is not active.

- **Cron**: `ingest-population` — `0 6 1 * *` (monthly on the 1st at 6 AM; data is semi-annual but we check monthly)
- **DB**: Unified `snapshots` table, type `afstat-population` (data JSONB contains `{ geojson, summary }`)
- **Cache keys**: `${cityId}:population:geojson`, `${cityId}:population:summary`
- **TTL**: 3214080 seconds (37.2 days: the longest gap between runs, 31 days, × 1.2), so an entry lasts until the next run. Data retention deletes `afstat-population` rows after 7 days but keeps the newest one (`keepLatest`), so the routes' DB fallback and cache warming after a restart still find the latest data, and the next run has a previous snapshot for the change figure. Shared by ingestion, routes and cache warming as `POPULATION_TTL_SECONDS`
- **Bootstrap**: `populationSummary` (~200B) included in bootstrap for instant tile display
- **Lazy fetch**: GeoJSON (~500KB) fetched only when a population map sub-layer is active

### Ingestion Flow

1. Fetch XLSX from hardcoded URL (60s timeout)
2. Parse sheets T2 (age groups) and Schlüssel (PLR names) via ExcelJS
3. For each PLR: extract total, youth (0-17), elderly (65+), foreign count
4. Read PLR polygon geometry from social atlas cache (`CK.socialAtlasGeojson`)
5. Compute density via geodetic Shoelace formula (latitude-corrected polygon area)
6. Build GeoJSON FeatureCollection with `PopulationFeatureProps` per feature
7. Aggregate city-wide `PopulationSummary` (weighted percentages)
8. Compare with previous DB snapshot for change calculation
9. Write to DB + cache

## API Endpoints

| Endpoint | Response | Cache-Control |
|----------|----------|---------------|
| `GET /api/:city/population` | GeoJSON FeatureCollection (~500KB) | 12h |
| `GET /api/:city/population/summary` | `PopulationSummary` (~200B) | 12h |

Both follow the 3-tier pattern: cache → DB fallback → null.

## Shared Types

- `PopulationFeatureProps` — per-PLR GeoJSON properties: plrId, plrName, population, density, foreignPct, elderlyPct, youthPct
- `PopulationSummary` — city aggregate: total, density, foreignTotal/Pct, elderlyPct, youthPct, workingAgePct, changeAbsolute/Pct, snapshotDate

## Frontend

### Map Layer

The Berlin-only `population` data layer (its own sidebar toggle, `cities: ['berlin']` in `DataLayerToggles.tsx`) has 3 choropleth sub-layers, one active at a time (`PopulationLayer` in `useCommandCenter.ts`, default `pop-density`). It is independent of the `social` layer; both can be on at once:

| Sub-layer | Property | Color Ramp |
|-----------|----------|------------|
| `pop-density` | `density` | Blue (0 → 30000/km²) |
| `pop-elderly` | `elderlyPct` | Amber (0% → 40%) |
| `pop-foreign` | `foreignPct` | Cyan (0% → 50%) |

Popup shows PLR name + all 5 metrics for any sub-layer.

### Dashboard Tile

`PopulationStrip` — not expandable, Berlin-only, gated in `CommandLayout.tsx` (services row). Shows total population with the change since the previous snapshot, an age donut (youth/working age/elderly), density, foreign population share, and a footnote with the snapshot date.

## Key Files

| File | Role |
|------|------|
| `packages/server/src/cron/ingest-population.ts` | XLSX fetch, parse, GeoJSON build, cache + DB write |
| `packages/server/src/cron/ingest-population.test.ts` | 8 unit tests with mock XLSX |
| `packages/server/src/routes/population.ts` | REST endpoints (GeoJSON + summary) |
| `packages/server/src/routes/population.test.ts` | 5 integration tests |
| `packages/web/src/hooks/usePopulation.ts` | Lazy GeoJSON hook (map layer) |
| `packages/web/src/hooks/usePopulationSummary.ts` | Summary hook (dashboard tile) |
| `packages/web/src/components/strips/PopulationStrip.tsx` | Dashboard tile |
| `packages/web/src/components/map/layers/choropleth.ts` | `updatePopulationLayer` and `populationPopupHtml` (map layer) |

## i18n

- Sidebar: `sidebar.layers.population`, sub-layers `sidebar.population.pop-density`, `sidebar.population.pop-elderly`, `sidebar.population.pop-foreign`
- Tile: `panel.population.*` (title, total, foreign, elderly, youth, workingAge, ageBreakdown, change, empty, source, density, densityLabel, german)
- All 4 languages: EN, DE, TR, AR
