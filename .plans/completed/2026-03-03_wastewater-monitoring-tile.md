# Wastewater Monitoring Tile

## Goal

Add a small dashboard tile (span=1) showing viral loads in Berlin's wastewater (Influenza A, Influenza B, RSV) from the Lageso/Berliner Wasserbetriebe open data CSV.

## Data Source

- **URL:** `https://data.lageso.de/infektionsschutz/opendata/abwassermonitoring/BEWAC_abwassermonitoring_berlin.csv`
- **Format:** Semicolon-delimited CSV, German decimals (comma), quoted fields
- **Update frequency:** Weekly (new samples each week)
- **Structure:** One row per pathogen per treatment plant per sample date
- **Columns:** Probennummer, Datum, Klärwerk, UWW_Code, UWW_Name, Durchfluss, Abwasser_Temperatur, Abwasser_pH, Methode, Erreger, Target, Messwert
- **Pathogens:** Influenza A, Influenza B, RSV
- **Plants:** Klärwerk Ruhleben, Schönerlinde, Waßmannsdorf (~84% of Berlin households)
- **License:** Datenlizenz Deutschland – Namensnennung – Version 2.0 (attribution: Lageso Berlin + Berliner Wasserbetriebe)

## Architecture: Cache-Only Pattern

Same as Social Atlas — no DB table, cache is the only store. Data changes weekly, no need for historical persistence.

## Shared Types (`shared/types.ts`)

```typescript
interface WastewaterPathogen {
  name: string;          // "Influenza A" | "Influenza B" | "RSV"
  value: number;         // avg gene copies/L across plants (latest week)
  previousValue: number; // avg gene copies/L (previous week)
  trend: 'rising' | 'falling' | 'stable' | 'new' | 'gone';
}

interface WastewaterSummary {
  sampleDate: string;           // ISO date of latest sample
  pathogens: WastewaterPathogen[];
  plantCount: number;           // number of plants sampled
}
```

No `CityDataSources` config entry needed — just gate on `cityId === 'berlin'` since this is a single fixed CSV URL.

## Server Changes

### 1. Cron: `packages/server/src/cron/ingest-wastewater.ts`

- Factory: `createWastewaterIngestion(cache)` — cache-only, no DB
- Fetch CSV, parse with semicolon delimiter and German decimal handling
- Group rows by (Datum, Erreger), average Messwert across plants per pathogen per date
- Find the latest date and the previous date
- Compute trend: latest vs previous (rising if >1.5x, falling if <0.67x, stable otherwise; "new" if previous=0 and current>0, "gone" if current=0 and previous>0)
- `cache.set('berlin:wastewater:summary', summary, 604800)` — 7 day TTL
- Schedule: `'0 6 * * *'` (daily at 6 AM, data updates weekly so daily is plenty), `runOnStart: true`

### 2. Route: `packages/server/src/routes/wastewater.ts`

- `createWastewaterRouter(cache)` — cache-only pattern
- `GET /:city/wastewater` → returns `WastewaterSummary | null`

### 3. App wiring (`packages/server/src/app.ts`)

- Import + create ingestion + register cron job + mount route with `cacheFor(43200)` (12h)

### 4. Bootstrap (`packages/server/src/routes/news.ts`)

- Add `berlin:wastewater:summary` to `getBatch` keys
- Add `wastewater` field to bootstrap response

## Frontend Changes

### 5. API client (`packages/web/src/lib/api.ts`)

- Add `WastewaterSummary` type re-export
- Add `wastewater` field to `BootstrapData`
- Add `getWastewater(city)` method

### 6. Bootstrap hook (`packages/web/src/hooks/useBootstrap.ts`)

- Seed `['wastewater', cityId]` from bootstrap data

### 7. Hook: `packages/web/src/hooks/useWastewater.ts`

- `useWastewater(cityId, enabled)` — poll every 24h, stale after 12h

### 8. Strip: `packages/web/src/components/strips/WastewaterStrip.tsx`

- Guard: `if (!isBerlin) return null`
- Show 3 columns, one per pathogen:
  - Pathogen name (Flu A, Flu B, RSV)
  - Current detection level (formatted number or "–" if 0)
  - Trend arrow (↑ ↓ → or color-coded dot)
- Small text: sample date

### 9. Dashboard layout (`packages/web/src/components/layout/CommandLayout.tsx`)

- Add `<Tile>` with `<WastewaterStrip />` inside Berlin city gate, placed after Air Quality tile

### 10. i18n (all 4 locale files)

- Add `panel.wastewater.*` keys:
  - `title`: "Wastewater Monitoring" / "Abwassermonitoring" / etc.
  - `empty`: "No data available"
  - `fluA`, `fluB`, `rsv`: pathogen labels
  - `trend.rising`, `trend.falling`, `trend.stable`, `trend.new`, `trend.gone`
  - `detected`, `notDetected`
  - `copiesPerL`: unit label
  - `sampleDate`: "Sample: {{date}}"

## Files to Create (5)

1. `packages/server/src/cron/ingest-wastewater.ts`
2. `packages/server/src/cron/ingest-wastewater.test.ts`
3. `packages/server/src/routes/wastewater.ts`
4. `packages/server/src/routes/wastewater.test.ts`
5. `packages/web/src/hooks/useWastewater.ts`
6. `packages/web/src/components/strips/WastewaterStrip.tsx`

## Files to Modify (7)

1. `shared/types.ts` — add `WastewaterPathogen`, `WastewaterSummary`
2. `packages/server/src/app.ts` — import, wire cron + route
3. `packages/server/src/routes/news.ts` — add to bootstrap
4. `packages/web/src/lib/api.ts` — add type + method + bootstrap field
5. `packages/web/src/hooks/useBootstrap.ts` — seed wastewater cache
6. `packages/web/src/components/layout/CommandLayout.tsx` — add tile
7. `packages/web/src/i18n/{en,de,tr,ar}.json` — translations
