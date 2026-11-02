# Transit System

## Architecture

Transit data flows from the VBB transport.rest API (Berlin, `provider: 'hafas'`) or HVV's Geofox GTI (Hamburg, `provider: 'geofox'`, see [Hamburg](#hamburg)) through a server-side cron job into PostgreSQL and the in-memory cache, then to the React frontend via a REST endpoint. The steps below describe Berlin; Hamburg differs only in the fetch and mapping.

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-transit.ts`) — Runs every 15 minutes. Polls departures with disruption remarks from 12 interchange stations covering all Berlin U+S lines via `v6.vbb.transport.rest`. Stations are polled one after another, 1.5 s apart. Extracts warning-type remarks with station name, location (lat/lon), and full detail text (`remark.text`). Only `type`, `summary` and `text` are read from each remark; validity fields the API may send on warnings (e.g. `validFrom`/`validUntil`) are not captured, so alerts carry no start/end time. Groups by `summary:station` key (see Deduplication), classifies type and severity from keywords, and writes `TransitAlert[]` to cache (`{cityId}:transit:alerts`, TTL 1200s) + DB. Skips cache write if all stations fail.

2. **API** (`packages/server/src/routes/transit.ts`) — `GET /api/:city/transit` returns cached alerts, falls back to the DB (`loadTransitAlerts`), then `[]`.

3. **Frontend** — Two display surfaces:
   - **TransitStrip** (`components/strips/TransitStrip.tsx`) — One row per alert: severity dot, line badges and the summary clamped to one line (6 rows collapsed, 12 when the tile is expanded). Each row is a `<button aria-expanded>` that expands in place to the full summary, the full `detail` text (skipped when it equals the summary) and the station ("Reported at", `panel.transit.station`); long words wrap (`wrap-anywhere`). Rows expand independently and start collapsed in both tile modes. There is no time-range field: any "bis …" validity only appears inside `detail`. What an empty list says depends on the response's `fetchedAt` (the end of the last ingestion run that reached at least one station) and `staleAfter('transit')` in `lib/freshness.ts` (37 min: the 15-min run plus 15 min of grace plus the browser's refetch and HTTP cache, so two runs in a row have been missed), the same limit that turns the footer "outdated":
     - fresh and empty: "All clear — no disruptions" and "Checked 07:12", the check's time on the city's clock (`formatClockTime`, city config `timezone`);
     - `fetchedAt: null` (nothing ingested yet, a city without `dataSources.transit`, or Hamburg without its Geofox credentials): "No transit data available";
     - stale: the alerts it has, under "Data may be outdated (last checked 05:12)", or only that note when there are none; never "All clear". The time gets its date when it is not from today.
   - **CityMap** (`components/map/layers/transit.ts`) — Transit markers as severity-colored TrainFront badge icons, with the line label, at each alert's station location. Click popup shows the station as heading, then for each alert its line, translated type label and the full `detail` text.

### Key Types

```typescript
interface TransitAlert {
  id: string;           // hashString(`${summary}:${station}`)
  line: string;         // all affected lines joined, e.g. "S41, S42"
  lines: string[];      // ["S41", "S42"]
  type: 'delay' | 'disruption' | 'cancellation' | 'planned-work';
  severity: 'low' | 'medium' | 'high';
  message: string;      // remark.summary (short)
  detail: string;       // remark.text (full description with station/elevator specifics)
  station: string;      // departure.stop.name (e.g. "S+U Alexanderplatz Bhf (Berlin)")
  location: { lat: number; lon: number } | null;  // departure.stop.location
  affectedStops: string[];
}
```

### Station Coverage (Berlin)

12 interchange stations covering all U1–U9 + S1–S85 lines:
Alexanderplatz, Hauptbahnhof, Zoologischer Garten, Friedrichstraße, Gesundbrunnen, Ostkreuz, Südkreuz, Westkreuz, Nollendorfplatz, Mehringdamm, Hermannplatz, Spandau.

Stations are configured in `packages/server/src/config/cities/berlin.ts` as `dataSources.transit.stations[]` with VBB station IDs (and `endpoint`, default `https://v6.vbb.transport.rest`).

### Deduplication

Alerts are keyed by `${summary}:${station}`. The same remark at the same station on several lines becomes one alert whose `lines` lists each line (and `line` joins them). The same remark at two different stations stays two alerts, which is why the expanded row names the station.

