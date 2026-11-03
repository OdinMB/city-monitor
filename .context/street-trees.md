# Street Trees (Baumkataster)

A "Street Trees" map layer for Berlin, Hamburg and Köln: one dot per tree from the city's tree register, drawn at street zoom, and a popup with the tree's species, planting year and size on a click. **Frontend only:** no cron job, no table, no API route. The browser loads the register's WMS tiles and, on a click, asks the same service about one tree (GetFeatureInfo). The registers are far too large to ingest or ship (Berlin about 900,000 trees, Hamburg 230,000, Köln 108,000).

## Sources (checked 2026-11-03)

| City | WMS | Layers | Licence (GetCapabilities) | GetFeatureInfo |
|------|-----|--------|---------------------------|----------------|
| Berlin | `https://gdi.berlin.de/services/wms/baumbestand` (GeoServer) | `strassenbaeume` (street, ~435k), `anlagenbaeume` (park) | `<Fees>` dl-de/zero-2.0 | `application/json`, **WMS 1.3.0 only** (the JSON template fails without `CRS`) |
| Hamburg | `https://geodienste.hamburg.de/HH_WMS_Strassenbaumkataster` (deegree) | `strassenbaumkataster` (street trees, ~230k) | `<Fees>` dl-de/by-2.0, "Quellenvermerk: Freie und Hansestadt Hamburg, Behörde für Umwelt, Klima, Energie und Agrarwirtschaft" | `text/xml` (GML), no JSON |
| Köln | `https://geoportal.stadt-koeln.de/wss/service/baumkataster_extern_wms/guest` (MapServer) | `baumkataster` (~108k) | `<AccessConstraints>` dl-de/zero-2.0 | `text/xml` (OGR GML), no JSON |

- All three answer CORS (Berlin and Hamburg `*`, Köln echoes the origin) and render in EPSG:3857. Köln's service draws nothing beyond about zoom 13 (scale limit); the others draw everywhere, but the dots merge into a green carpet below street zoom.
- **München: none.** opendata.muenchen.de has no tree register ("Baumkataster" returns nothing), so München has no `streetTrees` feature.
- The WFS twins (Berlin `services/wfs/baumbestand`, Hamburg `HH_WFS_Strassenbaumkataster`, Köln `baumkataster_extern_wfs`) are not used.

## Architecture

- **Feature:** `streetTrees`, a web-only `CityFeature` (`WEB_ONLY_FEATURES` in `config/index.test.ts`), listed by Berlin, Hamburg and Köln. `config/index.test.ts` checks a city lists it exactly when `STREET_TREES_WMS` has an entry, and that the map credit links the WMS host.
- **DataLayer:** `'trees'`, shown for cities with the feature (`cityLayers` in `lib/map-layers.ts`). Sidebar entry with a deciduous-tree icon (`DataLayerToggles.tsx`) and, when on, two hints: zoom in to street level, click a tree. Listed in the Environment category.
- **Constants** (`components/map/constants.ts`): `STREET_TREES_WMS` per city (base URL, layers, info format, map credit), `getStreetTreesWmsUrl()` (WMS 1.1.1 GetMap tile template like the noise map), `getStreetTreeInfoRequest()` (WMS 1.3.0 GetFeatureInfo on a 13×13 px window centred on the click), `STREET_TREES_MIN_ZOOM = 15`.
- **Map:** `setStreetTreesOverlay()` in `base.ts` adds the raster source and layer with `minzoom` 15, beneath the first symbol/circle layer so other layers' markers stay on top and clickable. `CityMap.tsx` toggles it like the rent map and re-adds it after a style swap.
- **Click:** one map-wide click handler (registered when the map is created, reading refs) runs while the layer is on and the zoom is 15+. It does nothing when the click hits a GeoJSON feature of another layer (their own popups open), counting the district fill only while the political layer is on. It aborts a pending query on the next click, on a city switch and when the layer goes off. No tree there, or the service fails: nothing opens.
- **Parsing** (`lib/street-trees.ts`): `parseFeatureInfo()` reads the first feature's attributes from GeoJSON or from the GML's first `featureMember` (by local name, so namespaces do not matter); `toStreetTree()` maps them per city (`FIELDS`) to species (German, else genus), botanical name, planting year (1600 to this year), height, crown diameter, trunk girth (positive numbers only), street (Berlin park trees: the park, `Objektname`) and district. A record without a species or botanical name is no tree.
- **Popup** (`components/map/layers/street-trees.ts`): `streetTreePopupHtml()`, register text through `sourceText`, numbers in the UI locale, age as an i18n plural (`mapPopup.tree.*`); source line names the register (`STREET_TREE_REGISTERS`). Hamburg's register has no height, so the popup leaves the line out.

