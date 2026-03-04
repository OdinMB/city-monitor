# Data Sources

## New Data Source Checklist

Follow every step when adding a new data source. Skip items marked with a surface qualifier (map/tile) if that surface doesn't apply.

### Server

1. **Shared types** — add data interfaces to `shared/types.ts`
2. **Cache keys** — add typed key(s) to `packages/server/src/lib/cache-keys.ts` (`CK.*`). If the data is small and should load instantly, add to `bootstrapKeys`. If large (>50KB), exclude and lazy-fetch.
3. **DB table** — add snapshot table to `packages/server/src/db/schema.ts` (follow INSERT-only pattern)
4. **DB writes** — add save function to `packages/server/src/db/writes.ts`
5. **DB reads** — add load function to `packages/server/src/db/reads.ts`
6. **Cron job** — create `packages/server/src/cron/ingest-<name>.ts` with factory function
7. **REST endpoint** — create `packages/server/src/routes/<name>.ts` with 3-tier read (cache → DB → null)
8. **App registration** — in `packages/server/src/app.ts`: import + instantiate cron, add `FRESHNESS_SPECS` entry, register cron job with schedule, mount route with `cacheFor()`
9. **Cache warming** — add to `packages/server/src/db/warm-cache.ts` (in the Berlin-only block if Berlin-only)
10. **Bootstrap** (if included) — add field to bootstrap response in `packages/server/src/routes/news.ts`

### Frontend

11. **API client** — re-export types from `shared` and add `api.get*()` method in `packages/web/src/lib/api.ts`. Extend `BootstrapData` if bootstrapped.
12. **Data hook** — create `packages/web/src/hooks/use<Name>.ts` (follow `useSocialAtlas` or `useLaborMarket` pattern)
13. **Bootstrap seeding** (if bootstrapped) — add `setQueryData` line in `packages/web/src/hooks/useBootstrap.ts`
14. **Zustand state** (map layer) — extend layer types in `packages/web/src/hooks/useCommandCenter.ts`
15. **Sidebar toggles** (map layer) — add sub-layer entry in `packages/web/src/components/sidebar/DataLayerToggles.tsx`
16. **Map rendering** (map layer) — add `update*Layer()` function + reactive wiring in `packages/web/src/components/map/CityMap.tsx`
17. **Dashboard tile** (tile) — create strip component in `packages/web/src/components/strips/<Name>Strip.tsx`, mount in `packages/web/src/components/layout/CommandLayout.tsx`
18. **i18n** — add translation keys in all 4 locale files (`en.json`, `de.json`, `tr.json`, `ar.json`)

### Favicons (if adding news feeds)

19. **Favicon slugs** — add source name → slug mapping to `FAVICON_SLUGS` in `packages/web/src/components/strips/NewsStrip.tsx` and slug → domain mapping to `FAVICON_SOURCES` in `packages/web/scripts/fetch-favicons.ts`. Run `npx tsx packages/web/scripts/fetch-favicons.ts` and commit the new PNGs from `packages/web/public/favicons/`.

### Documentation & Attribution

20. **Sources page** — add entry to `SHARED_SOURCES`, `BERLIN_SOURCES`, or `HAMBURG_SOURCES` in `packages/web/src/pages/SourcesPage.tsx`
21. **Context file** — create `.context/<name>.md` documenting the data source, ingestion pipeline, cache keys, endpoint shapes
22. **CLAUDE.md** — add a one-line reference to the new context file in the "Context Files" section
23. **Data freshness note** — if the source uses a hardcoded URL that changes periodically (XLSX files, biennial WFS layer names, budget CSVs), add an entry to the Data Freshness Inventory below with the check schedule

### Testing

24. **Unit tests** — test CSV/XLSX/JSON parsing logic with mock data, test summary aggregation, test edge cases (empty data, malformed rows)
25. **Integration test** — test REST endpoint with mock cache/DB

### DB Migration (production)

26. **Generate migration** — `npm run db:generate` from `packages/server`
27. **Apply migration** — `npm run db:migrate` (or `db:push` in dev)

---

## Data Freshness Inventory

Sources with **hardcoded URLs or version-pinned data** that need periodic manual checks. Real-time APIs with stable endpoints (Open-Meteo, PEGELONLINE, VBB, etc.) are not listed — they self-update.

