# Data Layer Integrity

Fix schema gaps, add runtime validation for JSONB data, standardize API response formats, and address orphan record risks.

## Changes

### 1. FK constraint: aiSummaries → newsItems — `packages/server/src/db/schema.ts`

**Problem:** `aiSummaries` references `newsItems` via `headlineHash` but has no foreign key. When data retention deletes news items after 7 days, orphaned summaries persist for 30 days.

**Fix options:**
- **A) Add FK with CASCADE DELETE** — summaries auto-delete when their news item is deleted. Simplest, but requires matching the unique constraint structure.
- **B) Align retention periods** — delete summaries at the same time as news items (7 days). No FK needed.
- **C) Add cleanup query** — in the data-retention cron, delete summaries whose headlineHash no longer exists in newsItems.

**Recommendation:** Option C — it's the safest. FKs on hash columns across tables with different retention policies add complexity. A cleanup query in the existing retention job is straightforward and doesn't require a migration.

### 2. JSONB validation with Zod — `packages/server/src/db/reads.ts`

**Problem:** JSONB columns are cast to TypeScript types without runtime validation: `row.current as WeatherData`. If upstream data changes shape, errors surface as cryptic frontend crashes.

**Fix:** Add Zod schemas for the major JSONB structures and validate on read:
- `WeatherData` (current, hourly, daily, alerts)
- `WaterLevelData` (stations array)
- `BuergeramtData` (services array)
- `AirQualityGrid` (grid structure)

Use `.safeParse()` — on validation failure, log a warning and return null (treat as cache miss) rather than crashing.

### 3. Missing compound indices — `packages/server/src/db/schema.ts`

Add indices for the most common read patterns:
- `newsItems`: `(cityId, publishedAt DESC)`
- `safetyReports`: `(cityId, fetchedAt DESC)`
- `aiSummaries`: `(cityId, generatedAt DESC)`

Generate a Drizzle migration.

### 4. Stale data guards — `packages/server/src/db/reads.ts`

**Problem:** `loadWeather()`, `loadNewsItems()`, and `loadEvents()` return data regardless of age. If the cron fails, week-old data is served as if fresh.

**Fix:** Add age checks (like transit and NINA already have):
- Weather: discard if older than 2 hours (cron runs every 30 min)
- News: discard if older than 1 hour (cron runs every 10 min)
- Events: discard if older than 12 hours (cron runs every 6 hours)

Return null when data is stale so the frontend shows "no data" rather than misleading stale data.

### 5. Consistent API response format — route files

**Problem:** News returns `{ items, categories, updatedAt }`, transit returns `[]`, safety returns `[]`. No freshness indicator.

**Fix:** This is a larger change that touches every route and every frontend hook. Consider adding a lightweight wrapper:
```typescript
{ data: T, fetchedAt: string | null }
```

Or defer this and just ensure all endpoints return `[]`/`{}` (never raw null) for empty states.

## Decisions

- **Response format:** Full standardization to `{ data, fetchedAt }` wrapper. Breaking change for frontend hooks, but cleaner long-term. Update all route handlers and all frontend hooks together.
- **Zod schemas location:** Place in `shared/`. Frontend can also use them for type-safe API response parsing.

## Testing

- Unit test: retention cleanup removes orphaned summaries
- Unit test: Zod validation rejects malformed JSONB and returns null
- Unit test: stale data guards return null for old data
- Migration test: new indices don't break existing queries

## Scope

- 5-8 files modified
- 1 migration (indices)
- No new dependencies (Zod already installed)
