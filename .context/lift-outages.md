# Lift and Escalator Outages (KVB Köln, DB stations)

A dashboard tile listing the lifts and escalators that are out of service: KVB's stations in Köln, and the DB (S-Bahn and regional) stations in every city once the DB API key is set. It is not part of the transit tile: `TransitAlert` is built around lines and VBB remarks, and Köln has no transit feature.

## Sources

### KVB (Köln)

**KVB Open Data** (Kölner Verkehrs-Betriebe AG), dl-de/zero-2.0 (no attribution required; the Sources page credits it anyway). No key.

- Base (server config `dataSources.liftOutages = { provider: 'kvb', url }`): `https://data.webservice-kvb.koeln/service/opendata`
- Lifts: `…/aufzugsstoerung/json`; escalators: `…/fahrtreppenstoerung/json`. GeoJSON FeatureCollections served as `text/plain`, a feature per unit currently out of service, with `Kennung` (e.g. `011-04`), `Bezeichnung` (`Aufzug 04 - HÜ 011 (Dom/HBf.)`), optional `info`, point geometry, and a `timestamp` at collection level.
- **Encoding differs:** the lift list is UTF-8, the escalator list ISO-8859-1. `decodeKvbBody` tries strict UTF-8 and falls back to Latin-1.
- **Timestamps have no offset** (German local time); the parser adds Berlin's offset for that instant.
- Entries include stations outside Köln on KVB lines (e.g. Bensberg). They are kept.
- KVB repeats some units; they are listed once (`kind:id`).
- Live 2026-11-02: 5 lifts and 44 escalators out of service.

### DB stations (FaSta) — built, not yet live

**DB FaSta v2** ("Station Facilities Status") on the DB API Marketplace, CC BY 4.0 (product page: "Dieser Datensatz wird bereitgestellt unter der Lizenz Creative Commons Attribution 4.0 International (CC BY 4.0)"; the Sources page credits "Deutsche Bahn AG"). Free plan "Free4All", 60 calls per second. Covers every DB station's lifts and escalators: S-Bahn and regional stations in all four cities, not U-Bahn, tram or KVB.

