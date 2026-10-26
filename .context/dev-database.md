# Dev Database with Synthetic Data

A local Postgres filled with made-up Berlin data for every dashboard tile and map layer, and an API mode that serves it with no cron jobs, no API keys, no `.env` and no outbound requests. Use it to work on the frontend or the API without production access.

## Commands

```bash
docker compose up -d db                  # Postgres 17 on localhost:5434 (db city_monitor_dev, user cmdev)
npm run db:seed                          # migrate, wipe, seed; `npm run db:seed -- --seed 7` for another data set
npm run dev:synthetic                    # API on port 3001 in synthetic mode
npm run dev --workspace=packages/web     # second terminal: web app on port 5173
```

Both root scripts build `shared` first, because the server imports its compiled Zod schemas. Port 3001 must be free, so stop a regular `npm run dev` first.

- **`db:seed` wipes without asking.** It empties every app table in the docker `db` on each run. Keep nothing there you want to keep.
- **A volume set up with `db:push` makes the migrator fail.** Such a database has tables but no migrations journal, and the seed stops with "relation already exists". Run `docker compose down -v` to delete the volume and its data, then `docker compose up -d db` and seed again.

## Pieces (`packages/server/src/`)

- `synthetic/generate.ts` — `generateSyntheticData({ now, seed })`.
  - The same seed and `now` give the same data (mulberry32), and every timestamp is relative to `now`.
  - Places come from rough Bezirk centres inside the Berlin bounding box.
  - Text is German and marked `[Synthetisch]`, people are `Testperson NNN` and links go to example.com. There is no real news or police text.
  - Shapes come from `shared/types.ts`. Budget, appointments, wastewater and council meetings reuse the ingestion helpers.
  - The briefing's model is `synthetic-seed-<seed>`, so the database records which seed it holds.
- `synthetic/seed.ts`
  - `openLocalDatabase(url)` runs the guard and connects. `wipeDatabase` and `seedDatabase` take only a handle it returned, and throw for anything else. The handle is frozen, so its `db` cannot be swapped for another connection after the guard ran.
  - `wipeDatabase` truncates every table in the Drizzle schema, but not Drizzle's migrations journal.
  - `seedDatabase` writes through the `save*` functions in `db/writes.ts`.
  - For the history endpoints it also writes a week of hourly weather and water-level snapshots and 23 months of labour-market snapshots. The air-quality grid gets the current snapshot only, as in production.
- `scripts/seed-synthetic.ts` — `db:seed`: the guard, then the `drizzle-orm` migrator (the same journal table `drizzle-kit migrate` uses), then wipe and seed.
- `dev-synthetic.ts` — `dev:synthetic`:
  - runs the guard and sets `DATABASE_URL` and `ACTIVE_CITIES=berlin` in code;
  - blocks outbound `fetch`;
  - calls `createApp({ synthetic: true })`;
  - caches the current air quality. Production keeps air quality in the cache only, so the seed has no table to write it to. The entry reads the seed from the briefing's model, and the values depend on the seed alone, so they match the seeded data set.

## Guard (`synthetic/local-guard.ts`)

The seed, the wipe and synthetic mode read `SYNTHETIC_DATABASE_URL`, falling back to the docker-compose URL. They never read `DATABASE_URL`. `assertLocalDatabaseUrl` refuses a URL in any of these cases, and says which:

- its host is not localhost or 127.0.0.1. IPv6 `::1` is refused too, because postgres.js cannot connect to a bracketed host;
- it lists several hosts (postgres.js multi-host syntax, percent-encoded commas included);
- it has no host or no database name, since postgres.js would then fall back to `PGHOST` or `PGDATABASE`;
- it has a query parameter other than `sslmode`, `connect_timeout` or `application_name`, in any case. postgres.js sends query parameters as startup parameters, where `database` or `user` override the URL's, and libpq tools honour `host` and `hostaddr`;
- its database is not `city_monitor_dev`. A local port can be an SSH tunnel or port forward to a remote server, so another local database needs `SYNTHETIC_ALLOW_DATABASE_NAME=<name>`.

The error names the host or the database but never the password.

## Synthetic mode

`createApp({ synthetic: true })` turns off:

- the scheduler, so no cron job runs, nothing runs on startup, and `triggerJob` is a no-op;
- the freshness check;
- the weather-tiles router, which fetches RainViewer as soon as it is created;
- `preCacheBezirke`, whose real mayors would replace the placeholder names.

`blockExternalFetch()` rejects every `fetch` to another host. A route's live fallback (current air quality, the AQ grid) therefore fails quietly and calls no API.

Nothing in synthetic mode reads `.env`. The scripts pass no `--env-file`, and the entry sets `DATABASE_URL` itself, so neither `.env` nor the shell can point it at another database. Production starts from `index.ts` with `createApp()` and does not change.

## Ageing

The data is dated when you seed it. Once the cache-warm TTLs expire, the routes fall back to the database, and some reads there refuse old rows:

| Data | Refused after |
|---|---|
| Noise sensors | 2h |
| NINA warnings | 3h |
| AQ grid | 6h |
| Pollen, council meetings, events | 48h |

After that those tiles go empty. Run `npm run db:seed` again and restart `dev:synthetic`.

## Not covered

- **Rain radar:** the RainViewer router is not mounted.
- **Browser-side layers:** the web app still loads the CARTO base map tiles and the gdi.berlin.de WMS overlays (noise, rent) from the internet.
- **Hamburg:** only Berlin is seeded.

## Adding a data source

Add the new source to `generate.ts` and `seed.ts` (item 26 in [new-data-sources.md](new-data-sources.md)).

- `seed.test.ts` fails until every `SNAPSHOT_TYPES` entry is seeded.
- `generate.test.ts` validates the data against the shared Zod schemas and checks the Berlin bounds and freshness.