## Field names

| Field | Berlin (JSON property) | Hamburg (GML) | Köln (GML) |
|-------|-------------------------|---------------|------------|
| Species | `Baumart (Deutsch)`, else `Gattung (Deutsch)` | `art_deutsch`, else `gattung_deutsch` | `Deutscher_Name` |
| Botanical | `Baumart (Botanisch)`, else `Gattung` | `art_latein`, else `gattung_latein` | `Botanischer_Name` (trailing space trimmed) |
| Planted | `Pflanzjahr` | `pflanzjahr` | `Pflanzjahr` (often empty) |
| Height m | `Baumhöhe in m` | — | `Höhe___m` |
| Crown m | `Krone Durchmesser in m` | `kronendurchmesser` | `Kronendurchmesser___m` |
| Girth cm | `Stamm Umfang in cm` | `stammumfang` | `Stammumfang___cm` |
| Place | `Straße`, else `Objektname` | `strasse` | `Straße` |
| District | `Bezirk` | `stadtteil` | `Stadtteil` |

A renamed attribute empties that popup line silently; the freshness inventory in [new-data-sources.md](new-data-sources.md) asks for a yearly check.

## Privacy and CSP

The browser contacts the three hosts directly, only while the layer is on: tiles in `img-src`/`connect-src` (MapLibre fetches tiles), the click query in `connect-src`. `geoportal.stadt-koeln.de` is the one new host (the other two already serve the noise and rent maps); it is in `render.yaml` and the PrivacyPage `SERVICES` row "City geodata services", which also says a click sends the clicked position.

## Attribution

Sources page "Maps" groups: "Baumbestand Berlin (Geoportal Berlin)", "Straßenbaumkataster Hamburg (Geodienste)" (the source line its dl-de/by-2.0 asks for), "Baumkataster Köln (Geoportal Stadt Köln)"; pinned in `LICENCE_CREDITS` and by host in `SourcesPage.test.tsx`. Zero licences ask for no credit; it is given anyway. The map's attribution control carries the same credits (`STREET_TREES_WMS[city].attribution`).

## Not built

- No synthetic data: nothing goes through the API. In synthetic mode and the harness, the tiles stay blocked like the other WMS overlays.
- Berlin's watering data (Gieß den Kiez, CC0, keyed by the cadastre's `PITID`) could join the popup later; it would need the server.
- No district tile ("trees per km²"); it would need a one-off aggregation.

## Key files

- `packages/web/src/components/map/constants.ts`: `STREET_TREES_WMS`, `getStreetTreesWmsUrl`, `getStreetTreeInfoRequest`
- `packages/web/src/components/map/base.ts`: `setStreetTreesOverlay`
- `packages/web/src/components/map/CityMap.tsx`: overlay effect, click handler
- `packages/web/src/lib/street-trees.ts` (+ test): GetFeatureInfo parsing and fetch
- `packages/web/src/components/map/layers/street-trees.ts`: popup
- `packages/web/src/components/sidebar/DataLayerToggles.tsx`: layer entry and hints
