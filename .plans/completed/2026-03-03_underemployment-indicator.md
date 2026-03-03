# Add Underemployment Rate to Labor Market Tile

## Goal
Add the **Unterbeschäftigungsquote** (underemployment rate) as a third indicator in the Labor Market dashboard tile, sourced from the same BA CSV we already fetch.

## Data Source
The BA CSV already contains these rows (Row 3 = count, Row 7 = rate):
- `Unterbeschäftigung (ohne Kurzarbeit)` — underemployment count
- `Unterbeschäftigungsquote (ohne Kurzarbeit)` — underemployment rate (%)

## Changes

### 1. Shared types (`shared/types.ts`)
Add 4 fields to `LaborMarketSummary`:
- `underemploymentRate: number`
- `underemploymentCount: number`
- `underemploymentYoyAbsolute: number`
- `underemploymentYoyPercent: number`

### 2. Ingestion (`packages/server/src/cron/ingest-labor-market.ts`)
Parse the underemployment count row (starts with `Unterbeschäftigung`) and rate row (starts with `Unterbeschäftigungsquote`). Populate the 4 new fields.

### 3. Tests (`packages/server/src/cron/ingest-labor-market.test.ts`)
Add assertions for the 4 new fields in the existing parse test. Mock CSVs already contain the rows.

### 4. Frontend tile (`packages/web/src/components/strips/LaborMarketStrip.tsx`)
Add a third block matching the existing pattern (headline rate + count + YoY trend).

### 5. i18n (`packages/web/src/i18n/{en,de,tr,ar}.json`)
Add `panel.laborMarket.underemployment` key in all 4 languages.

### 6. Context docs (`.context/social-atlas.md`)
Update `LaborMarketSummary` field list and tile description.

### No changes needed
- **DB schema** — `labor_market_snapshots.data` is `jsonb`, new fields flow through automatically
- **Route** — passes through the cached/stored object as-is
- **Cache warming** — loads the full `jsonb` object, no field awareness
- **Bootstrap** — same pattern
