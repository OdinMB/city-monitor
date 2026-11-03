# Parking

A map layer of car parks with live free spaces, Hamburg only. Each car park is a circle coloured by the share of its spaces free (green 30 % or more, amber 10–30 %, red under 10 %, grey closed or no current count), with the free count written in from zoom 13 ("P" when closed). The popup shows the name, the kind (multi-storey, underground, car park), free / total, the trend when the job has one, and when the count was last updated. No dashboard tile. Added 2026-11-03.

## Source (`dataSources.parking`)

| City | Provider | URL | Licence |
|---|---|---|---|
| Hamburg | `hamburg-wfs` | `geodienste.hamburg.de/wfs_parkhaeuser`, feature type `de.hh.up:parkhaeuser` | dl-de/by-2.0 |

- One WFS GetFeature request as GeoJSON in EPSG:4326 (`hamburgParkingUrl`). The layer lists 127 car parks; 45 carry live `frei`/`gesamt` counts from the Parkleitsystem (checked 2026-11-03), the rest are static entries (P+R, roadside) without counts and are dropped.
- Fields used: `name`, `art` (Parkhaus/parkhaus/Tiefgarage/Parkplatz/Straßenrand → garage/underground/lot, case-insensitive), `frei`, `gesamt`, `status` (`frei` → open, `geschlossen` → closed, `Störung` → fault), `received` (German local time without offset, read with `berlinUtcOffset`). The id is the suffix of the feature id after its last `_`.
- A car park with `gesamt` ≤ 0 counts as closed; `frei` is clamped to 0…`gesamt`.
- Licence: Transparenzportal dataset `parkhaeuser-hamburg17`, dl-de/by-2.0, author Behörde für Verkehr und Mobilitätswende; it says the counts refresh every 5 minutes. Credited as "Source: Freie und Hansestadt Hamburg, Behörde für Verkehr und Mobilitätswende, dl-de/by-2-0."

## Trend

The feed has no trend field. `parkingTrend` keeps the job's own readings per city in memory and compares the current free count with the oldest reading 10–30 minutes old: fewer free by at least max(3, 2 % of the total) is "filling", more is "emptying", else "steady". Only for open car parks; null after a restart until a reading is 10 minutes old, and for a closed or faulty car park.

## Pipeline

- `cron/ingest-parking.ts`, every 5 minutes (`1-59/5`). Writes `CK.parking(city)` (`{city}:parking`, TTL 600 s) every run and a `parking` snapshot at most every 15 minutes per city (`PARKING_DB_INTERVAL_MS`). A failed request or an empty list keeps the previous data.
- `FRESHNESS_SPECS` max age 900 s; `loadParking` refuses rows older than 30 minutes. Retention: 2 days, 100 rows per city.
- `GET /api/:city/parking` → `{ data: ParkingData | null, fetchedAt }`, `Cache-Control: max-age=120`. Not in the bootstrap.

## Frontend

- `DataLayer` `'parking'` in the Traffic category (off by default), gated on the `parking` city feature; a layer of its own beside the traffic layer's sub-layers. The sidebar shows a four-colour legend under it (`PARKING_OCCUPANCY` in `components/map/constants.ts`).
- `hooks/useParking.ts` fetches only while the layer is on, refetching every 5 minutes.
- `components/map/layers/parking.ts`: `parking-circle` and a count `symbol` layer `parking-count`; `parkingPopupHtml` follows the UI language (`popup-language.test.ts`).
- Synthetic data: eight car parks for Hamburg, one nearly full and one closed (`synthetic/generate.ts`).

## Other cities

- **Berlin:** no Parkleitsystem, no live data ([new-data-sources.md](new-data-sources.md#parking-availability), researched 2026-03-04).
- **Köln:** live car-park data sits on the Mobilithek and needs a usage request there; not built.
- **München:** no public live feed found.
