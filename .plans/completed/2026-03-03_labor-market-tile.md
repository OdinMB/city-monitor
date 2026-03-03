# Switch Social Atlas Tile to BA Monthly Unemployment Data

## Overview

Replace the biennial MSS 2023 data behind the "Social Atlas 2023" dashboard tile with monthly unemployment data from the Bundesagentur fur Arbeit (BA) Statistics API. The tile gets a new title ("Labor Market"). The MSS 2023 map choropleth layer is unchanged.

## Data Source

**BA Statistics API — Unemployment current figures (EckwerteTabelleALOBL)**

- **URL:** `https://statistik-dr.arbeitsagentur.de/bifrontend/bids-api/ct/v1/tableFetch/csv/EckwerteTabelleALOBL?Bundesland=Berlin`
- **Auth:** None
- **Format:** CSV (semicolons, German number formatting)
- **Update:** Monthly
- **License:** Government open data (no attribution required)

Response gives 3 time points (current month, previous month, same month last year) for 8 metrics. Key rows:

| Row label | Meaning | Example |
|---|---|---|
| `Arbeitslose insgesamt` | Total unemployed | 226.880 (= 226,880) |
| `Arbeitslosenquote (bezogen auf alle zivilen Erwerbspersonen)` | Unemployment rate % | 10,6 (= 10.6%) |
| `im Rechtskreis SGB II` (after Arbeitslose) | SGB II unemployed count | 148.600 |
| `im Rechtskreis SGB II` (after Arbeitslosenquote) | SGB II unemployment rate % | 7,0 |

German number formatting: periods = thousands separator, commas = decimal separator.

## Changes

### 1. Shared type (`shared/types.ts`)

Replace `SocialAtlasSummary` with `LaborMarketSummary`:

```ts
export interface LaborMarketSummary {
  unemploymentRate: number;    // Arbeitslosenquote (%)
  totalUnemployed: number;     // Arbeitslose insgesamt
  sgbIIRate: number;           // SGB II unemployment rate (%)
  sgbIICount: number;          // SGB II unemployed count
  yoyChangeAbsolute: number;   // YoY absolute change in total unemployed
  yoyChangePercent: number;    // YoY percent change
  reportMonth: string;         // ISO month "2026-02"
}
```

Keep `SocialAtlasFeatureProps` (used by map layer).

### 2. Server: Cron (`packages/server/src/cron/ingest-labor-market.ts`)

New file. Factory pattern like wastewater (hardcoded Berlin-only since BA treats Berlin as one Bundesland):

- Fetch CSV from BA endpoint
- Parse semicolons, German numbers, extract key metrics
- Cache as `berlin:labor-market` with 86400s TTL (1 day)
- Schedule: `'0 7 * * *'` (daily 7 AM), `runOnStart: true`

### 3. Server: Route (`packages/server/src/routes/labor-market.ts`)

New file. `GET /:city/labor-market` → `LaborMarketSummary | null`

### 4. Server: Wiring (`packages/server/src/app.ts`)

- Import + create `createLaborMarketIngestion(cache)`
- Add `ScheduledJob` entry
- Mount `createLaborMarketRouter(cache)` with `cacheFor(3600)`

### 5. Server: Bootstrap (`packages/server/src/routes/news.ts`)

Change `${city.id}:social-atlas:summary` → `${city.id}:labor-market` in `getBatch` and change `socialAtlasSummary` → `laborMarket` in response.

### 6. Server: Clean up social atlas summary

- Remove summary computation from `ingest-social-atlas.ts` (remove `computeSummary`, the summary `cache.set`, the `DATA_YEAR` constant)
- Remove `GET /:city/social-atlas/summary` endpoint from `social-atlas.ts`

### 7. Frontend: API (`packages/web/src/lib/api.ts`)

- Add `LaborMarketSummary` to imports/exports
- Replace `getSocialAtlasSummary` with `getLaborMarket`
- In `BootstrapData`: replace `socialAtlasSummary` with `laborMarket`

### 8. Frontend: Hook

- Delete `useSocialAtlasSummary.ts`
- Create `useLaborMarket.ts` — same pattern, queryKey `['labor-market', cityId]`, refetchInterval 1 hour

### 9. Frontend: Tile

Rename `SocialAtlasStrip.tsx` → `LaborMarketStrip.tsx`. Display:
- Unemployment rate (10.6%) — large number, amber color
- SGB II rate (7.0%) — large number, orange color
- YoY trend badge (e.g., "+5% vs last year")
- Report month (e.g., "Feb 2026")

### 10. Frontend: Layout (`CommandLayout.tsx`)

- Import `LaborMarketStrip` instead of `SocialAtlasStrip`
- Change tile title key to `panel.laborMarket.title`

### 11. Frontend: Bootstrap (`useBootstrap.ts`)

Change `socialAtlasSummary` → `laborMarket` and query key → `['labor-market', cityId]`

### 12. i18n (all 4 langs)

Replace `panel.socialAtlas.*` with `panel.laborMarket.*`:

EN: title "Labor Market", unemployment "Unemployment rate", sgbII "SGB II rate", yoy "vs. last year", reportMonth "{{month}}"
DE: title "Arbeitsmarkt", unemployment "Arbeitslosenquote", sgbII "SGB-II-Quote", yoy "ggü. Vorjahr", reportMonth "{{month}}"
TR: title "Is Piyasasi"
AR: title appropriate translation

Keep `sidebar.layers.social-atlas` as is (map layer name unchanged).

## Files to create

| File | Purpose |
|---|---|
| `packages/server/src/cron/ingest-labor-market.ts` | BA CSV ingestion |
| `packages/server/src/cron/ingest-labor-market.test.ts` | Unit tests |
| `packages/server/src/routes/labor-market.ts` | REST endpoint |
| `packages/server/src/routes/labor-market.test.ts` | Route tests |
| `packages/web/src/hooks/useLaborMarket.ts` | React Query hook |
| `packages/web/src/components/strips/LaborMarketStrip.tsx` | Dashboard tile |

## Files to modify

| File | Change |
|---|---|
| `shared/types.ts` | Add `LaborMarketSummary`, remove `SocialAtlasSummary` |
| `packages/server/src/app.ts` | Wire labor-market cron + route |
| `packages/server/src/routes/news.ts` | Bootstrap: swap social-atlas-summary → labor-market |
| `packages/server/src/cron/ingest-social-atlas.ts` | Remove summary computation |
| `packages/server/src/routes/social-atlas.ts` | Remove summary endpoint |
| `packages/web/src/lib/api.ts` | Swap getSocialAtlasSummary → getLaborMarket, update BootstrapData |
| `packages/web/src/hooks/useBootstrap.ts` | Swap seeding key |
| `packages/web/src/components/layout/CommandLayout.tsx` | Import + title change |
| `packages/web/src/i18n/en.json` | Replace socialAtlas with laborMarket keys |
| `packages/web/src/i18n/de.json` | Same |
| `packages/web/src/i18n/tr.json` | Same |
| `packages/web/src/i18n/ar.json` | Same |

## Files to delete

| File | Reason |
|---|---|
| `packages/web/src/hooks/useSocialAtlasSummary.ts` | Replaced by `useLaborMarket.ts` |
| `packages/web/src/components/strips/SocialAtlasStrip.tsx` | Replaced by `LaborMarketStrip.tsx` |
