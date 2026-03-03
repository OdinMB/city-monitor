# Bürgeramt Appointment Availability Tile

## Goal

Add a small dashboard tile (span=1) showing real-time Bürgeramt appointment availability for 5 tracked Berlin services — earliest available date, days until next slot, and a color-coded status badge per service.

## Research Findings

**service.berlin.de uses a Varnish WAF that returns 403 to all non-browser HTTP clients.** The bot-detection JS is cosmetic only (loads a template) — the actual block is at the CDN level. Plain `fetch` with cookies, browser-like headers, and the legacy `tag.php` endpoint all fail with 403.

**Firecrawl gets through the WAF.** Tested successfully — returns full HTML with calendar data. For service 120686 (Anmeldung), Firecrawl returned 35KB of HTML containing 38 `td.buchbar` appointment days across March + April 2026. All 3 tested services (Anmeldung, Personalausweis, Reisepass) returned valid data.

## Architecture Decision

### Firecrawl API scraping (selected)

Use the Firecrawl v2 `/scrape` endpoint to fetch rendered HTML from service.berlin.de, then parse `td.buchbar a` elements to extract available appointment dates.

**Why this wins:**
- **Works** — tested, confirmed, 3/3 services returned valid calendar data
- **No new server dependencies** — just a `fetch` call to Firecrawl's API (already have an account + API key in `.env`)
- **Follows existing patterns** — identical to how other cron jobs call external APIs via `log.fetch()`
- **No Playwright/Chromium** — avoids ~130MB browser dependency and deployment complexity

**Trade-offs:**
- **Firecrawl cost** — each scrape is an API call (~$0.001/scrape); 5 services × 288 scrapes/day = ~$1.44/day at 5-min intervals. At 10-min intervals = ~$0.72/day.
- **Latency** — Firecrawl takes ~5-8s per scrape (browser rendering on their side)
- **Dependency** — relies on Firecrawl uptime (graceful fallback if unavailable)

### Alternatives considered

- **Playwright server-side** — Works but adds ~130MB Chromium dependency, complex deployment. Overkill when Firecrawl handles the browser for us.
- **Plain HTTP with cookies** — Blocked by Varnish WAF. Does not work.
- **Static/historical data** — No real-time value.

## Tracked Services (Top 5)

| Service | ID | German Name |
|---|---|---|
| Residence registration | `120686` | Anmeldung einer Wohnung |
| ID card | `121482` | Personalausweis beantragen |
| Passport | `120335` | Reisepass beantragen |
| Police clearance | `120926` | Führungszeugnis beantragen |
| Registration certificate | `120702` | Meldebescheinigung beantragen |

## Data Shape

```typescript
// shared/types.ts
interface BuergeramtService {
  serviceId: string;
  name: string;           // "Anmeldung" | "Personalausweis" | "Reisepass" | ...
  earliestDate: string | null;  // ISO date of first available slot, e.g. "2026-03-10"
  availableDays: number;  // count of days with slots in next ~8 weeks
  status: 'available' | 'scarce' | 'none' | 'unknown';
}

interface BuergeramtData {
  services: BuergeramtService[];
  fetchedAt: string;
  bookingUrl: string;     // "https://service.berlin.de/terminvereinbarung/"
}
```

Status derivation:
- `available`: ≥5 days with slots
- `scarce`: 1-4 days with slots
- `none`: 0 days with slots
- `unknown`: scrape failed or data unavailable

## Implementation Plan

### 1. Shared types
- **`shared/types.ts`** — Add `BuergeramtService`, `BuergeramtData` interfaces and `appointments?` field to `CityDataSources`

### 2. City config
- **`packages/server/src/config/cities/berlin.ts`** — Add `appointments` to `dataSources`:
  ```ts
  appointments: {
    provider: 'service-berlin',
    services: [
      { id: '120686', name: 'Anmeldung' },
      { id: '121482', name: 'Personalausweis' },
      { id: '120335', name: 'Reisepass' },
      { id: '120926', name: 'Führungszeugnis' },
      { id: '120702', name: 'Meldebescheinigung' },
    ],
  }
  ```

