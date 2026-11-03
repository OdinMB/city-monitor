# EV charging

A map layer of public charging stations for all four cities from the Bundesnetzagentur's Ladesäulenregister, each circle coloured and sized by power class (blue normal up to 22 kW, orange fast, purple high power from 150 kW). In Hamburg a coloured ring adds the live status of the station's charge points (green: one is free, amber: all in use, red: all out of order, grey: unknown). The popup shows operator, address, power class and top power, charge points, plug types, the register edition, and in Hamburg each charge point's status since when. No dashboard tile. Added 2026-11-03.

## Sources (`dataSources.evCharging`)

| City | Register (`kreis`) | Live status |
|---|---|---|
| Berlin | `Kreisfreie Stadt Berlin` | – |
| Hamburg | `Kreisfreie Stadt Hamburg` | `hamburg-sta`, `iot.hamburg.de/v1.1` |
| Köln | `Kreisfreie Stadt Köln` | – |
| München | `Kreisfreie Stadt München` (not `Landkreis München`) | – |

- **BNetzA Ladesäulenregister** (CC BY 4.0). The landing page `bundesnetzagentur.de/…/E-Mobilitaet/Ladesaeulenkarte/start.html` says: "Die Daten sind durch eine Creative Commons Namensnennung 4.0 International Lizenz lizenziert. … Als Namensnennung für Daten dieser Internetseite ist Bundesnetzagentur.de zu verwenden." Credited as "Source: Bundesnetzagentur.de, CC BY 4.0." One national CSV on `data.bundesnetzagentur.de`, named after its date (`Ladesaeulenregister_BNetzA_2026-09-01.csv`, 55.6 MB, UTF-8 with BOM, ";"-separated, ten preamble lines, 116,443 rows). The job looks the newest CSV up on the landing page each run (`findRegisterCsv`), so a new edition needs no code change. The page also links a newer XLSX (`…_2026-09-30.xlsx`, 32 MB, on 2026-11-03); the CSV is a month behind it, but the XLSX is not read: parsing it would hold several hundred MB of sheet XML in memory. The register lists only operators who finished the BNetzA notification, so it undercounts (its own note says so).
- **Hamburg live status** (dl-de/by-2.0, Transparenzportal "Elektro Ladestandorte Hamburg", package `elektro-ladestandorte-hamburg40`, author Behörde für Wirtschaft, Arbeit und Innovation). Credited as "Source: Freie und Hansestadt Hamburg, Behörde für Wirtschaft, Arbeit und Innovation, dl-de/by-2-0." SensorThings datastreams of layer `Status_E-Ladepunkt` (service `HH_STA_E-Ladestationen`), one per charge point, named `Ladepunkt <EVSE id>`; observations are OCPP statuses written on change. About 2,540 charge points at 1,260 stations of Hamburger Energiewerke Mobil (EVSE operator `DE*HHM`; the feed's `ownerThing` still says "Stromnetz Hamburg"), three pages of 1,000, ~1.6 MB per run with the trimmed `$select`. No live status exists for the other cities: AFIR dynamic data is meant to come through Mobilithek, but no open offer was found (2026-11-03).

## What is kept

- **Rows of the city's Kreis, `Status` "In Betrieb", inside the city's `boundingBox`** (a few rows have coordinates far from their address: 8 in Hamburg, 22 in München).
- **One station per operator and place:** devices of one operator (`Anzeigename (Karte)`, else `Betreiber`) whose coordinates agree to 4 decimals (~10 m) are added up. `points` sums `Anzahl Ladepunkte`; `maxKw` is the highest plug power (`Nennleistung SteckerN`, a "; "-separated list per point), else the device's power; `fast` is `Art der Ladeeinrichtung` "Schnellladeeinrichtung" (over 22 kW) or a DC plug; plugs map to `type2`, `ccs`, `chademo`, `schuko`, `type1`, `mcs`. Device power is the sum over its points (a 2 × 22 kW post says 44), so it is not used when plug power is there.
- **EVSE ids only where a live feed merges on them** (Hamburg): `evse` holds the station part of each id (`DE*HHM*E977*01` → `DE*HHM*E977`, `evseStation`; ids of three segments or fewer are kept whole). Quoted EVSE fields often end in a line break, so the CSV reader is quote-aware across lines and chunks.

2026-09-01 edition: Berlin 3,483 stations / 7,561 points (472 fast, 322 of them 150 kW+), 615 KB JSON, 77 KB gzipped; Hamburg 1,990 / 5,967, 311 KB; Köln 783 / 2,701, 120 KB; München 978 / 3,620, 155 KB. Parsing the whole file takes about a second.

## Live status merge (Hamburg)

`mergeEvChargingStatus` in `lib/ev-charging.ts`, called by the route: each live station is matched to the register station whose `evse` has its station id, and its points (sorted by id) go into that station's `live`. On 2026-11-03, 1,155 of the 1,260 live stations matched (2,329 of 2,541 points), landing on 1,008 register stations (several HEnW posts at one place are one station). The ~105 live stations the register lacks are added as their own stations (`id` `live:<station id>`, operator from `liveStatus.operator` = "HEnW-Mobil", the register's name for `DE*HHM`; address from the Location's description; `maxKw` null, `fast` from a DC connector). Matching by EVSE id is exact; matching by position was weaker (1,154 within 30 m, with neighbouring posts confusable), so position is not used.

Status mapping (`ocppStatus`): AVAILABLE → `available`; OCCUPIED, PREPARING, CHARGING, SUSPENDEDEV, SUSPENDEDEVSE, FINISHING, RESERVED → `occupied`; FAULTED, UNAVAILABLE → `outOfOrder`; UNKNOWN, missing → `unknown`. A status is not aged out: it is written on change, so an AVAILABLE from last week is still the status now. On 2026-11-03 at about 01:45 UTC: 1,775 available, 655 occupied (433 of them SUSPENDEDEV), 56 out of order, 55 without an observation.

## Pipeline

- `cron/ingest-ev-charging.ts`:
  - `ingest-ev-charging`, weekly (`30 4 * * 3`): one landing-page request and one streamed CSV download (timeout 300 s) for every city with `dataSources.evCharging`; writes `CK.evChargingRegister(city)` (`{city}:ev-charging:register`, TTL 14 days) and a `bnetza-charging` snapshot per city. A missing CSV link, a failed download or a city with no rows keeps the previous edition; a header without a column it reads throws. `FRESHNESS_SPECS` max age 7 days; `loadEvChargingRegister` accepts rows up to 90 days old. Retention: 7 days, newest row per city kept (`keepLatest`).
  - `ingest-ev-charging-status`, every 5 minutes, for cities with `evCharging.liveStatus`: writes `CK.evChargingStatus(city)` (TTL 900 s). Cache only, never stored: a stored status would be shown as live after a restart. So it has no freshness spec and runs on every start, like `ingest-aq-grid`.
- `GET /api/:city/ev-charging` → `{ data: EvChargingData | null, fetchedAt }`: the register (cache → DB) without `evse`, with the live status merged on; `liveUpdated` is the status fetch time, null while a live city's status is missing, absent in a city without a feed. `fetchedAt` is the register's. `Cache-Control: max-age=120`, heavy-payload rate limit. Not in the bootstrap.

## Frontend

- `DataLayer` `'ev-charging'` in the Traffic category (off by default), gated on the `evCharging` feature; the sidebar legend shows the power classes, and the ring states where the city has `evChargingLive` (Hamburg).
- `hooks/useEvCharging.ts` fetches only while the layer is on; refetches every 5 minutes in a city with `evChargingLive`, otherwise not at all (stale after 6 hours).
- `components/map/layers/ev-charging.ts`: one `circle` layer (`ev-station-circle`), sorted so high-power chargers sit on top; the popup looks its station up by feature index (`evStationPopupHtml`, covered by `popup-language.test.ts`). Colours: `EV_POWER_CLASSES` and `EV_LIVE_STATES` in `components/map/constants.ts`.
- Synthetic data: two normal stations per anchor and a fast or high-power one at every other anchor, no live status (`synthetic/generate.ts`).

## Not added

- A tile ("x of y charge points free now" in Hamburg, growth since the last edition elsewhere): the layer came first; the counts are in the data if one is wanted.
- Live status for Berlin, Köln and München: no open feed found.
