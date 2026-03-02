# Batch Implementation Follow-Up (Plans 1-7)

## User Input Needed

1. **Plan 1 — Geocoding approach**: The current implementation uses LLM-only geocoding (gpt-5-nano generates coordinates directly). User raised concern about accuracy of small LLMs for coordinate generation. Alternative: Use LLM to extract location names, then call Nominatim (free OSM geocoding API, no key needed) for precise coordinates. This would be a targeted change in `filterAndGeolocateNews()` and `geolocateReports()` — extract location text from LLM, then resolve via `https://nominatim.openstreetmap.org/search?q={location},{city}&format=json`. Decision needed: stick with LLM-only MVP or switch to LLM+Nominatim hybrid?

## DB Migrations

1. **Plan 1 — safetyReports table**: Added `lat real`, `lon real`, `location_label text` columns to `safety_reports` table. Run: `npm run db:generate` then `npm run db:migrate` from `packages/server`.

## Files to Delete

_(Files that should be deleted after user confirmation)_

## Implementation Issues

_(Problems encountered during implementation)_
