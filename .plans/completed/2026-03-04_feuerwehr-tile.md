# Berlin Feuerwehr (Fire Department) KPI Tile

## Goal

Add a Berlin-only expandable dashboard tile showing fire department operational statistics from the [Berliner Feuerwehr Open Data](https://github.com/Berliner-Feuerwehr/BF-Open-Data) GitHub repository.

## Data Source

**Primary:** `BFw_mission_data_monthly.csv` — actively updated daily via automated commits, covers 2018–present with current month partial data.

URL: `https://raw.githubusercontent.com/Berliner-Feuerwehr/BF-Open-Data/main/Datasets/Daily_Data/BFw_mission_data_monthly.csv`

### Schema (30 columns, key fields)

| Field | Type | Use |
|---|---|---|
| `mission_created_date` | YYYY-MM | Report month |
| `mission_count_all` | int | Total missions |
| `mission_count_ems` | int | Emergency medical missions |
| `mission_count_fire` | int | Fire missions |
| `mission_count_technical_rescue` | int | Technical rescue missions |
| `response_time_ems_critical_median` | float (seconds) | Median EMS critical response time |
| `response_time_fire_time_to_first_pump_median` | float (seconds) | Median time to first fire engine |

### Tile Design

**Collapsed view (span=1):** Three KPI blocks stacked vertically (like LaborMarketStrip):

1. **Total Missions** — big number (last complete month) + MoM change
2. **EMS Response Time** — median in minutes:seconds format + MoM change
3. **Fire Response Time** — median time to first pump in min:sec + MoM change

**Expanded view:** Additional breakdown:
- Current partial month stats (if available) with "partial" indicator
- Mission breakdown: EMS / Fire / Technical Rescue counts with proportions
- Previous month comparison for all metrics

**Data period:** Ingestion extracts both the last complete month AND the current partial month. The collapsed view shows the last complete month (stable numbers). The expanded view can show both.

### Architecture: Minimal changes approach

Follow the exact same pattern as `ingest-labor-market.ts` → `LaborMarketStrip.tsx`. This is the closest analog:
- Single CSV fetch, monthly granularity, Berlin-only, simple KPI display, no map layer, no sparklines.

## Implementation Steps

### 1. Shared types + Zod schema (`shared/types.ts`, `shared/schemas.ts`)

```ts
// types.ts
export interface FeuerwehrMonthData {
  reportMonth: string;                      // "2026-02"
  missionCountAll: number;
  missionCountEms: number;
  missionCountFire: number;
  missionCountTechnicalRescue: number;
  responseTimeEmsCriticalMedian: number;    // seconds
  responseTimeFirePumpMedian: number;       // seconds
}

export interface FeuerwehrSummary {
  current: FeuerwehrMonthData;              // last complete month
  partial: FeuerwehrMonthData | null;       // current partial month (may be null early in month)
  previous: FeuerwehrMonthData | null;      // month before current, for MoM delta
}
```

### 2. Cache key (`packages/server/src/lib/cache-keys.ts`)

Add `feuerwehr: (cityId: string) => \`${cityId}:feuerwehr\`` under Economics section. Add to `bootstrapKeys()`.

### 3. DB table (`packages/server/src/db/schema.ts`)

```ts
export const feuerwehrSnapshots = pgTable('feuerwehr_snapshots', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  data: jsonb('data').notNull(),        // FeuerwehrSummary
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('feuerwehr_city_idx').on(t.cityId)]);
```

### 4. DB write (`packages/server/src/db/writes.ts`)

`saveFeuerwehr(db, cityId, data)` — simple insert.

### 5. DB read (`packages/server/src/db/reads.ts`)

`loadFeuerwehr(db, cityId)` — SELECT latest row, validate JSONB with Zod.

### 6. Cron job (`packages/server/src/cron/ingest-feuerwehr.ts`)

- Fetch CSV from GitHub raw URL
- Parse comma-delimited CSV (standard commas, not semicolons)
- Extract last two complete months (skip current partial month)
- Build `FeuerwehrSummary` with MoM comparison
- Cache + DB write

Schedule: `0 8 * * *` (daily at 8:00 — after the Feuerwehr's automated daily commits)

### 7. API route (`packages/server/src/routes/feuerwehr.ts`)

`GET /:city/feuerwehr` — cache-first, DB fallback. `cacheFor(43200)` (12h).

### 8. App wiring (`packages/server/src/app.ts`)

- Import cron + router factories
- Add `FreshnessSpec` entry (table: `feuerwehr_snapshots`, maxAge: 86400)
- Register cron job (schedule: `0 8 * * *`, runOnStart if stale)
- Mount router

### 9. Cache warm (`packages/server/src/db/warm-cache.ts`)

Add to Berlin-only block: load from DB → set cache.

### 10. Bootstrap endpoint (`packages/server/src/routes/news.ts`)

Add `feuerwehr` field to bootstrap response, mapped to `CK.feuerwehr(city.id)`.

### 11. Data retention (`packages/server/src/cron/data-retention.ts`)

Add cleanup task for `feuerwehr_snapshots` (moderate retention = 90 days).

### 12. Frontend API client (`packages/web/src/lib/api.ts`)

- Export `FeuerwehrSummary` type
- Add to `BootstrapData` interface
- Add `api.getFeuerwehr(city)` method

### 13. Bootstrap hook (`packages/web/src/hooks/useBootstrap.ts`)

Seed `['feuerwehr', cityId]` from bootstrap data.

### 14. Data hook (`packages/web/src/hooks/useFeuerwehr.ts`)

React Query hook, `enabled` gated by `isBerlin`, 24h refetch, 12h stale.

### 15. Component (`packages/web/src/components/strips/FeuerwehrStrip.tsx`)

Expandable Berlin-only strip following LaborMarketStrip pattern:
- **Collapsed:** Total missions (big number) + EMS response time + fire response time
- **Expanded:** Full breakdown with mission type counts + all response times + MoM deltas

### 16. Layout mount (`packages/web/src/components/layout/CommandLayout.tsx`)

Add Berlin-gated `<Tile>` after the population tile.

### 17. i18n keys (all 4 locale files)

`panel.feuerwehr.*` — title, missions, emsResponseTime, fireResponseTime, technicalRescue, etc.

### 18. Sources page (`packages/web/src/pages/SourcesPage.tsx`)

Add entry to `BERLIN_SOURCES` under a "Public Safety" category.

### 19. DB migration

`npm run db:generate` + `npm run db:migrate` (or `db:push` for dev).

### 20. Context file (`.context/feuerwehr.md`)

Document the data source, ingestion pattern, tile design, and reference in CLAUDE.md.

## Files to create

| File | Purpose |
|---|---|
| `packages/server/src/cron/ingest-feuerwehr.ts` | CSV ingestion cron |
| `packages/server/src/routes/feuerwehr.ts` | API route |
| `packages/web/src/hooks/useFeuerwehr.ts` | React Query hook |
| `packages/web/src/components/strips/FeuerwehrStrip.tsx` | Dashboard tile component |
| `.context/feuerwehr.md` | Context documentation |

## Files to modify

| File | Change |
|---|---|
| `shared/types.ts` | Add `FeuerwehrSummary` interface |
| `shared/schemas.ts` | Add `FeuerwehrSummarySchema` Zod schema |
| `packages/server/src/lib/cache-keys.ts` | Add cache key + bootstrap key |
| `packages/server/src/db/schema.ts` | Add `feuerwehr_snapshots` table |
| `packages/server/src/db/writes.ts` | Add `saveFeuerwehr` |
| `packages/server/src/db/reads.ts` | Add `loadFeuerwehr` |
| `packages/server/src/db/warm-cache.ts` | Add Berlin-only warm task |
| `packages/server/src/app.ts` | Wire cron + route + freshness |
| `packages/server/src/routes/news.ts` | Add to bootstrap response |
| `packages/server/src/cron/data-retention.ts` | Add cleanup task |
| `packages/web/src/lib/api.ts` | Add type + BootstrapData field + API method |
| `packages/web/src/hooks/useBootstrap.ts` | Seed query cache |
| `packages/web/src/components/layout/CommandLayout.tsx` | Mount tile |
| `packages/web/src/pages/SourcesPage.tsx` | Add source entry |
| `packages/web/src/i18n/de.json` | German translations |
| `packages/web/src/i18n/en.json` | English translations |
| `packages/web/src/i18n/tr.json` | Turkish translations |
| `packages/web/src/i18n/ar.json` | Arabic translations |
| `CLAUDE.md` | Reference feuerwehr context file |
