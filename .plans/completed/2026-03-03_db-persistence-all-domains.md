# Add DB Persistence to All Cache-Only Domains

## Goal
Add PostgreSQL persistence (JSONB snapshot pattern) to the 9 remaining cache-only domains so data survives server restarts.

## Domains

| # | Domain | Type | Cache Key | Notes |
|---|--------|------|-----------|-------|
| 1 | Budget | `BudgetSummary` | `${cityId}:budget` | per-city |
| 2 | Construction | `ConstructionSite[]` | `${cityId}:construction:sites` | per-city |
| 3 | Traffic | `TrafficIncident[]` | `${cityId}:traffic:incidents` | per-city |
| 4 | Pharmacies | `EmergencyPharmacy[]` | `${cityId}:pharmacies:emergency` | per-city |
| 5 | AEDs | `AedLocation[]` | `${cityId}:aed:locations` | per-city |
| 6 | Social Atlas | GeoJSON FeatureCollection | `${cityId}:social-atlas:geojson` | per-city |
| 7 | Wastewater | `WastewaterSummary` | `berlin:wastewater:summary` | hardcoded Berlin |
| 8 | Bathing | `BathingSpot[]` | `berlin:bathing:spots` | hardcoded Berlin |
| 9 | Labor Market | `LaborMarketSummary` | `berlin:labor-market` | hardcoded Berlin |

## Pattern (same as appointments/water-levels)

1. **schema.ts** — Add JSONB snapshot table with `id`, `cityId`, `data (jsonb)`, `fetchedAt`, city index
2. **writes.ts** — Add `saveX()` (delete-then-insert transaction)
3. **reads.ts** — Add `loadX()` (select where cityId, limit 1)
4. **ingest-X.ts** — Accept `db` param, call save after cache set
5. **routes/X.ts** — Accept `db`, add async DB fallback (cache → DB → empty default)
6. **warm-cache.ts** — Load from DB, set in cache
7. **app.ts** — Wire `db` through to ingestion + route

## Files Modified

- `packages/server/src/db/schema.ts` — 9 new tables
- `packages/server/src/db/writes.ts` — 9 new save functions
- `packages/server/src/db/reads.ts` — 9 new load functions
- `packages/server/src/cron/ingest-{budget,construction,traffic,pharmacies,aeds,social-atlas,wastewater,bathing,labor-market}.ts` — accept `db`
- `packages/server/src/routes/{budget,construction,traffic,pharmacies,aeds,social-atlas,wastewater,bathing,labor-market}.ts` — async DB fallback
- `packages/server/src/db/warm-cache.ts` — 9 new warming tasks
- `packages/server/src/app.ts` — wire `db` to all 9
