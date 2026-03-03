# Plan: GeoJSON Constituency Boundaries

## Problem

The political map overlay (Plan 7) currently colors existing Bezirke (district) GeoJSON polygons by party. But Bundestag and state parliament constituencies have different boundaries than administrative districts. Selecting "Bundestag" or "Landesparlament" in the political sub-layer picker still shows district polygons, which is incorrect. We need dedicated GeoJSON files for Bundestag Wahlkreise, Berlin AGH Wahlkreise, and Hamburg Buergerschaft Wahlkreise so the map can display the correct boundaries for each political level.

## Data Sources

### 1. Bundestag Wahlkreise (Federal Constituencies)

- **Source**: Bundeswahlleiterin (Federal Returning Officer)
- **URL**: `https://www.bundeswahlleiterin.de/bundestagswahlen/2025/wahlkreiseinteilung/downloads.html`
  - Look for "Geometrie Wahlkreise" download — Shapefile (.shp) format
  - The dataset contains all 299 Wahlkreise nationwide
- **Filter**: Keep only Berlin constituencies (Wahlkreis numbers 75-86, 12 total) and Hamburg constituencies (Wahlkreis numbers 18-23, 6 total)
- **Properties available**: Wahlkreis number (`WKR_NR`), name (`WKR_NAME`), state (`LAND_NR`, `LAND_NAME`)

### 2. Berlin Abgeordnetenhaus Wahlkreise (State Parliament)

- **Source**: Berlin Open Data Portal (daten.berlin.de)
- **URL**: `https://daten.berlin.de/datensaetze/geometrien-der-wahlkreise-f%C3%BCr-die-wahl-zum-berliner-abgeordnetenhaus`
  - Alternatively search for "Wahlkreise Abgeordnetenhaus" on `https://daten.berlin.de`
  - Available as Shapefile or GeoJSON
- **Count**: 78 Wahlkreise across Berlin's 12 Bezirke
- **Properties available**: Wahlkreis number, name, Bezirk assignment

### 3. Hamburg Buergerschaft Wahlkreise (State Parliament)

- **Source**: Hamburg Transparency Portal (transparenz.hamburg.de)
- **URL**: `https://transparenz.hamburg.de/` — search for "Wahlkreise Buergerschaft"
  - Also check `https://geoportal-hamburg.de/geo-online/` for geospatial data
  - May be available via Hamburg's WFS service
- **Count**: 71 Wahlkreise across Hamburg's 7 Bezirke
- **Properties available**: Wahlkreis number, name, Bezirk assignment

## Processing Pipeline

This is a **partially manual task**. The shapefile downloads and conversions must be done locally by a developer. The steps below are the exact commands to run.

### Prerequisites

Install CLI tools (one-time):
```bash
npm install -g mapshaper
pip install geojson-validation   # or: npm install -g geojsonhint
```

Alternatively, `ogr2ogr` from GDAL can be used for conversion if already installed.

### Step 1: Download Shapefiles

Download from the URLs above. Place raw files in a temporary working directory (not committed to the repo):
```
/tmp/geo-processing/
  btw-wahlkreise/          # Bundestag — nationwide shapefile
  berlin-agh-wahlkreise/   # Berlin AGH
  hamburg-buergerschaft/   # Hamburg Buergerschaft
```

### Step 2: Convert to GeoJSON

Using mapshaper (handles Shapefile, projection conversion, and GeoJSON output):

```bash
# Bundestag — convert, reproject to WGS84, filter to Berlin
mapshaper btw-wahlkreise/*.shp \
  -proj wgs84 \
  -filter "LAND_NR === 11" \
  -o format=geojson berlin-bundestag-raw.geojson

# Bundestag — filter to Hamburg
mapshaper btw-wahlkreise/*.shp \
  -proj wgs84 \
  -filter "LAND_NR === 2" \
  -o format=geojson hamburg-bundestag-raw.geojson

# Berlin AGH
mapshaper berlin-agh-wahlkreise/*.shp \
  -proj wgs84 \
  -o format=geojson berlin-agh-raw.geojson

# Hamburg Buergerschaft
mapshaper hamburg-buergerschaft/*.shp \
  -proj wgs84 \
  -o format=geojson hamburg-buergerschaft-raw.geojson
```

If the source is already GeoJSON (some portals offer this), skip the conversion and go to Step 3.