### 3. Cron job
- **`packages/server/src/cron/ingest-appointments.ts`** — New file
  - Factory: `createAppointmentIngestion(cache)` — cache-only, no DB
  - For each city with `dataSources.appointments`, for each service:
    - POST to Firecrawl v2 `/scrape` with `{ url, formats: ['html'], waitFor: 5000 }`
    - Parse HTML: regex match `<td class="...buchbar..."><a href="/terminvereinbarung/termin/time/{timestamp}/">{day}</a>`
    - Extract Unix timestamps from `href`, convert to ISO dates
    - Derive `status` from `availableDays` count
  - Env var: `FIRECRAWL_API_KEY` (already in server `.env`)
  - Cache key: `${cityId}:appointments`
  - TTL: 21600s (6h)
  - Schedule: `0 */6 * * *` (every 6 hours — appointment availability doesn't change fast enough to justify more)
  - **Graceful fallback:** If Firecrawl API fails or key is missing, set all services to `status: 'unknown'`
  - **Sequential scraping** with small delay between services to avoid rate issues

### 4. API route
- **`packages/server/src/routes/appointments.ts`** — New file
  - `GET /:city/appointments` — cache-read-only, returns `BuergeramtData` or empty default
  - Follows the AEDs route pattern (cache-only, no DB fallback)

### 5. Server wiring
- **`packages/server/src/app.ts`** — Register:
  - `createAppointmentIngestion(cache)` as cron job
  - `createAppointmentsRouter(cache)` with `cacheFor(600)`
  - Add `appointments` to bootstrap `getBatch` (in news.ts)

### 6. Frontend: API + hook
- **`packages/web/src/lib/api.ts`** — Add `BuergeramtData` type + `getAppointments` method
- **`packages/web/src/hooks/useAppointments.ts`** — New file, React Query hook
- **`packages/web/src/hooks/useBootstrap.ts`** — Seed appointments from bootstrap

### 7. Frontend: Tile
- **`packages/web/src/components/strips/AppointmentsStrip.tsx`** — New file
  - Compact span=1 tile, similar to WaterLevelStrip
  - Summary line at top: overall status (green/amber/red/gray)
  - Per-service row:
    - Service name
    - Color-coded status dot
    - "in X days" or "—" for no slots
  - Footer: small "Book appointment →" link to service.berlin.de
  - Loading: `<Skeleton lines={4} />`
  - Unknown: friendly message with booking link

### 8. Tile placement
- **`packages/web/src/components/layout/CommandLayout.tsx`** — Add after Water Levels:
  ```tsx
  <Tile title={t('panel.appointments.title')} span={1}>
    <AppointmentsStrip />
  </Tile>
  ```

### 9. i18n
- **All 4 language files** — Add `panel.appointments.*` keys

### 10. Tests
- **`packages/server/src/cron/ingest-appointments.test.ts`** — Unit tests:
  - HTML parsing logic (extract dates from sample HTML)
  - Status derivation (available/scarce/none)
  - Graceful fallback when Firecrawl is unavailable
- **`packages/server/src/routes/appointments.test.ts`** — Route tests:
  - Cache hit returns data
  - Cache miss returns empty default

## Files Created/Modified

| File | Action |
|---|---|
| `shared/types.ts` | Edit — add appointment types + CityDataSources field |
| `packages/server/src/config/cities/berlin.ts` | Edit — add appointments data source |
| `packages/server/src/cron/ingest-appointments.ts` | **Create** |
| `packages/server/src/cron/ingest-appointments.test.ts` | **Create** |
| `packages/server/src/routes/appointments.ts` | **Create** |
| `packages/server/src/routes/appointments.test.ts` | **Create** |
| `packages/server/src/app.ts` | Edit — register cron + route |
| `packages/server/src/routes/news.ts` | Edit — add to bootstrap |
| `packages/web/src/lib/api.ts` | Edit — add types + endpoint |
| `packages/web/src/hooks/useAppointments.ts` | **Create** |
| `packages/web/src/hooks/useBootstrap.ts` | Edit — seed appointments |
| `packages/web/src/components/strips/AppointmentsStrip.tsx` | **Create** |
| `packages/web/src/components/layout/CommandLayout.tsx` | Edit — add tile |
| `packages/web/src/i18n/en.json` | Edit |
| `packages/web/src/i18n/de.json` | Edit |
| `packages/web/src/i18n/tr.json` | Edit |
| `packages/web/src/i18n/ar.json` | Edit |
