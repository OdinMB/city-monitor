# Milestone 10 — Events & Safety

**Goal:** Add city events calendar and police/fire safety reports.

**Depends on:** [02-server-core.md](02-server-core.md)

---

## Steps

### 1. Events ingestion (`packages/server/src/cron/ingest-events.ts`)

Runs every 6 hours.

Berlin sources:
- `berlin.de/veranstaltungen/` — official city events (may need HTML scraping or RSS)
- `visitBerlin.de` — tourist events (RSS/API)
- Community event feeds

```
For each active city with events config:
  1. Fetch events from configured sources
  2. Normalize to CityEvent[]
  3. Filter: only future events (next 7 days)
  4. Deduplicate by title + date hash
  5. Write to Postgres (events table, upsert by hash)
  6. Optionally: GPT-5 generates one-line description for events without one
  7. Update memory cache: `{cityId}:events:upcoming` (TTL 21600s / 6h)
```

#### Schema addition (`packages/server/src/db/schema.ts`)

```typescript
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  title: text('title').notNull(),
  venue: text('venue'),
  date: timestamp('date').notNull(),
  endDate: timestamp('end_date'),
  category: text('category'),
  url: text('url'),
  description: text('description'),
  imageUrl: text('image_url'),
  free: boolean('free'),
  hash: text('hash').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
});
```

### 2. Safety/police reports (`packages/server/src/cron/ingest-safety.ts`)

Runs alongside feed ingestion (every 10 min) or as part of it.

Berlin source:
- `https://www.berlin.de/polizei/polizeimeldungen/index/feed/rss` — official police press releases

```
For each active city with police config:
  1. Fetch RSS feed
  2. Parse to SafetyReport[]
  3. Write to Postgres (safety_reports table, upsert by URL hash)
  4. Query last 48 hours from DB
  5. Update memory cache: `{cityId}:safety:recent` (TTL 900s)
```

#### Schema addition (`packages/server/src/db/schema.ts`)

```typescript
export const safetyReports = pgTable('safety_reports', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  publishedAt: timestamp('published_at'),
  url: text('url'),
  district: text('district'),
  hash: text('hash').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
});
```

### 3. API endpoints

```typescript
GET /api/:city/events → CityEvent[]

interface CityEvent {
  id: string;
  title: string;
  venue: string;
  date: string;           // ISO date
  endDate?: string;
  category: 'music' | 'art' | 'theater' | 'food' | 'market' | 'sport' | 'community' | 'other';
  url: string;
  description?: string;
  imageUrl?: string;
  free?: boolean;
}

GET /api/:city/safety → SafetyReport[]

interface SafetyReport {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  district?: string;      // "Mitte", "Kreuzberg", etc.
}
```

### 4. EventsPanel

Displays upcoming events grouped by day:
- Today / Tomorrow / This Week sections
- Category icon + tag
- Venue name
- "Free" badge for free events
- Link to event page

### 5. SafetyPanel

Displays recent police reports:
- Title + short description
- District tag (if extractable from text)
- Time since publication
- Link to full report

---

## Done when

- [ ] Events cron fetches Berlin events every 6 hours and persists to Postgres
- [ ] Safety cron fetches police reports every 10 min and persists to Postgres
- [ ] `GET /api/berlin/events` returns upcoming events
- [ ] `GET /api/berlin/safety` returns recent police reports
- [ ] EventsPanel shows events grouped by day
- [ ] SafetyPanel shows recent reports with district tags
- [ ] Bootstrap includes events and safety data
