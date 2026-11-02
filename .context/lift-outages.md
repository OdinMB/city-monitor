# Lift and Escalator Outages (Köln, KVB)

A small Köln-only dashboard tile listing the lifts and escalators that are out of service at KVB stations. It is not part of the transit tile: `TransitAlert` is built around lines and VBB remarks, and Köln has no transit feature.

## Source

**KVB Open Data** (Kölner Verkehrs-Betriebe AG), dl-de/zero-2.0 (no attribution required; the Sources page credits it anyway). No key.

- Base (server config `dataSources.liftOutages = { provider: 'kvb', url }`): `https://data.webservice-kvb.koeln/service/opendata`
- Lifts: `…/aufzugsstoerung/json`; escalators: `…/fahrtreppenstoerung/json`. GeoJSON FeatureCollections served as `text/plain`, a feature per unit currently out of service, with `Kennung` (e.g. `011-04`), `Bezeichnung` (`Aufzug 04 - HÜ 011 (Dom/HBf.)`), optional `info`, point geometry, and a `timestamp` at collection level.
- **Encoding differs:** the lift list is UTF-8, the escalator list ISO-8859-1. `decodeKvbBody` tries strict UTF-8 and falls back to Latin-1.
- **Timestamps have no offset** (German local time); the parser adds Berlin's offset for that instant.
- Entries include stations outside Köln on KVB lines (e.g. Bensberg). They are kept.
- KVB repeats some units; they are listed once (`kind:id`).
- Live 2026-11-02: 5 lifts and 44 escalators out of service.

## Server

- `cron/ingest-lift-outages.ts`, job `ingest-lift-outages` every 15 min (`*/15 * * * *`), for each active city with `dataSources.liftOutages`. Both lists must parse, otherwise the previous data stays: a missing list is not "all working".
- `splitKvbName` reads the unit ("Aufzug 04") and the station ("Dom/HBf.") from `Bezeichnung`; a name it cannot split is the station with an empty unit.
- Output `LiftOutageData { outages: LiftOutage[]; updated }` (`shared/types.ts`, `LiftOutageDataSchema`): lifts first, then by station (German collation), then by id. `updated` is the newer list time.
- Cache `{city}:lift-outages`, TTL 1200 s; DB snapshot type `kvb-lift-outages` (2-day retention plus the row cap); `loadLiftOutages` max age 2 h; in bootstrap as `liftOutages`.
- Route `GET /api/:city/lift-outages`, cache → DB → `{ data: null, fetchedAt: null }`, `Cache-Control: max-age=300`.

## Frontend

- Feature `liftOutages` (Köln's web config), hook `useLiftOutages` (5-min refetch, seeded by bootstrap), freshness `liftOutages` in `lib/freshness.ts`.
- `LiftOutagesStrip`, expandable, mounted after the transit tile: lifts one row each (five while collapsed, then "+n more"), as they are what wheelchair users and prams depend on; escalators counted per station (the number of stations while collapsed, each station with its count when expanded). An empty list says everything is in service; no data says so. The footer shows KVB's list time and the stale note.
- i18n: `panel.liftOutages.*` in all four bundles.

## Tests

- `cron/ingest-lift-outages.test.ts` — decoding, name splitting, parsing and ordering on recorded, trimmed lists (`cron/fixtures/kvb-aufzugsstoerung.json`, `kvb-fahrtreppenstoerung.json`, 2026-11-02; the escalator fixture is stored as UTF-8 and re-encoded to Latin-1 in the test), a failed list, no city with the source.
- `routes/lift-outages.test.ts` — empty, cached (also in bootstrap), unknown city.
- `components/strips/LiftOutagesStrip.test.tsx` — collapsed and expanded lists, empty and missing data.

## Adding another city

Give its server config a `dataSources.liftOutages` with a new provider tag and a parser to `LiftOutage`, add `liftOutages` to its web features, and credit it on the Sources page. Hamburg (HOCHBAHN) and Berlin (BVG/VBB "brokenlifts") were not checked here.
