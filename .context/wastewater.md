# Wastewater Monitoring

Berlin wastewater viral load monitoring from two sources: Lageso (Flu A/B, RSV) and AMELAG/RKI (SARS-CoV-2).

## Data Sources

### Lageso BEWAC (primary)
- **CSV URL:** `https://data.lageso.de/infektionsschutz/opendata/abwassermonitoring/BEWAC_abwassermonitoring_berlin.csv`
- **Format:** Semicolon-delimited, German decimal format (comma), quoted fields
- **Pathogens:** Influenza A, Influenza B, RSV
- **Plants:** 3 treatment plants (Ruhleben, Schonerlinde, Wassmannsdorf) covering ~84% of Berlin
- **Update frequency:** Weekly samples, CSV updated daily
- **License:** Datenlizenz Deutschland - Namensnennung - Version 2.0

### AMELAG (supplementary, SARS-CoV-2 only)
- **TSV URL:** `https://raw.githubusercontent.com/robert-koch-institut/Abwassersurveillance_AMELAG/main/amelag_einzelstandorte.tsv`
- **Format:** Tab-separated, ~27 MB (nationwide), stream-parsed filtering for `bundesland=BE` + `typ=SARS-CoV-2`
- **Pathogens:** SARS-CoV-2 (also has Flu A/B, RSV A/B but we use Lageso for those)
- **Plants:** Same Berlin plants as Lageso (filtered by bundesland)
- **Update frequency:** Weekly (~Wednesdays), up to 2-week lag from sampling to publication
- **License:** CC-BY 4.0 (Robert Koch Institut)
- **Memory:** Stream-parsed line-by-line to avoid loading full file into memory (~1-2 MB peak vs ~80-135 MB naive)

## Architecture

Ingestion fetches the Lageso CSV (small, fast) then the AMELAG TSV (large, stream-parsed). SARS-CoV-2 is merged into the Lageso summary before caching. AMELAG failure is non-blocking — Lageso data is cached regardless.

### Ingestion (`packages/server/src/cron/ingest-wastewater.ts`)

- Fetches Lageso CSV, parses semicolon-delimited rows with German decimal handling
- Groups by date + pathogen, averages Messwert across plants
- Computes trend by comparing latest vs previous week (rising >1.5x, falling <0.67x, stable otherwise; "new" if previous=0, "gone" if current=0)
- Then fetches AMELAG TSV via `parseAmelagBerlinCovid()` — stream reads response body, filters for `bundesland=BE` + `typ=SARS-CoV-2`, discards all other rows
- Builds SARS-CoV-2 pathogen via `buildCovidPathogen()` with same trend/level/history logic
- Merges into summary; sets `sampleDate` on the pathogen only if AMELAG date differs from Lageso
- DB: Unified `snapshots` table, type `lageso-wastewater` (JSONB snapshot, one row per city)
- Cache key: `berlin:wastewater:summary` (7-day TTL)
- Cron schedule: `0 6 * * *` (daily at 6 AM), conditional `runOnStart` based on DB freshness
- Exported helpers: `computeTrend`, `computeLevel`, `parseAmelagBerlinCovid`, `buildCovidPathogen`

### Route (`packages/server/src/routes/wastewater.ts`)

- `GET /:city/wastewater` — returns `WastewaterSummary | null`
- Cache-first, DB fallback, then null
- `Cache-Control: 43200` (12 hours)

### Frontend

- Hook: `useWastewater(cityId, enabled)` — 24h polling, 12h stale
- Strip: `WastewaterStrip({ expanded })` — Berlin-only gate, expandable tile
  - **Collapsed:** horizontal row showing each pathogen with level badge and trend arrow (e.g. "Flu A High ->")
  - **Expanded:** vertically stacked pathogens with bold name titles, compact measurement values (gc/L with k/M suffixes), level/trend badges, full-width sparkline charts (12-week history), date labels, and per-pathogen sample date when it differs from the main date
- Tile placed after Air Quality in dashboard grid, `defaultExpanded={isDesktop}`
- Bootstrap seeded via `wastewater` field

## Shared Types

```typescript
interface WastewaterPathogen {
  name: string;
  value: number;           // avg gene copies/L (latest week)
  previousValue: number;   // avg gene copies/L (previous week)
  trend: 'rising' | 'falling' | 'stable' | 'new' | 'gone';
  level: 'none' | 'low' | 'moderate' | 'high';
  history: number[];       // last 12 weeks, oldest first
  sampleDate?: string;     // per-pathogen date when it differs from summary sampleDate (AMELAG lag)
}

interface WastewaterSummary {
  sampleDate: string;
  pathogens: WastewaterPathogen[];
  plantCount: number;
}
```

## Berlin-Only

Hardcoded to Berlin (Lageso CSV is Berlin-only; AMELAG filtered to `bundesland=BE`). No `CityDataSources` config entry — gated by `cityId === 'berlin'` in the frontend strip and tile; the cron job fetches nothing when Berlin is not active. Hamburg AMELAG data (`bundesland=HH`) could be added later with the same stream parser.
