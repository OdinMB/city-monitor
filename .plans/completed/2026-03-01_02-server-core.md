# Milestone 02 — Server Core

**Goal:** Build the cache layer, in-process scheduler, and Express middleware foundation.

**Depends on:** [01-scaffolding.md](01-scaffolding.md)

---

## Steps

### 1. Database connection (`packages/server/src/db/index.ts`)

Set up the Drizzle ORM connection using the `postgres` driver:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

For development, use a local Postgres instance or a Docker container. `DATABASE_URL` format: `postgresql://user:pass@localhost:5432/city_monitor`.

### 2. Initial schema (`packages/server/src/db/schema.ts`)

Define the `news_articles` table as the first table (used in milestone 04). Other tables are added in their respective milestones. Start with a minimal schema so the DB connection and migrations can be validated:

```typescript
import { pgTable, serial, text, timestamp, integer, real, jsonb, boolean } from 'drizzle-orm/pg-core';

// Added in milestone 04
export const newsArticles = pgTable('news_articles', {
  id: serial('id').primaryKey(),
  cityId: text('city_id').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  publishedAt: timestamp('published_at'),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  description: text('description'),
  category: text('category'),
  tier: integer('tier'),
  lang: text('lang'),
  hash: text('hash').notNull(),          // FNV-1a hash for dedup
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Run `npm run db:generate` and `npm run db:push` to apply.

### 3. Cache layer (`packages/server/src/lib/cache.ts`)

In-memory cache for fast API reads. Postgres is the source of truth; the cache is a hot read layer.

Port the coalescing pattern from worldmonitor:
- Primary store: in-memory `Map<string, { data: unknown; expiresAt: number }>`
- Keep: in-flight coalescing, negative caching with sentinel, TTL support
- Drop: Redis integration, Vercel-specific env prefixing

**Reference:** `.worldmonitor/server/_shared/redis.ts`
- `cachedFetchJson()` at line ~104 — the main cache-aside function
- `inflight` Map for coalescing at line ~95
- `NEG_SENTINEL` for negative caching
- `getCachedJsonBatch()` for pipeline reads (used by bootstrap)

API surface:
```typescript
// Core
cache.get<T>(key: string): T | null
cache.set(key: string, data: unknown, ttlSeconds: number): void
cache.delete(key: string): void

// Cache-aside with coalescing (fetcher can query Postgres on miss)
cache.fetch<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T | null>, negativeTtlSeconds?: number): Promise<T | null>

// Batch GET for bootstrap endpoint
cache.getBatch(keys: string[]): Record<string, unknown>
```

The `fetcher` in `cache.fetch()` typically queries Postgres. Cron jobs also call `cache.set()` directly after writing to Postgres.

### 3a. Cache warmup (`packages/server/src/lib/cache-warmup.ts`)

On server start, query Postgres for current data and populate the memory cache so the dashboard is immediately available (no cold start with empty panels):

```typescript
export async function warmCache(db: Database, cities: CityConfig[]): Promise<void>
// For each city: load latest news digest, weather, transit, etc. from Postgres → cache.set()
```

### 2. Rate-gate factory (`packages/server/src/lib/rate-gate.ts`)

Generalize worldmonitor's `yahooGate()` into a reusable factory:

**Reference:** `.worldmonitor/server/_shared/constants.ts`
- `yahooGate()` — serial promise queue with minimum gap between requests

```typescript
export function createRateGate(minGapMs: number): () => Promise<void>
```

This will be used for any external API with rate limits (transit APIs, etc.).

### 3. In-process scheduler (`packages/server/src/lib/scheduler.ts`)

Use `node-cron` to run data ingestion jobs inside the Express process.

```typescript
import cron from 'node-cron';

interface ScheduledJob {
  name: string;
  schedule: string;        // cron expression
  handler: () => Promise<void>;
  runOnStart?: boolean;    // fire immediately on server boot
}

export function startScheduler(jobs: ScheduledJob[]): void
```

Jobs to register (handlers are stubs for now, implemented in later milestones):
- `ingest-feeds` — `*/10 * * * *` (every 10 min), `runOnStart: true`
- `summarize-news` — `5,20,35,50 * * * *` (every 15 min, offset from feeds)
- `ingest-weather` — `*/30 * * * *` (every 30 min), `runOnStart: true`
- `ingest-transit` — `*/5 * * * *` (every 5 min), `runOnStart: true`
- `ingest-events` — `0 */6 * * *` (every 6 hours)

### 4. FNV-1a hash utility (`packages/server/src/lib/hash.ts`)

Copy the FNV-1a hash function from worldmonitor for building deterministic cache keys.

**Reference:** `.worldmonitor/server/_shared/hash.ts`

### 5. City config loader (`packages/server/src/config/`)

Server-side city config that mirrors the shared types. Load active cities from `ACTIVE_CITIES` env var.

```typescript
// config/cities/berlin.ts — Berlin config with feeds and data sources
// config/index.ts — loads all active city configs

export function getActiveCities(): CityConfig[]
export function getCityConfig(cityId: string): CityConfig | undefined
```

Create the Berlin config with ~10 local RSS feeds and data source URLs.

### 6. Express app structure (`packages/server/src/index.ts`)

```typescript
import express from 'express';
import cors from 'cors';
import { startScheduler } from './lib/scheduler';
import { healthRouter } from './routes/health';
// ... future route imports

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', healthRouter);
// app.use('/api/:city', cityRouter);  — added in milestone 04

// Start scheduler
startScheduler(jobs);

app.listen(Number(process.env.PORT) || 3001);
```

### 7. Health endpoint (`packages/server/src/routes/health.ts`)

```typescript
GET /api/health → {
  status: 'ok',
  uptime: process.uptime(),
  activeCities: ['berlin'],
  database: { connected: boolean, latencyMs: number },
  cache: { entries: number, hitRate: number },
  scheduler: { jobs: [{ name, lastRun, nextRun }] }
}
```

The health check runs a simple `SELECT 1` to verify DB connectivity.

---

## Done when

- [ ] Drizzle connects to Postgres; migrations run successfully
- [ ] `cache.fetch()` works with in-memory store and coalescing
- [ ] `cache.fetch()` calls Postgres-backed fetchers on cache miss
- [ ] `createRateGate(600)` enforces 600ms minimum gap between calls
- [ ] `node-cron` jobs are registered and fire on schedule (stubs log to console)
- [ ] `GET /api/health` returns status with database connectivity and scheduler info
- [ ] Berlin city config loads with feeds and data source URLs
- [ ] Cache warmup populates memory cache from Postgres on server start