Note: The filter field names (`LAND_NR`, etc.) depend on the actual shapefile schema. Inspect with `mapshaper btw-wahlkreise/*.shp -info` to find the correct field names.

### Step 3: Simplify Geometry

Target: each file under 500KB for web performance. The existing Bezirke files are ~12KB (Berlin) and ~8KB (Hamburg) with simplified geometry.

```bash
# Simplify — visimpl algorithm preserves topology, percentage tuned per file
mapshaper berlin-bundestag-raw.geojson \
  -simplify visvalingam 15% \
  -o format=geojson precision=0.00001 berlin-bundestag.geojson

mapshaper hamburg-bundestag-raw.geojson \
  -simplify visvalingam 15% \
  -o format=geojson precision=0.00001 hamburg-bundestag.geojson

mapshaper berlin-agh-raw.geojson \
  -simplify visvalingam 10% \
  -o format=geojson precision=0.00001 berlin-agh.geojson

mapshaper hamburg-buergerschaft-raw.geojson \
  -simplify visvalingam 10% \
  -o format=geojson precision=0.00001 hamburg-buergerschaft.geojson
```

The state parliament files have more features (~71-78 vs 6-12) so they need more aggressive simplification. Adjust the percentage until each file is under 500KB. Check with `ls -lh *.geojson`.

### Step 4: Normalize Properties

Each GeoJSON feature must have exactly these properties for consistent frontend consumption:

| Property | Type | Description |
|---|---|---|
| `name` | string | Human-readable constituency name (e.g., "Berlin-Mitte") |
| `number` | number | Official constituency number (Wahlkreis-Nummer) |
| `id` | string | Unique identifier for matching to political API data |

Use mapshaper to rename/filter properties:

```bash
# Example for Bundestag files (adjust field names after inspecting the shapefile schema)
mapshaper berlin-bundestag.geojson \
  -rename-fields name=WKR_NAME,number=WKR_NR \
  -each "id = 'btw-' + number" \
  -filter-fields name,number,id \
  -o force format=geojson berlin-bundestag.geojson

mapshaper hamburg-bundestag.geojson \
  -rename-fields name=WKR_NAME,number=WKR_NR \
  -each "id = 'btw-' + number" \
  -filter-fields name,number,id \
  -o force format=geojson hamburg-bundestag.geojson

# For AGH / Buergerschaft — field names will differ, inspect first
mapshaper berlin-agh.geojson -info
mapshaper hamburg-buergerschaft.geojson -info
# Then rename accordingly
```

### Step 5: Validate

```bash
# Using geojsonhint (npm)
npx geojsonhint berlin-bundestag.geojson
npx geojsonhint hamburg-bundestag.geojson
npx geojsonhint berlin-agh.geojson
npx geojsonhint hamburg-buergerschaft.geojson

# Quick visual check — open in geojson.io or mapshaper.org
```

Verify:
- All files are valid GeoJSON FeatureCollections
- Coordinates are in WGS84 (longitude, latitude)
- Each feature has `name`, `number`, and `id` properties
- File sizes are under 500KB each
- Polygons visually cover the correct city area

## Integration

### File Placement

```
packages/web/src/data/districts/
  berlin-bezirke.geojson            # Existing — 12 administrative districts
  hamburg-bezirke.geojson           # Existing — 7 administrative districts
  berlin-bundestag.geojson          # New — 12 Bundestag constituencies
  berlin-agh.geojson                # New — 78 AGH constituencies
  hamburg-bundestag.geojson         # New — 6 Bundestag constituencies
  hamburg-buergerschaft.geojson     # New — 71 Buergerschaft constituencies
```

### CityMap.tsx Changes

Currently, `CityMap.tsx` loads a single GeoJSON source (`districts`) from `DISTRICT_URLS` and always shows district boundaries. When the political sub-layer is "bundestag" or "landesparlament", it still colors the same district polygons.

**Required change**: When `mapMode === 'political'` and `politicalLayer !== 'bezirke'`, swap the GeoJSON source to the corresponding constituency file.

Add a new URL mapping:

