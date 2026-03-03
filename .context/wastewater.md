# Wastewater Monitoring

Berlin wastewater viral load monitoring from Lageso/Berliner Wasserbetriebe open data.

## Data Source

- **CSV URL:** `https://data.lageso.de/infektionsschutz/opendata/abwassermonitoring/BEWAC_abwassermonitoring_berlin.csv`
- **Format:** Semicolon-delimited, German decimal format (comma), quoted fields
- **Pathogens:** Influenza A, Influenza B, RSV
- **Plants:** 3 treatment plants (Ruhleben, Schönerlinde, Waßmannsdorf) covering ~84% of Berlin
- **Update frequency:** Weekly samples, CSV updated daily
- **License:** Datenlizenz Deutschland – Namensnennung – Version 2.0

## Architecture

Cache-only pattern (no DB table). Ingestion fetches the full CSV, parses all rows, and computes a summary comparing the latest and previous sample dates.

### Ingestion (`packages/server/src/cron/ingest-wastewater.ts`)

- Fetches CSV, parses semicolon-delimited rows with German decimal handling
- Groups by date + pathogen, averages Messwert across plants
- Computes trend by comparing latest vs previous week (rising >1.5x, falling <0.67x, stable otherwise; "new" if previous=0, "gone" if current=0)
- Cache key: `berlin:wastewater:summary` (7-day TTL)
- Cron schedule: `0 6 * * *` (daily at 6 AM), `runOnStart: true`

### Route (`packages/server/src/routes/wastewater.ts`)

- `GET /:city/wastewater` — returns `WastewaterSummary | null`
- Cache-only, no DB fallback
- `Cache-Control: 43200` (12 hours)

### Frontend

- Hook: `useWastewater(cityId, enabled)` — 24h polling, 12h stale
- Strip: `WastewaterStrip({ expanded })` — Berlin-only gate, expandable tile
  - **Collapsed:** horizontal row showing each pathogen with level badge and trend arrow (e.g. "Flu A High →")
  - **Expanded:** vertically stacked pathogens with bold name titles, compact measurement values (gc/L with k/M suffixes), level/trend badges, full-width sparkline charts (12-week history), and date labels
- Tile placed after Air Quality in dashboard grid, `defaultExpanded={isDesktop}`
- Bootstrap seeded via `wastewater` field

## Shared Types

```typescript
interface WastewaterPathogen {
  name: string;
  value: number;           // avg gene copies/L (latest week)
  previousValue: number;   // avg gene copies/L (previous week)
  trend: 'rising' | 'falling' | 'stable' | 'new' | 'gone';
}

interface WastewaterSummary {
  sampleDate: string;
  pathogens: WastewaterPathogen[];
  plantCount: number;
}
```

## Berlin-Only

Hardcoded to Berlin (single CSV URL). No `CityDataSources` config entry — gated by `cityId === 'berlin'` in the frontend strip and tile.