- **Needs a key.** The marketplace issues a client id and an API key per subscription; the server reads them from `DB_API_CLIENT_ID` and `DB_API_KEY` and sends them as the `DB-Client-ID` and `DB-Api-Key` headers. Without both, the job logs once per process "DB_API_CLIENT_ID or DB_API_KEY not set, skipping DB station lifts (FaSta)" and fetches nothing from DB. The API answers 401 without them.
- **Untested against live data.** No key was registered when this was built (2026-11-03), so the parser follows the published OpenAPI 3.0.1 spec (embedded in `developers.deutschebahn.com/db-api-marketplace/apis/product/fasta/api/88996`) and the test data in `cron/ingest-lift-outages.test.ts` is made up from its `facility` schema. Check the first live run's log and tile (see "Switching it on").
- Config `dataSources.stationLifts = { provider: 'db-fasta' }` in all four server configs. One request per city and run: `GET https://apis.deutschebahn.com/db-api-marketplace/apis/fasta/v2/facilities?type=ELEVATOR,ESCALATOR&state=INACTIVE&area=<west>,<south>,<east>,<north>` with the city's `boundingBox` (array parameters comma-separated: `style: form, explode: false`). The box takes in some stations just outside the city (Potsdam-Babelsberg, Pinneberg …); they are kept, as KVB's Bensberg is.
- `state=INACTIVE` only: `UNKNOWN` means DB's monitoring of the unit is down, not that it is broken.
- A `facility` carries `equipmentnumber`, `type` (ELEVATOR/ESCALATOR), `state`, `stationnumber` (required), and `description` ("zu Gleis 3/4", the unit's place), `stateExplanation`, `geocoordX`/`geocoordY` (WGS84 lon/lat), `operatorname`, `operationalResumeDate` (YYYY-MM-DD, for INACTIVE units with a planned return). It has **no station name**: the job asks `GET …/stations/{stationnumber}` once per unknown station and keeps the names for the process; a failed lookup shows "DB <number>" until a later run.
- Mapped to `LiftOutage` as id `db-<equipmentnumber>`, unit = `description`, info = `stateExplanation` unless it is the stock "not available", `operator: 'db'`, `resumeDate`. FaSta gives no list time, so a city with DB stations only has `updated: null`.

## Server

- `cron/ingest-lift-outages.ts`, job `ingest-lift-outages` every 15 min (`*/15 * * * *`), for each active city where `ingestsLiftOutages` holds: KVB configured, or `stationLifts` configured and the DB key set. Every source the city has must answer, otherwise the previous data stays: a missing list is not "all working".
- `splitKvbName` reads the unit ("Aufzug 04") and the station ("Dom/HBf.") from `Bezeichnung`; a name it cannot split is the station with an empty unit.
- Output `LiftOutageData { outages: LiftOutage[]; updated }` (`shared/types.ts`, `LiftOutageDataSchema`): KVB and DB merged, lifts first, then by station (German collation), then by id. `updated` is the newest KVB list time.
- Cache `{city}:lift-outages`, TTL 1200 s; DB snapshot type `kvb-lift-outages` for both sources (the historical name; 2-day retention plus the row cap); `loadLiftOutages` max age 2 h; in bootstrap as `liftOutages`. The startup freshness check (`FRESHNESS_SPECS`) serves the same cities as the job.
- Route `GET /api/:city/lift-outages`, cache → DB → `{ data: null, fetchedAt: null }`, `Cache-Control: max-age=300`.

## Frontend

- Features `liftOutages` (KVB, Köln's web config) and `stationLifts` (DB, all four). `stationLifts` follows the config alone, as Geofox's transit feature does, so the parity test holds whether or not the key is set; it names no topic on the city picker.
- `LiftOutagesTile` (in `CommandLayout.tsx`) mounts the tile for either feature, but in a city without KVB it renders nothing while the server has no data: without the DB key Berlin, Hamburg and München show no lift tile at all, and the tile appears by itself once the key is set. Köln keeps its KVB tile, which says "No outage data" when that list is missing.
- Hook `useLiftOutages` (5-min refetch, seeded by bootstrap), freshness `liftOutages` in `lib/freshness.ts`.
- `LiftOutagesStrip`, expandable, mounted after the transit tile: lifts one row each (five while collapsed, then "+n more"), as they are what wheelchair users and prams depend on; escalators counted per station (the number of stations while collapsed, each station with its count when expanded). Where the list mixes KVB and DB (Köln) DB rows carry a "DB" tag; DB's planned return date shows as "back <date>". An empty list says everything is in service; no data says so. The footer shows KVB's list time and the stale note.
- i18n: `panel.liftOutages.*` in all four bundles.
- Sources page: "DB FaSta (Deutsche Bahn)" (`requires: 'stationLifts'`), credited wherever the config names it, as Geofox is, key or not.

## Switching DB stations on

1. Register at developers.deutschebahn.com (DB API Marketplace), create an application, and subscribe it to FaSta's free plan "Free4All".
2. Set the application's client id and API key as `DB_API_CLIENT_ID` and `DB_API_KEY` on the Render API service (`render.yaml` declares both with `sync: false`). No code change, no web rebuild.
3. After the next run (within 15 min, or on restart), check the log for "<city>: n at DB stations" and the tiles in Berlin, Hamburg, München and Köln. If FaSta's live answer differs from the spec (field names, a wrapper object, a different `area` order), fix `parseFastaFacilities` / `fastaFacilitiesUrl` and replace the made-up test data with a trimmed recorded answer.

## Tests

- `cron/ingest-lift-outages.test.ts` — KVB decoding, name splitting, parsing and ordering on recorded, trimmed lists (`cron/fixtures/kvb-aufzugsstoerung.json`, `kvb-fahrtreppenstoerung.json`, 2026-11-02; the escalator fixture is stored as UTF-8 and re-encoded to Latin-1 in the test), a failed list, no city with the source; FaSta credentials, URL, parsing on spec-built data, the headers, Berlin DB-only, Köln merged, a failed FaSta call, no request without the key.
- `routes/lift-outages.test.ts` — empty, cached (also in bootstrap), unknown city.
- `components/strips/LiftOutagesStrip.test.tsx` — collapsed and expanded lists, empty and missing data, the DB tag and return date.
- `components/layout/CommandLayout.test.tsx` (`LiftOutagesTile`) — hidden without DB data in a DB-only city, shown with it, Köln's KVB tile kept.

## Adding another source

Give the city's server config a new provider (a `LiftOutageSource` variant or a new `dataSources` key) with a parser to `LiftOutage`, its feature in the web config, and its Sources-page credit. Hamburg (HOCHBAHN U-Bahn) and Berlin (BVG/VBB "brokenlifts") were not checked here.
