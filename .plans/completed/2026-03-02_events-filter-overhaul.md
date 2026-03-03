# Events Filter Overhaul

## Problem

1. **Shows past events**: Events from earlier today visible at night.
2. **Only 50 events fetched**: Single-page API fetch meant late-day users saw only past events with nothing for tomorrow.
3. **No category filtering**: API provides categories but UI didn't expose them.
4. **Grid too wide**: 3-4 events per row made cards too compressed.

## Solution

Simplified to "next upcoming events" instead of day/time-of-day filters.

### Server
- **Multi-page fetch**: Ingestion now fetches up to 3 pages (150 events) from kulturdaten.berlin, filters to future-only, stores the first 50.
- **Route-level filtering**: API route also filters to future events before returning, so stale cache data is cleaned.

### Client
- **No day/time filters**: Removed today/tomorrow/morning/evening filters. Events are already future-only from the server.
- **Category filter pills**: Added category filter row (All + available categories with counts), following NewsStrip pattern.
- **2-column grid**: Changed from `@xs:grid-cols-2 @lg:grid-cols-3 @2xl:grid-cols-4` to `grid-cols-1 @xs:grid-cols-2`.
- **30-min polling**: Reduced from 60 min to 30 min so the "upcoming" list stays fresh.
- **Day + time display**: Each event card shows weekday + date + time.

## Files modified

| File | Change |
|------|--------|
| `packages/server/src/cron/ingest-events.ts` | Multi-page fetch (up to 3), future-only filter, early return on empty |
| `packages/server/src/routes/events.ts` | Route-level future filtering |
| `packages/web/src/components/strips/EventsStrip.tsx` | Simplified to category filter + 2-col grid |
| `packages/web/src/hooks/useEvents.ts` | 30-min polling, 15-min staleTime |
| `packages/web/src/i18n/*.json` | Added `all` key, removed unused time-of-day keys |
