# Events & Safety System

## Safety Reports

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-safety.ts`) — Runs every 10 minutes. Fetches each city's police RSS feed (`dataSources.police.url`) using the shared `parseFeed()` RSS parser. Extracts `SafetyReport[]` with district detection (the city's `dataSources.police.districts` list), writes to cache key `{cityId}:safety:recent` (TTL 900s, or twice `minIntervalMinutes`). A source with `minIntervalMinutes` is skipped until that much time (less a minute) has passed since its last fetch, so München (15) is fetched every 20 minutes. Provider `polizei-bayern` works differently, see München below.

2. **API** (`packages/server/src/routes/safety.ts`) — `GET /api/:city/safety` returns cached reports or `[]`.

3. **Frontend** — There is no police-report tile. `useSafety()` (refetch 10 min) feeds the map: with the news layer's `police` sub-layer on, `CityMap.tsx` passes the reports to `updateSafetyMarkers()` in `packages/web/src/components/map/layers/news-safety.ts`, which pins reports that have coordinates; the popup (`safetyPopupHtml`) shows title, district, the AI-estimated place and a link to the full report. Separately, Berlin's police press releases are also a news feed (`Polizei Berlin`, feed `category: 'crime'`), so they appear in the news strip, normally under the Crime tab. The feed category is only the starting value: the LLM classifier's category replaces it (`ingest-feeds.ts`).

### Key Types

```typescript
interface SafetyReport {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  district?: string;  // First entry of the city's district list found in the title
  location?: { lat: number; lon: number; label?: string };  // LLM label + geocoding, see below
}
```

### District Extraction

`extractDistrict()` returns the first name from the city's `dataSources.police.districts` that appears in the report title. Berlin lists its districts and larger neighbourhoods (Mitte, Kreuzberg, …); Hamburg lists its Bezirke and Stadtteile, longer compound names before the shorter names they contain (e.g. `Altona-Altstadt` before `Altona`). Köln lists its 9 Stadtbezirke, then Stadtteile in the same order rule (`Weidenpesch` before `Weiden` and `Pesch`), leaving out names that are common words or parts of other words (`Brück`, `Rath`, `Wahn`, `Weiß`, `Eil`, `Esch`, `Lind`); `config.test.ts` checks that no name contains an earlier one. The match is case-sensitive and the district is only a label in the popup: nothing joins it to political or boundary data, so a city without political data or district outlines (Köln) loses nothing. A city without a list gets no district. München has no list: its bulletin headlines name the place themselves (see Data Sources).

### Location Extraction

Map pins come from two steps: `geolocateReports()` (`lib/openai.ts`, model `OPENAI_GEO_MODEL`, falling back to `OPENAI_FILTER_MODEL`) asks the LLM for a location label per report, then `geocode()` turns the label into coordinates. Coordinates carry over by hash via `loadSafetyGeoState()`, so a placed report is never re-sent. `safety_reports.geo_attempted` stops the other re-send: once a *successful* LLM pass leaves a report without coordinates (no label, left out, or label did not geocode), it is marked and skipped on every later run. A failed call, or a response rejected by `checkBatchIndices`, marks nothing, so those reports are retried. The marker lives only in the DB row — it is not part of `SafetyReport` and never reaches the cache or API. Cache-only mode (no `DATABASE_URL`) still re-sends every unplaced report each run.

### Data Sources

- **Berlin:** `https://www.berlin.de/presse/pressemitteilungen/index/feed?institutions[]=Polizei+Berlin`
- **Hamburg:** `https://www.presseportal.de/rss/dienststelle_6337.rss2` (Polizei Hamburg). Until 2026-11-01 the config pointed at newsroom 6013, which is Polizeipräsidium Mittelfranken, so Hamburg showed Nürnberg and Fürth reports; old rows go with the safety retention. Find a force's newsroom number on `presseportal.de/blaulicht/l/<state>` and check the feed's `<title>` before wiring it.
- **Köln:** `https://www.presseportal.de/rss/dienststelle_12415.rss2` (Polizei Köln, added 2026-11-01; channel "Presseportal.de - Polizei Köln", titles `POL-K: …`). The force also covers Leverkusen (titles with `-LEV` in the case number), so `Leverkusen` closes the district list; the LLM place extraction and geocoding decide the pin. Same presseportal licence as Hamburg (below).
- **München:** `https://www.polizei.bayern.de/rss/polizeiprasidium-munchen.xml` (Polizeipräsidium München, provider `polizei-bayern`, added 2026-11-05). Not a presseportal newsroom, and polizei.bayern.de's `robots.txt` says `User-agent: *` / `Disallow: /`; the Präsidium's Social-Media-Team allowed the feed in writing on 2026-11-05 (record in the -pm repo, `artifacts/outreach/2026-11-05_muenchen-polizei-pressemeldungen-rss.md`): polling every 15 minutes is fine (`minIntervalMinutes: 15`), for list and map points with credit and link. **`/fahndung` is excluded**: searches, above all for missing persons, are often withdrawn and the police want no stale copies, so never show them. Each feed item is one daily "Medieninformation" bulletin with no report text (title and description are both "Medieninformation … vom <date>"; `pubDate` has no zone and is München time). `lib/polizei-bayern.ts` therefore reads each new bulletin page once (one to three a day, kept in memory while the item is in the feed, so a restart reads them again) and splits it at its numbered `<h3>` headings ("1739. Mehrere Wohnungseinbrüche – Stadtgebiet München"): title without the number, district from after the last spaced dash ("Stadtgebiet München" gives none; places in the Landkreis come through as they are), text cut to a 300-character teaser, url the bulletin page. Feed items under `/fahndung` are never fetched and reports whose headline says Fahndung, vermisst or abgängig are dropped; report texts are not checked, since "eine sofort eingeleitete Fahndung" is common in ordinary reports. Feuerwehr München's presseportal feed is a news feed instead (`news.md`).

