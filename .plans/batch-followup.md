# Batch Implementation Follow-Up (Plans 1-7)

## User Input Needed

1. ~~**Plan 1 — Geocoding approach**~~: RESOLVED — Switched to LLM+Nominatim hybrid. LLM extracts location names, Nominatim resolves to coordinates. New module: `packages/server/src/lib/nominatim.ts`.
2. **Plan 5 — aponet.de API token**: ACKNOWLEDGED — Uses aponet.de JSON API (TYPO3 `type=1981`) with a public community token. Overridable via `APONET_TOKEN` env var. User understands the risk.
3. ~~**Plan 6 — TomTom API key required**~~: RESOLVED — User has set `TOMTOM_API_KEY` in `.env`.
4. ~~**Plan 7 — GeoJSON boundaries**~~: RESOLVED — Plan written at `.plans/08-geojson-boundaries.md` for sourcing and integrating constituency boundary files.
5. ~~**Plan 7 — Parliament period IDs**~~: RESOLVED — Bundestag period ID now fetched dynamically via `fetchCurrentPeriod()`, same as state parliaments. No more hardcoded period IDs.

## DB Migrations

1. ~~**Plans 1+3 — schema changes**~~: RESOLVED — Applied via `db:push` (dev). Schema includes safety_reports lat/lon/location_label columns and nina_warnings table.

## Files to Delete

_(None)_

## Implementation Issues

_(None)_
