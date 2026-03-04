# Stale Data Indicators — Unified Approach

## Problem

Five DB read functions silently discard data when it exceeds a freshness threshold, returning `null` as if no data exists:

| Domain | Function | Current threshold | Cron interval |
|---|---|---|---|
| Weather | `loadWeather` | 2h | 30 min |
| Transit | `loadTransitAlerts` | 30 min | 15 min |
| NINA | `loadNinaWarnings` | 1h | 5 min |
| Air Quality Grid | `loadAirQualityGrid` | 1h | 30 min |
| Events | `loadEvents` | 12h | 6h |

When cron fails a few times, data ages past the threshold and the UI shows "No issues" / hides the tile — indistinguishable from genuinely empty data.

All other tiles (safety, traffic, news, water levels, etc.) have **no** freshness guard and serve stale data silently forever.

## Design

### Principle

**Always serve the data. Let the frontend decide how to present staleness.**

### Server changes

**1. Remove freshness guards from `reads.ts`** — all five functions should return data regardless of age. The `fetchedAt` timestamp already travels with the data; the frontend can use it to judge freshness.

**2. Return the real `fetchedAt` from DB fallback paths** — currently, when routes serve from DB (cache miss), they set `fetchedAt: new Date().toISOString()` which lies about when data was actually fetched. Instead, the DB read functions should return `fetchedAt` alongside the data so routes can pass through the real timestamp.

Change the return type of affected read functions to include the batch timestamp:
```ts
// Before
export async function loadTransitAlerts(db, cityId): Promise<TransitAlert[] | null>

// After
export async function loadTransitAlerts(db, cityId): Promise<{ data: TransitAlert[]; fetchedAt: Date } | null>
```

This applies to all read functions that routes use for DB fallback. The route then does:
```ts
const result = await loadTransitAlerts(db, city.id);
if (result) {
  cache.set(key, result.data, TTL);
  res.json({ data: result.data, fetchedAt: result.fetchedAt.toISOString() });
}
```

**3. Increase the stale limit** — we don't want to serve data from weeks ago. Add a generous upper bound (24h for fast-changing domains, 7d for slow ones) as a safety net. Data older than this truly is useless and should return `null`.

| Domain | New max age |
|---|---|
| Weather | 6h |
| Transit | 3h |
| NINA | 3h |
| Air Quality Grid | 6h |
| Events | 48h |

### Frontend changes

**4. Add a `StaleBadge` component** — a small pill that appears in the tile header (via the existing `titleBadge` prop on `Tile`) when data is stale. Shows "Updated Xm ago" in muted styling. Only appears when data exceeds a per-domain "fresh" threshold.

```
┌─ Public Transport ── Updated 47m ago ─────────┐
│ U2: Delays between Pankow and Ruhleben         │
│ S1: Signal fault at Friedrichstraße             │
└─────────────────────────────────────────────────┘
```

**5. Define per-domain freshness tiers** — each domain gets a `freshMaxAge` (ms) threshold. Below it, no badge. Above it, show the badge.

| Domain | freshMaxAge | Rationale |
|---|---|---|
| Transit | 20 min | Cron every 15 min |
| NINA | 10 min | Cron every 5 min |
| Traffic | 10 min | Cron every 5 min |
| Safety | 15 min | Cron every 10 min |
| Weather | 45 min | Cron every 30 min |
| Air Quality | 45 min | Cron every 30 min |
| Water Levels | 20 min | Cron every 15 min |
| News | 15 min | Cron every 10 min |
| Events | 8h | Cron every 6h |
| Appointments | 8h | Cron every 6h |
| Budget | 36h | Cron daily |
| Bathing | 36h | Cron daily |
| Others (slow) | 36h+ | Weekly/monthly |

**6. `useFreshness` hook** — takes `fetchedAt` and `freshMaxAge`, returns `{ isStale, agoText }`. Uses `formatRelativeTime` for the label. Re-evaluates on a 60s interval so the badge updates without a data refetch.

**7. Wire `StaleBadge` into affected strips** — each strip passes its `fetchedAt` and domain-specific `freshMaxAge` to the hook, then passes the resulting badge to `Tile`'s `titleBadge`. Only strips whose hooks already expose `fetchedAt` need changes (all of them do).

**8. i18n** — add `"stale": { "updated": "Updated {{time}}" }` to all 4 language files.

### What we're NOT doing

- Not adding staleness to map layers (only dashboard tiles).
- Not changing polling intervals or cache TTLs.
- Not adding a global "data outdated" banner — per-tile granularity is better.
- Not distinguishing "stale but present" from "genuinely empty" at the API level — the frontend uses `fetchedAt` age + `data.length === 0` to differentiate.

## Files to change

### Server
1. `packages/server/src/db/reads.ts` — remove aggressive guards, return `fetchedAt` from DB, add generous upper bounds
2. `packages/server/src/routes/transit.ts` — use real `fetchedAt` from DB result
3. `packages/server/src/routes/weather.ts` — same
4. `packages/server/src/routes/nina.ts` — same
5. `packages/server/src/routes/air-quality.ts` — same
6. `packages/server/src/routes/events.ts` — same
7. All other routes that use `new Date().toISOString()` as synthetic fetchedAt

### Frontend
8. `packages/web/src/hooks/useFreshness.ts` — new hook
9. `packages/web/src/components/StaleBadge.tsx` — new component
10. `packages/web/src/components/strips/TransitStrip.tsx` — wire badge
11. All other strip components — wire badge
12. `packages/web/src/i18n/{en,de,tr,ar}.json` — add `stale.updated` key
13. `packages/web/src/lib/format-time.ts` — no changes needed (already has relative formatting)

### Tests
14. `packages/server/src/db/reads.test.ts` or similar — test that stale data is still returned
15. `packages/web/src/hooks/useFreshness.test.ts` — test freshness logic