Licence (checked 2026-11-01): presseportal's terms (`/nutzungsbedingungen`) allow editorial use and name processing "mithilfe von künstlicher Intelligenz" as part of it, with media-law responsibility passing to the user; use "für eigene Geschäftszwecke" needs news aktuell's written permission. Automatically embedding ots content on a third-party site formally needs an application, with these rules (`api.presseportal.de/nutzungsbestimmungen/`): show `(ots)`, link the original, publish any usage notes, hide after 2 years. `robots.txt` blocks AI training crawlers but not `/rss/`; no RSL file, no `tdmrep.json`. No explicit AI-input ban, so the feed stays; whether to file the embedding application is open.

Source URL configured per city in `dataSources.police.url`.

## Events

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-events.ts`) — Runs every 6 hours, as a heavy job (HHT's export). For each city with `dataSources.events` (Berlin, Hamburg and Köln), fetches every configured source in turn (kulturdaten.berlin, Ticketmaster, go~mus for Berlin; Hamburg Tourismus for Hamburg; Stadt Köln open data for Köln), keeps future events, and saves each source's events to the DB (`saveEvents`, 500 rows per insert, every corrected field updated on conflict). Then merges all sources, sorts by date, caps at 200 (`MAX_FUTURE_EVENTS`) and writes `CityEvent[]` to cache key `{cityId}:events:upcoming` (TTL 6h); an empty merge leaves the cache as it was. A failing source is logged and skipped.

2. **API** (`packages/server/src/routes/events.ts`) — `GET /api/:city/events` returns cached events, falls back to the DB (`loadEvents`, upcoming rows only), then `[]`. Past events are filtered out on every read. Every response with events, bootstrap's too, passes the HHT gate (`servedEvents`, below).

3. **Frontend** (`packages/web/src/components/strips/EventsStrip.tsx`) — `useEvents()` (refetch 30 min). Source filter (All / Community / Tickets / Museums / City), shown when at least two sources have events (so never for Köln, which has one); category filter pills for categories present; up to 25 events (`MAX_VISIBLE`). Each row shows category icon, title, day and time, and a "Free" badge; rows with detail expand to venue, description, end date, price, the event link and a separate booking link (`bookingUrl`). Times are the city's wall-clock time: an offset-less date is read as UTC and shown in UTC, like a stored one, so the browser's zone never shifts it.

### Data Sources

Configured per city as `EventSourceConfig[]` (`source`, `url`, optional `lookaheadDays`).

- **kulturdaten.berlin API** (Technologiestiftung Berlin; free, no API key): `https://api-v2.kulturdaten.berlin/api/events`. Events from Berlin district calendars (Bezirkskalender) for the next `lookaheadDays` (default 14), up to 3 pages of 50, published events only. Swagger docs: `https://api-v2.kulturdaten.berlin/api/docs/`
- **Ticketmaster Discovery API**: `https://app.ticketmaster.com/discovery/v2/events.json`, queried by city name and country, 100 events. Skipped without `TICKETMASTER_CONSUMER_KEY` (see `deployment.md`).
- **go~mus** (Berlin state museums): `https://smb.gomus.de/api/v4/events`, bookable events; the date is the first upcoming booking time.
- **Stadt Köln open data** (`source: 'stadt-koeln'`, Köln): `https://www.stadt-koeln.de/externe-dienste/open-data/events-od.php?ndays=<lookaheadDays>&nobrs=1`, JSON `{ count, items, success }`. Only events the city runs itself (libraries, museums, town hall, district offices), ~110 in 14 days. Licence dl-de/zero-2.0 ([dataset](https://www.offenedaten-koeln.de/dataset/veranstaltungen-der-stadt-koeln)), credited on the Sources page anyway. Each item has `title`, `description`, `beginndatum`/`endedatum` (dates), a free-text `uhrzeit` ("von 18:30 bis 19:30", "15 bis 16:30 Uhr"; `koelnStartTime` takes the first hour, else midnight = no time shown), `veranstaltungsort` + `stadtteil` (joined as venue), `preis` (free when it says kostenlos/Eintritt frei, else kept as the price) and `link` (rewritten to https; its numeric id becomes `stadt-koeln-<id>`). Dates are offset-less local time, like kulturdaten. An exhibition that began before today is dropped by the future-only filter, as for every source. The http URL answers 403; use https.
- **Hamburg Tourismus** (`source: 'hht'`, Hamburg): see the next section.
- **München:** no open events feed (opendata.muenchen.de has only historic CSVs; muenchen.de's event pages are private-use only), so no events source.

### Hamburg Tourismus

Hamburg's events come from Hamburg Tourismus' Veranstaltungsdatenbank under a contract between HHT and City Monitor. **A fork needs its own contract with HHT and its own FTP login**; without `HHT_FTP_USER` and `HHT_FTP_PASSWORD` the source is skipped with one warning. **Never commit a real HHT record** (event, venue, id or link): the fixture `lib/hht-fixtures/export-sample.xml` and the synthetic seed are invented in the export's shape.

- **Export:** a ZIP holding `hamburg25.xml` (about 68 MB, ~9,500 events, ~1,300 venues), refreshed daily, on `ftp.infomaxnet.de` over FTPS, explicit TLS on port 21 (`lib/hht-ftp.ts`, basic-ftp; `HHT_FTP_HOST` and `HHT_FTP_FILE` override the config URL's parts). Only the compressed archive is held (capped at 64 MB); the XML member is unpacked and read as a stream (`lib/hht-xml.ts`, saxes), so neither the document nor a DOM is ever in memory. From the venues (`<pois>`) it keeps the German title and the city only.
- **Download cadence** (`cron/events-hht.ts`): at most once in 20 hours. In between, the job serves the last download from memory, or after a restart from its saved rows (`loadLatestEventBatch`: the newest row's `fetchedAt` is the last download, so those rows are not saved again). A failed download serves the saved rows if there are any.
- **Mapping** (`lib/hht-events.ts`): published events (`entityState`) whose venue's city is Hamburg (case-insensitive) with a non-cancelled date starting in the next 14 days (Hamburg wall-clock time), one `CityEvent` per event on its next such date, id `hht-<event id>`. German title (no German title, no event); description from the German short description, else the description, HTML stripped and entities decoded (`toTeaser`, 500 characters); venue = the venue's German title; `url` = the German link, else the English; `bookingUrl` = the date's booking link, else the event's (left out when it equals `url`); `free` = `freeOfCharge`; `price` from `absolutePrice`, else `fromPrice`/`toPrice` ("49,90 €", "12–24,50 €", "ab 8 €"). About 2,100 events from a real export.
- **Contract rules:** German text only (the strip marks it `lang="de"`); no images (`<media>` is never read) and no venue descriptions; the event link and the booking link shown apart; **no price or free flag for CTS EVENTIM's events, client id 77** (contract 2.11; tested with a fixture). Wherever HHT events are shown, the strip links HHT's "suggest an event" form (`https://eingabe.hamburg.events/`) and its error address (`mailto:veranstaltungsdatenbank@hamburg-tourismus.de`), translated in all four languages, and the Sources page credits "Veranstaltungsdatenbank Hamburg Tourismus" — both only while the API returns HHT events. HHT data must never reach an export or embed path; none exists.
- **Categories:** `HHT_CATEGORIES` maps all 97 German category names of the export (Konzerte and its genres, Party -> music; Ausstellungen, Film, Lesungen -> art; Ausstellungen & Museen, Dauerausstellungen -> museum; Theater & Bühne, Musicals & Shows -> theater; Märkte, Jahrmärkte -> market; Sport & Bewegung -> sport; Feste, Bildung, Bürgerangebote, Vorträge -> community; tours, trade fairs, Sonstige -> other). An event takes the first of its categories that maps to more than other. A name missing from the map counts as other: add it when HHT adds one.

#### The preview gate

**Open since 2026-11-05:** HHT approved the integration in writing (email from the Veranstaltungsdatenbank team, filed in the -pm repo), so `HHT_PREVIEW_ONLY` is `false` and everyone sees HHT's events. The gate stays in place (`lib/hht-gate.ts`, `servedEvents`, the one filter on every read path: the events route, its DB fallback and bootstrap) for the opt-out below and for a later source that needs a review first. How it works when on:

- The gate is the code constant `HHT_PREVIEW_ONLY`, not a variable: the owner's rule is that no environment variable ever has to be set to `true` ([deployment.md](deployment.md#source-opt-outs)).
- `HHT_EVENTS=false` on the API service (a source opt-out) hides them from everyone, token or not, also after they go public: the quick takedown HHT may ask for (contract 2.9).
- While in preview, only a request whose `X-Preview-Token` header equals `HHT_EVENTS_PREVIEW_TOKEN` gets them (compared in constant time; a token unset or shorter than 16 characters admits no one). Such a response is `Cache-Control: private, no-store`, and every events response sends `Vary: X-Preview-Token`, so no CDN, shared cache or browser cache keeps preview data. The in-process cache holds all events; the gate filters on the way out. CORS reflects the requested headers, so the web app may send it (`routes/events-gate.test.ts`).
- The web app takes a review link's `?preview=<token>` (`lib/preview-token.ts`), keeps it in sessionStorage as `hht-preview` (in memory where storage is blocked), removes it from the address bar and sends it with the events and bootstrap requests only. `?preview=` with no value ends the preview.
- Hamburg's web feature is `hhtEvents`, not `events`: its tile (`EventsTile` in `DashboardTile.tsx`, `useEventsTileShown`, which also hides a section left empty) shows only while the API returns events, so the public page looks as before. A city with any other events source has `events` and keeps its tile, empty or not.

With the gate open, `HHT_EVENTS_PREVIEW_TOKEN` does nothing and can be removed from the API service. The preview links some reviewers tried returned no events because the token held characters a URL changes (`+` becomes a space): a future preview token should be letters and digits only.

### Key Types

```typescript
interface CityEvent {
  id: string;           // source id (go~mus ids are prefixed "gomus-", Köln ids "stadt-koeln-", HHT ids "hht-")
  title: string;
  venue?: string;
  date: string;         // ISO date+time
  endDate?: string;
  category: 'music' | 'art' | 'theater' | 'food' | 'market' | 'sport' | 'community' | 'museum' | 'other';
  url: string;          // empty for kulturdaten and go~mus
  description?: string; // go~mus (HTML stripped), Stadt Köln and HHT, 500 chars
  free?: boolean;
  source: 'kulturdaten' | 'ticketmaster' | 'gomus' | 'stadt-koeln' | 'hht';
  price?: string;       // Ticketmaster price range, Stadt Köln `preis` text, HHT pricing
  bookingUrl?: string;  // HHT: the date's booking link, else the event's
}
```

### Category Classification

- **kulturdaten and Stadt Köln:** keywords in the title (German and English): Konzert/Musik -> music, Ausstellung/Galerie -> art, Theater/Bühne -> theater, Markt/Flohmarkt -> market, Food/Essen -> food, Sport/Lauf -> sport, Workshop/Treff -> community, Museum -> museum, default -> other.
- **Ticketmaster:** the segment name: Music -> music, Sports -> sport, Arts & Theatre -> theater, default -> other.
- **go~mus:** Bühne/Musik/Film/Konzert -> music, Workshop/Kurs/Führung -> community, default -> museum.
- **HHT:** the export's own categories (`HHT_CATEGORIES`, above).

## NINA Civil-Protection Warnings

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-nina.ts`) — Runs every 5 minutes for each German city with `dataSources.nina` (its regional key `ars`). Fetches `https://warnung.bund.de/api31/dashboard/{ars}.json`, drops DWD weather warnings (the weather tile has those), and fetches each remaining warning's CAP detail (description, instruction, urgency, expiry) and GeoJSON area, both optional. Each entry is read in either shape (`entryFields`), because the published API description puts a dashboard entry's headline, severity and `msgType` under `payload.data` and its version under `payload`, where the map-data endpoints have them at the top level: the headline comes from `i18nTitle.de`, falling back to `payload.data.headline`; the type from `payload.data.msgType`; the start from the top-level `sent`. The top-level value wins where an entry has both, so a warning keeps its severity and start whichever shape NINA sends. Sorts by severity, then newest start, and writes `NinaWarning[]` to cache key `{cityId}:nina:warnings` (TTL 600s) and one `bbk-nina` snapshot row.

2. **API** (`packages/server/src/routes/nina.ts`) — `GET /api/:city/nina` returns the cached list, falls back to the newest `bbk-nina` row (`loadNinaWarnings`, refused once over 3 h old), then `[]`. Non-German cities always get `[]`. The bootstrap's `nina` slot is the same cache entry.

3. **Frontend** — `NinaBanner` above the dashboard and the map's warning areas ([frontend.md](frontend.md)).

### Ended warnings, and found nothing vs. failed

- **An ended warning is never served.** `hasEnded()` counts a warning as over once it is withdrawn (CAP `msgType` `Cancel`, in the entry's `type`, its `payload.data.msgType` or the detail) or its `expiresAt` has passed. The expiry is the dashboard entry's `expiresDate`, or else the detail's `info[0].expires`. Ingestion leaves ended warnings out, and the route and the bootstrap pass every answer through `currentWarnings()`, because a cached or stored list outlives its warnings. A warning with no expiry stays until NINA stops listing it. An all-clear sent as a Cancel message is not shown at all.
- **Found nothing replaces the last list.** A successful request stores its list even when it is empty, so the newest `bbk-nina` row is always what the last successful run found, and a restart, a cache expiry or cache warming cannot bring back a cleared warning. The freshness check then also sees these rows, so a restart within 5 minutes of a successful run skips the startup fetch.
- **A failed request keeps the last list.** A non-OK status, a network error, or a body that is not a JSON list stores nothing and leaves the cache as it was, so a NINA outage does not read as "no warnings". The last list is served, minus the warnings that have ended since, until its row is over 3 h old; then the banner is empty.
- **Weather and transit.** Weather follows the same rule for its forecast only: a successful run stores the whole snapshot, `alerts: []` included, and a failed forecast request stores nothing. Its DWD alerts are not covered: a failed alerts request within a successful run is stored as no alerts (`fetchDwdAlerts` returns `[]` on a non-OK response, and a thrown error leaves the forecast's empty `alerts`, which `saveWeather` writes). Transit agrees on failure (all stations failed: nothing written) but not on found-nothing: `saveTransitAlerts` skips an empty list, so its database keeps the last non-empty one.

## DB Schema

- `events` table — cityId, title, venue, date, endDate, category, url, description, free, hash, source, price, bookingUrl (`booking_url`, migration 0007). Indexed by `events_city_date_idx(cityId, date)` and `events_city_source_idx(cityId, source, date)`, unique on (cityId, hash). Persisted via `saveEvents()` (UPSERT) per source on every ingestion run, except HHT's between its daily downloads. Data retention: rows not refreshed (`fetchedAt`) for 3 days are pruned nightly.
- `safetyReports` table — cityId, title, description, publishedAt, url, district, lat, lon, locationLabel, geoAttempted, hash. Indexed by `safety_city_published_idx(cityId, publishedAt)`, unique on (cityId, hash). Persisted via `saveSafetyReports(db, cityId, reports, geoAttempted)` (UPSERT). Data retention: rows not refreshed (`fetchedAt`) for 3 days are pruned nightly.
