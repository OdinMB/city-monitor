# Milestone 09 — Transit

**Goal:** Show public transit disruptions and line status for the city.

**Depends on:** [02-server-core.md](02-server-core.md)

---

## Steps

### 1. Research BVG/VBB API access

Berlin's public transit (BVG) data is available through several channels:
- **VBB HAFAS API** — the standard German transit API. Libraries like `hafas-client` provide typed access.
- **Berlin Open Data** — `daten.berlin.de` publishes GTFS feeds and disruption data
- **BVG disruptions RSS** — `https://www.bvg.de/de/stoerungen` (may need scraping)
- **DELFI API** — Germany-wide transit data standard

The `hafas-client` npm package is the most practical approach — it wraps HAFAS with a clean JS API and supports VBB/BVG natively.

### 2. Transit ingestion (`packages/server/src/cron/ingest-transit.ts`)

Runs every 5 min (transit disruptions are time-sensitive).

```
For each active city with transit config:
  1. Fetch disruptions via HAFAS or city-specific API
  2. Normalize to TransitAlert[]
  3. Filter: only show active disruptions (not resolved ones)
  4. Write to Postgres (transit_disruptions table, upsert by external ID)
  5. Mark resolved disruptions in DB
  6. Update memory cache: `{cityId}:transit:alerts` (TTL 300s)
```

#### Schema addition (`packages/server/src/db/schema.ts`)

```typescript
export const transitDisruptions = pgTable('transit_disruptions', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  externalId: text('external_id'),        // ID from transit API for dedup
  line: text('line').notNull(),
  type: text('type').notNull(),            // 'delay' | 'disruption' | 'cancellation' | 'planned-work'
  severity: text('severity').notNull(),
  message: text('message').notNull(),
  affectedStops: jsonb('affected_stops'),
  validFrom: timestamp('valid_from'),
  validUntil: timestamp('valid_until'),
  resolved: boolean('resolved').default(false),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
});
```

Use `createRateGate()` from milestone 02 if the transit API has rate limits.

### 3. Transit API endpoint

```typescript
GET /api/:city/transit → TransitAlert[]

interface TransitAlert {
  id: string;
  line: string;               // "U2", "S1", "Bus M29"
  type: 'delay' | 'disruption' | 'cancellation' | 'planned-work';
  severity: 'low' | 'medium' | 'high';
  message: string;
  affectedStops: string[];    // ["Alexanderplatz", "Potsdamer Platz"]
  validFrom: string;
  validUntil?: string;
}
```

### 4. TransitPanel (`packages/web/src/components/panels/TransitPanel.tsx`)

Displays:
- Active disruptions sorted by severity (high first)
- Line badge (colored by U/S/Bus/Tram type)
- Type icon (delay, disruption, cancellation, planned works)
- Affected stops
- Time range ("until 14:00" or "until further notice")
- "All clear" message when no disruptions

### 5. Map integration

If disruptions include stop coordinates, plot them on the city map:
- Red markers for cancellations
- Orange markers for disruptions
- Yellow markers for delays

---

## Done when

- [ ] Transit cron fetches BVG/VBB disruptions every 5 min and persists to Postgres
- [ ] `GET /api/berlin/transit` returns active disruptions
- [ ] TransitPanel shows disruptions with line badges and severity
- [ ] Bootstrap endpoint includes transit data
- [ ] Works gracefully when transit API is unavailable (shows "no data" state)