### Classification

`lib/transit-classify.ts`, shared by both providers. Case-insensitive keyword match on the remark summary (German, with English equivalents):

- **Type**: cancellation (`ausfall`, `cancel`), planned-work (`bauarbeit`, `planned`, `sperrung`), delay (`verspätung`, `delay`), disruption (default)
- **Severity**: high (`ausfall`, `cancel`, `sperrung`, `störung`, `disruption`), medium (`verspätung`, `delay`), low (other)

### DB Schema

Unified `snapshots` table, type `vbb-disruptions` — data JSONB stores the full `TransitAlert[]` array as a single snapshot per fetch. Persisted via `saveTransitAlerts()` in `writes.ts` on every ingestion run (if DB connected). Data retention: 2 days plus the 100-row cap (`CAPPED_RETENTION` in `cron/data-retention.ts`).

### Hamburg

Hamburg's alerts are HVV's announcements (Störungs- und Betriebsmeldungen) from the Geofox Thin Interface (GTI) of HOCHBAHN, run by HBT. Config: `dataSources.transit = { provider: 'geofox', endpoint: 'https://gti.geofox.de' }`. Code: `lib/geofox.ts` (signing, request, mapping), called from `ingest-transit.ts`. The API description is the GTI Anwenderhandbuch at https://gti.geofox.de (HTML and PDF, version 63.4 for API version 63; also an OpenAPI file at `/v3/api-docs/public`).

