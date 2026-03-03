# Wastewater Tile: Sparklines + Level Labels

## Goal

Replace raw gene copy numbers with intuitive level labels (None/Low/Moderate/High) and add sparkline mini-charts showing 12-week trends per pathogen.

## Design Decisions

- **Display:** Level labels as primary, sparklines below each pathogen
- **Placement:** After Air Quality (already done)
- **Level thresholds:** Per-pathogen, based on max observed non-zero value in the entire CSV history:
  - `none`: value === 0
  - `low`: value <= 25% of max
  - `moderate`: value <= 50% of max
  - `high`: value > 50% of max
- **Sparkline data:** Last 12 sample dates, each as avg across plants for that pathogen. Array of numbers (frontend computes relative heights).

## Changes

### 1. Shared types (`shared/types.ts`)

Add to `WastewaterPathogen`:
```typescript
level: 'none' | 'low' | 'moderate' | 'high';
history: number[];  // last 12 weeks, oldest first
```

### 2. Ingestion (`packages/server/src/cron/ingest-wastewater.ts`)

In `buildSummary`:
- Compute per-pathogen max non-zero value across all dates
- Compute level from current value vs max
- Build history array: last 12 dates (descending from latest), avg value per pathogen, then reverse to oldest-first

### 3. Tests (`packages/server/src/cron/ingest-wastewater.test.ts`)

- Update `mockCsvFull` to have ≥3 dates for sparkline testing
- Add test: level computation (none/low/moderate/high)
- Add test: history array has correct length and order
- Update existing assertions if structure changed

### 4. Strip component (`packages/web/src/components/strips/WastewaterStrip.tsx`)

- Replace raw number with level label + trend arrow
- Add inline SVG sparkline (simple polyline) below each pathogen
- Color: level-based (green for none/low, amber for moderate, red for high)

### 5. i18n (all 4 locales)

Add level keys:
- `panel.wastewater.level.none`
- `panel.wastewater.level.low`
- `panel.wastewater.level.moderate`
- `panel.wastewater.level.high`

## Files Modified (6)

1. `shared/types.ts`
2. `packages/server/src/cron/ingest-wastewater.ts`
3. `packages/server/src/cron/ingest-wastewater.test.ts`
4. `packages/web/src/components/strips/WastewaterStrip.tsx`
5. `packages/web/src/i18n/{en,de,tr,ar}.json`