```typescript
const CONSTITUENCY_URLS: Record<string, Record<string, { url: string; nameField: string }>> = {
  berlin: {
    bundestag: {
      url: new URL('../../data/districts/berlin-bundestag.geojson', import.meta.url).href,
      nameField: 'name',
    },
    landesparlament: {
      url: new URL('../../data/districts/berlin-agh.geojson', import.meta.url).href,
      nameField: 'name',
    },
  },
  hamburg: {
    bundestag: {
      url: new URL('../../data/districts/hamburg-bundestag.geojson', import.meta.url).href,
      nameField: 'name',
    },
    landesparlament: {
      url: new URL('../../data/districts/hamburg-buergerschaft.geojson', import.meta.url).href,
      nameField: 'name',
    },
  },
};
```

Add a new effect that watches `mapMode` and `politicalLayer`:
- When `politicalLayer === 'bezirke'` or `mapMode === 'default'`: reload the Bezirke GeoJSON into the `districts` source (current behavior)
- When `politicalLayer === 'bundestag'` or `'landesparlament'`: fetch the corresponding constituency GeoJSON, replace the `districts` source data, and re-apply political styling

The `addDistrictLayer` function should be generalized to accept a URL and nameField so it can load any of the GeoJSON files into the same `districts` source.

### Political Data Matching

The `applyPoliticalStyling` function currently matches political data to GeoJSON features by comparing `PoliticalDistrict.name` to the GeoJSON `name` property (case-insensitive). This must work for constituencies too:

- **Bundestag**: Match `PoliticalDistrict.name` (e.g., "Berlin-Mitte") to GeoJSON feature `name` property
- **AGH / Buergerschaft**: Match by constituency name — the abgeordnetenwatch API returns constituency names that should match the GeoJSON `name` property

If exact name matching fails (due to formatting differences between the API and the shapefile), fall back to matching by constituency number. This is why the GeoJSON features include a `number` property.

The `buildPoliticalPopupHtml` function needs the same name-matching update — when clicking a constituency polygon, look up the matching `PoliticalDistrict` by name (or number as fallback).

## Files Changed

| File | Change |
|---|---|
| `packages/web/src/data/districts/berlin-bundestag.geojson` | New — 12 Bundestag constituency polygons |
| `packages/web/src/data/districts/berlin-agh.geojson` | New — 78 AGH constituency polygons |
| `packages/web/src/data/districts/hamburg-bundestag.geojson` | New — 6 Bundestag constituency polygons |
| `packages/web/src/data/districts/hamburg-buergerschaft.geojson` | New — 71 Buergerschaft constituency polygons |
| `packages/web/src/components/map/CityMap.tsx` | Add `CONSTITUENCY_URLS`, generalize `addDistrictLayer`, add effect to swap GeoJSON source when political sub-layer changes, update matching logic for popups |

## Implementation Order

1. **Download** — Manually download shapefiles from bundeswahlleiterin.de, daten.berlin.de, transparenz.hamburg.de
2. **Convert** — Shapefile to GeoJSON using mapshaper, reproject to WGS84, filter by state
3. **Simplify** — Reduce geometry complexity with mapshaper visvalingam, target <500KB per file
4. **Normalize** — Rename properties to `name`, `number`, `id`; remove extra fields
5. **Validate** — Run geojsonhint, visual check on geojson.io
6. **Place** — Copy final files to `packages/web/src/data/districts/`
7. **Integrate** — Update `CityMap.tsx` to load constituency-specific GeoJSON per political sub-layer
8. **Test** — Verify each political sub-layer shows correct boundaries, popups match data
9. **Typecheck** — `npm run typecheck`

## Decisions

- **Static GeoJSON committed to repo**: Constituency boundaries only change after redistricting (every ~10 years for Bundestag, similarly rare for state). No need for dynamic fetching.
- **Shared `districts` source on the map**: Rather than adding separate map sources for each level, we reuse the single `districts` source and swap its GeoJSON data. This avoids multiple polygon layers competing visually and keeps the existing hover/click handlers working.
- **Property normalization**: All four GeoJSON files use the same property schema (`name`, `number`, `id`) so the frontend code does not need city-specific or level-specific field lookups.
- **Partially manual workflow**: Steps 1-6 require a developer to download files, run CLI commands, and inspect results. Steps 7-9 are standard code changes. The manual steps are documented with exact commands above.
- **Fallback matching by number**: If constituency names from the abgeordnetenwatch API don't exactly match the GeoJSON `name` property (whitespace, abbreviations, etc.), match by `number` instead. The `id` property provides a stable key.
