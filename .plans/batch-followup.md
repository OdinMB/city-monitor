# Batch Implementation Follow-Up (Plans 1-7)

## User Input Needed

1. **Plan 1 — Geocoding approach**: The current implementation uses LLM-only geocoding (gpt-5-nano generates coordinates directly). User raised concern about accuracy of small LLMs for coordinate generation. Alternative: Use LLM to extract location names, then call Nominatim (free OSM geocoding API, no key needed) for precise coordinates. This would be a targeted change in `filterAndGeolocateNews()` and `geolocateReports()` — extract location text from LLM, then resolve via `https://nominatim.openstreetmap.org/search?q={location},{city}&format=json`. Decision needed: stick with LLM-only MVP or switch to LLM+Nominatim hybrid?
2. **Plan 5 — aponet.de API token**: The pharmacy ingestion uses aponet.de's JSON API (TYPO3 `type=1981` endpoint) with a public widget token from the MagicMirror community. This token may be revoked at any time. Set `APONET_TOKEN` env var to override. If the token stops working, alternatives: (a) register for official apotheken.de API (paid), (b) find a different source. The scraper needs live testing to confirm it works correctly.
3. **Plan 6 — TomTom API key required**: Traffic incidents require `TOMTOM_API_KEY` env var. Register at https://developer.tomtom.com (free tier: 2,500 API + 50K tile requests/day). The cron job gracefully skips when no key is set. Traffic flow raster tiles (visual speed overlay) are not yet implemented — only incident markers.
4. **Plan 7 — GeoJSON boundaries**: The political map currently uses existing Bezirke GeoJSON for district-level political coloring. Bundestag and state constituency GeoJSON boundary files need to be sourced from bundeswahlleiterin.de (Bundestag Wahlkreise), daten.berlin.de (AGH Wahlkreise), and transparenz.hamburg.de (Bürgerschaft Wahlkreise). Convert shapefiles to GeoJSON, simplify geometry (<500KB per file), and add to `packages/web/src/data/districts/`. Currently the Bundestag and Landesparlament sub-layers are wired up but don't have their own map boundaries — they show political data on the existing district polygons.
5. **Plan 7 — Parliament period IDs**: The abgeordnetenwatch parliament period IDs in `ingest-political.ts` (Bundestag: 161) will need updating after each federal election. The state parliament period IDs are fetched dynamically. Consider adding these as env vars or config values.

## DB Migrations

1. **Plan 1 — safetyReports table**: Added `lat real`, `lon real`, `location_label text` columns to `safety_reports` table. Run: `npm run db:generate` then `npm run db:migrate` from `packages/server`.
2. **Plan 3 — ninaWarnings table**: New `nina_warnings` table with city_id, warning_id, version, source, severity, headline, description, instruction, start_date, expires_at, area (jsonb). Run: `npm run db:generate` then `npm run db:migrate` from `packages/server`.

## Files to Delete

_(Files that should be deleted after user confirmation)_

## Implementation Issues

_(Problems encountered during implementation)_