| Source | Current URL/Version | Update Cycle | When to Check | Notes |
|--------|-------------------|--------------|---------------|-------|
| **MSS Social Atlas** | WFS layer `mss_2023` | Biennial | Q1 of odd years (next: Q1 2027) | Layer name changes with each edition (e.g., `mss_2025`). Update `wfsUrl` in `berlin.ts` and WFS layer names in `ingest-social-atlas.ts`. |
| **Berlin Budget CSV** | `260223_doppelhaushalt_2026_2027.csv` | Biennial | When new Doppelhaushalt is published (next: late 2027) | URL and filename change with each budget cycle. Update `csvUrl` in `berlin.ts`. |
| **Berlin Rent Map WMS** | Wohnlagenkarte 2024 | Annual | Q1 each year | WMS layer name may change. Check `daten.berlin.de` for updated layer. |
| **LAGeSo Bathing CSV** | `data.lageso.de/baden/0_letzte/letzte.csv` | Seasonal (May–Sep) | Start of each bathing season | URL is stable but data stops updating in winter. |
| **abgeordnetenwatch** | API v2 | Per election cycle | After federal/state/local elections | Constituency IDs and parliament IDs change with redistricting. |
| **Population XLSX (EWR)** | `SB_A01-16-00_2025h02_BE.xlsx` | Semi-annual (h01=Jun, h02=Dec) | Q1 and Q3 each year (published ~3 months after snapshot) | URL contains hash segments that change per edition. Update hardcoded URL in `ingest-population.ts`. |
| **Bezirksbürgermeister** | Hardcoded array in `ingest-political.ts` | Per election cycle | After Berlin local elections (next: 2028) | Names, parties, and profile URLs of 12 district mayors are hardcoded. Must be manually updated after each BVV election. |

---

## Research: Potential New Data Sources (2026-03-03)

- Bike-sharing stations (nextbike/Lime GBFS feeds — standardized, real-time)
- ~~Parking availability~~ — researched 2026-03-04, no real-time data for Berlin (no Parkleitsystem); static WFS data exists but low value for real-time dashboard
- Energy generation (solar/wind dashboards from Bundesnetzagentur SMARD API)
- Public WiFi hotspots (Berlin has a static dataset)
- EV charging stations (Bundesnetzagentur has a register)
- School closures / Kita strikes (no good API, would need scraping)
- City council meeting agendas (some cities use Allris with semi-structured data)

---

## Berliner Feuerwehr — FEASIBLE (Daily Stats)

- **Source:** GitHub Open Data — `https://github.com/Berliner-Feuerwehr/BF-Open-Data`
- **License:** CC-BY-4.0
- **Format:** CSV files updated daily

### Datasets
- **Per-mission:** `mission_data_set_open_data_YYYY.csv` — date, type, dispatch code, severity, district, response time, units
- **Daily aggregates:** `BFw_mission_data_daily.csv` — total calls by category, response time stats

### Limitations
- **District-level location only** — no street addresses or coordinates
- Daily update cadence (0-24h stale)
- CSV grows throughout the year (13+ MB)

**Best for:** KPI tiles (daily call count, avg response time, type breakdown). Not suitable for map pins.

---

## Parking Availability — NOT FEASIBLE (No Real-Time Data)

Researched 2026-03-04. Full analysis: `.plans/completed/2026-03-04_parking-map-layer.md`

- **Real-time:** Berlin has no Parkleitsystem. No public API from any garage operator (APCOA, Contipark, Q-Park). Not in ParkAPI v3, not on Mobilithek. LiveParking.eu has Hamburg but not Berlin (and is "all rights reserved").
- **Static WFS (dl-de-zero-2.0):** Street parking (45,917 polygons), managed zones (100 polygons with fees/hours), P+R (48 points with surveyed occupancy), disabled parking (912 points). All verified working at `gdi.berlin.de/services/wfs/`.
- **Verdict:** Without real-time occupancy, static parking zones add little value to a real-time dashboard. Revisit if Berlin deploys a Parkleitsystem (eUVM project may lead to this, no timeline).

---

## Hospital Emergency Rooms — PARTIALLY FEASIBLE

### Static Layer (Easy)
- **WFS endpoint:** `https://gdi.berlin.de/services/wfs/krankenhaeuser?service=WFS&version=2.0.0&request=GetFeature&typeNames=krankenhaeuser:plankrankenhaeuser&outputFormat=application/json&srsName=EPSG:4326`
- **License:** DL-DE-Zero (free)
- **Data:** 64 plan hospitals with coordinates, bed counts, addresses, districts
- **ER hospitals:** 37 total (6 Notfallzentren + 31 Notfallkrankenhäuser) — cross-reference with official list at berlin.de/sen/gesundheit

### Real-Time Wait Times (Scraping Only)
**Vivantes** (8 hospitals, ~1/3 of Berlin ER capacity) publishes live data:
- Average wait time (rolling 6h), patients waiting, ambulance arrivals, critical cases
- Server-side rendered HTML — no JSON API
- No other hospital group publishes ER data
- IVENA (the real dispatching system) is closed to public