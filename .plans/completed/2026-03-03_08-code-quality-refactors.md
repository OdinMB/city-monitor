# Code Quality Refactors

Reduce duplication, improve type safety, and standardize patterns across the codebase.

## Changes

### 1. Cache key constants — `packages/server/src/lib/cache-keys.ts` (new)

**Problem:** Cache keys like `${city.id}:news:digest` are string-interpolated in 15+ files. Typos cause silent bugs (see: bootstrap AQ key bug).

**Fix:** Create a `CACHE_KEYS` object with typed helper functions:
```typescript
export const CACHE_KEYS = {
  newsDigest: (cityId: string) => `${cityId}:news:digest`,
  newsCategory: (cityId: string, cat: string) => `${cityId}:news:${cat}`,
  airQualityGrid: (cityId: string) => `${cityId}:air-quality:grid`,
  // ... all keys
} as const;
```

Update all cache.set/get call sites to use these helpers. A typo in a key name now produces a compile error instead of a silent bug.

### 2. Shared strip utilities — `packages/web/src/components/strips/strip-utils.ts` (new)

**Problem:** All strip components have duplicated patterns:
- Loading skeleton
- Empty state ("No data available")
- Color constant maps (QUALITY_COLORS, STATE_COLORS, etc.)
- Severity/status dot rendering

**Fix:** Extract shared utilities:
- `StripSkeleton` component (reusable loading state)
- `StripEmpty` component (reusable "no data" state)
- Shared color maps in one file
- `StatusDot` component for severity/status indicators

### 3. Consistent logging — `packages/server/src/lib/logger.ts`

**Problem:** Inconsistent log formats: `${city.id} DB write failed` vs `${city.id}: DB write failed`.

**Fix:** Add structured log helpers:
```typescript
log.cityError(cityId: string, action: string, err?: unknown)
log.cronInfo(jobName: string, msg: string)
```

Or simply adopt a convention (colon-separated) and fix the ~10 inconsistent call sites.

### 4. Remove unsafe type casts — `packages/server/src/db/warm-cache.ts`

**Problem:** `as unknown as Array<...>` double-casts bypass type safety.

**Fix:** Use proper Drizzle query types or Zod validation (ties into plan 06). At minimum, replace `as unknown as` with proper type narrowing.

### 5. Use `useTranslation()` in child components — strip sub-components

**Problem:** Parent components pass the `t` function as a prop to child components instead of letting them call `useTranslation()` directly. This causes unnecessary prop drilling and re-renders when the parent's `t` reference changes.

**Fix:** In each sub-component that receives `t` as a prop, replace with a direct `useTranslation()` call. This is the standard react-i18next pattern.

## Testing

- Unit test: CACHE_KEYS helpers produce expected strings
- Verify: no remaining raw cache key strings in codebase (grep)

## Scope

- 2 new files (cache-keys.ts, strip-utils.ts)
- 20+ files modified (cache key replacement, strip cleanup)
- No new dependencies, no migration