- **Credentials.** `GEOFOX_USER` (the application ID) and `GEOFOX_PASSWORD` (the "Passwort für die Signatur-Erzeugung"), granted to City Monitor by Hochbahn on request (asked 2026-11-01, answered by 2026-11-02). Without both, the job skips Hamburg and logs that once per process; the startup freshness check also leaves Hamburg out (`ingestsTransit`). They exist only on Render and in the owner's local `.env`, never in the repository. **An AGPL fork must request its own credentials** from Hochbahn (hvv.de → "Datenabruf"): the terms grant access per user, forbid passing content or rights on to third parties and include a confidentiality clause.
- **Request.** One `POST /gti/public/getAnnouncements` per 15-minute run, body `{"language":"de","version":63,"full":true,"filterPlanned":"NO_FILTER"}`. `version` must be sent: without it GTI answers as API version 1. `full: true` fills the lines and stops of each location. Headers: `Content-Type: application/json;charset=UTF-8`, `geofox-auth-user`, `geofox-auth-type: HmacSHA1`, `geofox-auth-signature` (Base64 HMAC-SHA1 of the exact body bytes, keyed with the UTF-8 password; the same string is signed and sent), `X-Platform: web`. A wrong or missing signature gets HTTP 401 with `{"returnCode":"ERROR_TEXT","errorDevInfo":"Authentication failed!"}` (seen on an unauthenticated call, 2026-11-02). On any non-OK answer the job writes nothing, so the last alerts stay until they go stale.
- **Which announcements.** Those in force now: inside one of their `validities`. One inside its `publication` period but outside every validity is an advance notice and left out, as Berlin shows current disruptions only. Without validities, the publication period decides. GTI writes offsets without a colon (`+0200`), which `parseGtiDateTime` normalises.
- **Mapping onto `TransitAlert`.** `message` is the `summary`, which unplanned announcements lack; then the description's first sentence (shortened to 160 characters). `detail` is the full `description`, unshortened: the terms require the content to be reproduced correctly. `lines` are the line names of `SINGLE_LINE` locations and the carrier or network name of `ALL_LINES_OF_CARRIER`/`COMPLETE_NET` ones. `station` is the first location's affected section ("Poppenbüttel – Wedel"), empty for a whole line, so the expanded row shows it as "Reported at"; `location` is that section's first stop's coordinate when GTI sends one in WGS84 (the documented example has none), else null and no map marker. `affectedStops` are all begin and end stops. Type and severity come from the shared keyword classifier (`lib/transit-classify.ts`) on the message; a `planned` announcement or reason `ROADWORKS` the keywords call a plain disruption becomes planned work. Announcement `links` (replacement timetables) are not carried.
- **Dedup.** Like VBB: one alert per message and section, so the same text for the same section on several lines lists each line. One announcement covering several lines is one alert.
- **Terms of use and how the code meets them.** From the GTI terms (hvv.de → "Datenabruf", checked 2026-11-02) and the conditions Hochbahn set with the credentials:
  - *Credit, link and "ohne Gewähr" on the tile.* The Hamburg tile's footer shows "Source: hvv / Hamburger Hochbahn AG (hvv.de)" as an underlined link to https://www.hvv.de/, then "All information without guarantee (ohne Gewähr)" (`panel.transit.hvvSource` and `panel.transit.noGuarantee`, translated in all four languages, each keeping the German words "ohne Gewähr"; `CITY_SOURCE` in `TransitStrip.tsx`, keyed by city ID because the web config does not know the provider). The footer shows once data has arrived. The Sources page lists "HVV / Hamburger Hochbahn, Geofox GTI" with a link to hvv.de and "Alle Angaben ohne Gewähr".
  - *hvv's own line representation.* GTI's line data carries no colours, so Hamburg's line badges take the colours of hvv's line icons (`lib/hvv-lines.ts`, sampled 2026-11-02 from `https://cloud.geofox.de/icon/linename?name=<line>&height=40`, the icon service of Anwenderhandbuch §4.3): U1 `#006AB3`, U2 `#E2001A`, U3 `#FFDD00` with black text, U4 `#0098A1`, S1 `#1A962B`, S11 outlined in that green, S2/S21 `#B51143`, S3/S31 `#622181`, S5 `#0089BB`, S7 `#CC7720`, AKN A-lines `#F29400`, HADAG ferries (61, 62, 64, 65, 68, 72, 73, 75) `#009DD1`, Xpressbus `#1A9628` (X11 red), night buses 600–699 black, other buses `#E2001A`; regional and long-distance trains keep the generic badge, as hvv draws them uncoloured. Re-sample when hvv adds or recolours a line. Trade-off: with white 12px text, U4, S1, S5, S7, AKN, Xpressbus and ferries fall below 4.5:1 contrast; they are kept as hvv draws them. Showing hvv's PNG icons instead would load them from cloud.geofox.de in each visitor's browser, which sends the visitor's IP to HBT; not done. Map markers stay severity-coloured.
  - *No passing on to third parties.* The content is shown only in City Monitor's own dashboard. `/api/hamburg/transit` and the `transit` slot of `/api/hamburg/bootstrap` exist to feed that tile; CORS admits only the site's own origins (`ALLOWED_ORIGINS`), there is no transit history endpoint, and nothing in the code exports, syndicates or embeds the data (no CSV/JSON export, feed or widget exists; checked 2026-11-02). The daily AI briefing reads news items only, never transit alerts, so the content does not go to OpenAI. Any future export, public-API documentation, embeddable widget or LLM input must leave Hamburg's transit alerts out unless Hochbahn agrees in writing.
  - *Errors in the data* go to Hochbahn by email (the address in the access agreement; api@hochbahn.de handled the request), not to a public issue tracker: the terms make faults in programme and data structures confidential. A GitHub issue about Hamburg transit names only the symptom in City Monitor, not the fault in hvv's data.
  - *Load and freshness.* One request per 15 minutes; the terms ask to keep server load low and to fetch current content.
  - *Revocation.* Hochbahn can end access with four weeks' notice; the tile then falls back to "No transit data available" once the credentials are removed.
- **Feature flag.** The web config lists `transit` for Hamburg and `cityFeatures` derives it from the config alone (`hasTransitSource`), as appointments is listed without `FIRECRAWL_API_KEY`: the web feature list is static, so a deployment without the credentials shows the tile with "No transit data available".
- **Storage.** Same snapshot type as Berlin, `vbb-disruptions` (the name is historical), keyed by city.
- **Verified only live** (once the credentials are set): that the signature is accepted, the response size, whether `full: true` locations carry stop coordinates, and how many announcements are in force at a time.
- **Terms questions.** The access request asked whether serving the alerts through the public `/api/hamburg/*` JSON that feeds the dashboard is covered by the third-party clause, and whether disruption notices count as "Fahrplanauskunft". What Hochbahn's answer says on these is not recorded in this repository; check it before widening how the data is served.

### Köln

Köln has no transit alerts: KVB's line disruptions exist only as an unlicensed web page, and gtfs.de carries no KVB alerts. KVB does publish lift and escalator outages as open data; they have their own Köln tile, not `TransitAlert`s ([lift-outages.md](lift-outages.md)).
