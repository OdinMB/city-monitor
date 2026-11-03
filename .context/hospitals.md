# Hospitals (Emergencies map layer)

A `hospitals` sub-layer of the emergencies map layer, next to pharmacies and defibrillators: hospital sites coloured and sized by their emergency-care tier, with a popup giving name, address, tier, special units (children, stroke unit, chest-pain unit, major trauma), beds, the hospital's website, directions and the source. Built 2026-11-03.

| Source | Cities | Licence | State |
|---|---|---|---|
| Bundes-Klinik-Atlas open-data export (G-BA) | all four (`places: ['Berlin']`, `['Hamburg']`, `['Köln']`, `['München']`) | **Reuse terms not stated** on the page or in the export | Built, **off** unless `KLINIK_ATLAS_ENABLED=true` |
| Hamburg hospital WFS (`HH_WFS_Krankenhaeuser`, Behörde für Gesundheit und Verbraucherschutz) | Hamburg | dl-de/by-2.0 (GetCapabilities `Fees`) | Live |

So until the owner switches the Klinik-Atlas on, only Hamburg shows the sub-layer; in Berlin, Köln and München it is hidden because the server has no hospitals for them.

## Config

`dataSources.hospitals` is a list of sources (`HospitalSource` in `shared/types.ts`):

- `{ provider: 'klinik-atlas', places: string[] }` — sites whose `Ort` equals one of `places` exactly. All four server configs list it.
- `{ provider: 'hamburg-wfs', url }` — GeoJSON GetFeature on `de.hh.up:gesundheit_krankenhaeuser` with `srsName=EPSG:4326` (`hamburg.ts`).

The `hospitals` CityFeature follows the config (`lib/city-features.ts`), like every other feature, so the parity test holds; whether a source is read at runtime is `activeHospitalSources(city, env)` in `cron/ingest-hospitals.ts`, which drops `klinik-atlas` unless `klinikAtlasEnabled(env)` (`KLINIK_ATLAS_ENABLED` is `true`, any case). The web side hides what has no data: `withoutEmptyHospitals` (`lib/map-layers.ts`) drops the sub-layer when `GET /api/:city/hospitals` has none, used by `useCityLayers` (CityMap) and `EmergencySubLayers` (sidebar). Every city also has pharmacies or defibrillators, so the emergencies layer itself never disappears with it.

## Klinik-Atlas export

- `https://bundes-klinik-atlas.de/open-data/` links the current ZIP, `…/Bundes-Klinik-Atlas_Datenexport_YYYYMMDD.zip` (2026-10-27: 541 KB). `findKlinikAtlasExport` takes the newest date it links; the date is shown in the popup ("Bundes-Klinik-Atlas · 2026-10-27").
- The ZIP holds `*_TVERZ_Export.xml` and macOS `__MACOSX` entries, which are skipped. It is streamed with `lib/zip.ts`, downloaded once per run for all cities.
- Each `<Standort>` has `<StandortKontaktDaten STOID Name Strasse PLZ Ort URL Laengengrad Breitengrad>`, `<StandortStrukturDaten AnzahlBetten>` and `<StandortNotfallversorgung Stufe Schwerverletztenversorgung Kinder Spezialversorgung StrokeUnit ChestPainUnit StufeNichtVereinbart>`. Only those three are read.
- Tier (`klinikAtlasTier`): `Stufe` 3 comprehensive, 2 extended, 1 basic (the G-BA's Notfallstufen); otherwise `specialised` when `Spezialversorgung` is set or `Kinder` > 0, else `none`. `Stufe` 9 is undocumented (14 sites nationwide) and counts as no tier.
- Some `URL` fields hold e-mail addresses (`http://name@host`); `website()` drops any URL with userinfo.
- Counted on the 2026-10-27 export: Berlin 57 sites (17 none, 15 basic, 11 extended, 10 comprehensive, 4 specialised), Hamburg 32, Köln 18, München 42.
- No real Atlas records are committed as fixtures while its terms are unconfirmed: `lib/hospitals.test.ts` uses made-up XML of the same shape.

## Hamburg WFS

37 hospitals. `not_und_unfallversorgung` has three values: "Teilnahme …" → `emergency`, "eingeschränkte Teilnahme …" → `limited`, "keine Teilnahme …" → `none`. No G-BA tier, no units. Fixture: `lib/hospital-fixtures/hamburg-wfs.json` (three real features, trimmed). Credit: "Source: Freie und Hansestadt Hamburg, Behörde für Gesundheit und Verbraucherschutz, dl-de/by-2-0." (Sources page, linked to the Transparenzportal dataset `krankenhaeuser-hamburg`).

## Merge (both on in Hamburg)

`mergeHospitals` keeps every Klinik-Atlas site (it has the tier) and adds a WFS hospital only when no Atlas site lies within `SAME_SITE_METRES` (250 m). On the 2026-10-27 data: 32 Atlas + 37 WFS → 39, so 30 WFS records matched an Atlas site and 7 were added. Sorted by tier (`TIER_ORDER`), then name; the map draws higher tiers on top.

## Job, storage, route

- `ingest-hospitals`, Mondays 05:45 (`'45 5 * * 1'`), for cities with an active source. A source that fails keeps its hospitals from the cached previous set; when none succeeds nothing is written. Logs once per process that `KLINIK_ATLAS_ENABLED` is not set.
- Cache `CK.hospitals` for 8 days, not in bootstrap; snapshot type `hospitals` (7-day retention, latest row kept); warmed on start; freshness max age 7 days, only for cities with an active source.
- `GET /api/:city/hospitals` (cache, then DB, then `null`), `Cache-Control` 12 h. Lazy-fetched by `useHospitals` while the city has the feature.

## Frontend

- Markers: circle layer `hospital-markers-circle` in `components/map/layers/emergencies.ts`, colour by tier (`HOSPITAL_TIER_COLORS` in `lib/hospitals.ts`), radius larger for higher tiers. Popup builder `hospitalPopupHtml` (tested in `emergencies.test.ts`).
- Sidebar: `EMERGENCY_SUB_META.hospitals` (lucide `Hospital`), and `HospitalLegend` under it with only the tiers the city's hospitals have.
- i18n: `sidebar.emergencies.hospitals`, `sidebar.hospitalLegend`, `mapPopup.hospital.*` in all four bundles.

## Sources page credits

- "Krankenhäuser Hamburg (Geodienste)": Hamburg only, dl-de/by-2-0.
- "Bundes-Klinik-Atlas (G-BA)": `requires: 'hospitals'`, all four cities. The page cannot see a server env flag, so this credit shows by config even while `KLINIK_ATLAS_ENABLED` is off (the same as Geofox and DB FaSta). Its text names the G-BA as source; once the G-BA states its terms, add the licence or required wording to it.

## Switching the Klinik-Atlas on

- Ask the G-BA (Bundes-Klinik-Atlas open data) whether the export may be reused in a public AGPL dashboard, and with what attribution.
- Once confirmed, set `KLINIK_ATLAS_ENABLED=true` on the Render API service (declared in `render.yaml` with `sync: false`) and adjust the Sources-page credit text to the stated terms.
- Trigger or wait for `ingest-hospitals` (Monday 05:45; every start runs a job whose data is stale) and check its log line per city ("N hospitals, M in emergency care (klinik-atlas)").
