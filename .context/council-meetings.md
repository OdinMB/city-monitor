# Council Meetings

Berlin-only feature showing upcoming BVV (district assembly) and Abgeordnetenhaus (state parliament) meetings.

## Data Sources

### BVV (OParl 1.0)
- **11 Berlin districts** with OParl JSON REST APIs hosted at `sitzungsdienst-*.de`
- Spandau has no OParl endpoint (excluded)
- Paginated: 20 meetings per page, up to 10 pages fetched per district
- Requires browser-like headers (User-Agent, Accept, Accept-Language) — plain fetch gets 403
- 1s delay between district requests for rate limiting
- Returns: meeting name, start/end, location (room + address), agenda items, web URL

### PARDOK (Parliament XML)
- Two XML feeds: `app_com.xml` (committee), `app_plen.xml` (plenary)
- Uses `fast-xml-parser` with `ignoreAttributes: false` to read `<field name="...">` attributes
- Dates are in Europe/Berlin local time — `berlinUtcOffset()` handles CET/CEST correctly

## Pipeline

1. **Cron** (`ingest-council-meetings.ts`): every 6h, fetches OParl + PARDOK, 14-day lookahead
2. **Cache**: `{cityId}:council-meetings`, TTL 25920s (7.2h)
3. **DB**: Unified `snapshots` table, type `oparl-meetings`, 2-day retention plus the 100-row cap (`CAPPED_RETENTION` in `cron/data-retention.ts`); DB reads refuse rows older than 48 h
4. **Route**: `GET /:city/council-meetings` — 3-tier read (cache → DB → null)
5. **Bootstrap**: included in `GET /:city/bootstrap` response

## Schema

```typescript
interface CouncilMeeting {
  id: string;
  source: 'bvv' | 'parliament';
  district?: string;        // BVV only
  committee: string;
  start: string;            // ISO datetime
  end?: string;
  location?: string;
  agendaItems?: Array<{ number: string; name: string; public: boolean }>;
  webUrl?: string;
}
```

## Frontend

- Hook: `useCouncilMeetings` (1h refetch, 30min stale)
- Strip: `CouncilMeetingsStrip` — a select picks Abgeordnetenhaus (default) or one BVV district; that source's meetings are grouped by day in a scrolling list (max 300 px), each with time, committee, district, location, agenda-item count and a link
- Berlin-only span-2 tile in `CommandLayout.tsx` (governance row, after Budget); not expandable
- i18n: `panel.councilMeetings.*` keys in all 4 locales

## Config (berlin.ts)

```typescript
councilMeetings: {
  bvv: [{ district: 'Mitte', baseUrl: '...' }, ...],  // 11 districts
  parliament: { committeeUrl: '...', plenaryUrl: '...' },
}
```
