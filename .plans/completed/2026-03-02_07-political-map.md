# Plan: Political Map Overlay

## Problem

Users want to see political representation on the map — which district they're in, who represents them at different levels (Bezirk, Abgeordnetenhaus/Bürgerschaft, Bundestag), and current government composition.

## Data Sources

### 1. Abgeordnetenwatch API (Free, CC0 License)
- **Base URL**: `https://www.abgeordnetenwatch.de/api/v2`
- **No auth required**, no rate limit documented
- **Entities**: parliaments, parliament-periods, politicians, candidacies-mandates
- **Data**: Name, party, photo URL, constituency, voting record, secondary occupations
- **Parliaments available**:
  - Bundestag (parliament ID to look up)
  - Berlin Abgeordnetenhaus (parliament ID to look up)
  - Hamburg Bürgerschaft (parliament ID to look up)

### 2. GeoJSON Boundary Data

| Level | Berlin | Hamburg | Source |
|---|---|---|---|
| Bezirke (districts) | Already have 12 districts | Already have 7 districts | In-repo GeoJSON |
| Bundestag Wahlkreise | 12 constituencies | ~6 constituencies | bundeswahlleiterin.de (Shapefile → GeoJSON) |
| State constituencies | Berlin: ~78 Wahlkreise (AGH) | Hamburg: ~71 Wahlkreise | Open data portals |

### 3. Static Data Option
Instead of live API calls, we could bundle a static JSON file per city with political data that gets updated manually (or via a rare cron job). Politicians don't change often — only after elections.

## Design

### Map Mode System

Add a **map mode selector** to the sidebar (above or replacing current layer toggles):

| Mode | What's shown |
|---|---|
| **Default** | Current behavior (transit markers, district outlines) |
| **Political** | Political boundaries + representative info |

When "Political" mode is active, sub-filters appear:

| Sub-filter | Boundary layer | Data shown |
|---|---|---|
| Bezirke | District polygons (existing) | Bezirksbürgermeister, party colors |
| Bundestag | Bundestag constituency polygons | Directly elected MdB + party |
| Landesparlament | State constituency polygons | Directly elected MdA/MdHB + party |

### Data Architecture

### Data Architecture: Server-Side Weekly Cron

**New cron job**: `ingest-political.ts`
- **Schedule**: Once per week (`0 4 * * 1` — Monday 4 AM)
- **Process**:
  1. Fetch all politicians for relevant parliaments from abgeordnetenwatch API
  2. Match to constituencies/districts
  3. Cache in memory as `{cityId}:political:{level}` (TTL: 604800s / 7 days)
  4. Persist to DB for cache warming

**Abgeordnetenwatch API calls**:
```
GET /api/v2/parliaments → Get parliament IDs
GET /api/v2/parliament-periods?parliament={id} → Get current period
GET /api/v2/candidacies-mandates?parliament_period={periodId}&type=mandate → Get all mandates
```

**Data structure**:
```typescript
interface PoliticalDistrict {
  id: string;
  name: string;
  representatives: Representative[];
}

interface Representative {
  name: string;
  party: string;
  role: string;          // "MdB", "MdA", "MdHB", "Bezirksbürgermeister"
  photoUrl?: string;     // From abgeordnetenwatch
  profileUrl?: string;   // Link to abgeordnetenwatch profile
  constituency?: string; // Wahlkreis name
}
```

**GeoJSON boundary files** still need to be bundled statically (boundaries don't change between elections):
```
packages/web/src/data/districts/
  berlin-bundestag-wahlkreise.geojson
  berlin-agh-wahlkreise.geojson
  hamburg-bundestag-wahlkreise.geojson
  hamburg-buergerschaft-wahlkreise.geojson
```

**Pros**: Always up-to-date, handles mid-term changes (resignations, by-elections)
**Cons**: API dependency, but weekly polling is very conservative

### Frontend Implementation

**New Zustand store** or extend `useCommandCenter`:
```typescript
type MapMode = 'default' | 'political';
type PoliticalLayer = 'bezirke' | 'bundestag' | 'landesparlament';

interface CommandCenterState {
  // ... existing ...
  mapMode: MapMode;
  politicalLayer: PoliticalLayer;
  setMapMode: (mode: MapMode) => void;
  setPoliticalLayer: (layer: PoliticalLayer) => void;
}
```

**Map mode switching** (`CityMap.tsx`):
- When `mapMode === 'political'`:
  - Hide transit/news/safety markers
  - Show political boundary polygons (fill by party color)
  - Show representative labels or popups
- When `mapMode === 'default'`:
  - Current behavior

**Party colors** (German standard):
```typescript
const PARTY_COLORS: Record<string, string> = {
  'SPD': '#E3000F',
  'CDU': '#000000',
  'CSU': '#008AC5',
  'Grüne': '#64A12D',
  'FDP': '#FFED00',
  'Die Linke': '#BE3075',
  'BSW': '#732048',
  'AfD': '#009EE0',
  'Parteilos': '#808080',
};
```

**Click interaction**:
- Click on a constituency polygon → popup/sidebar panel showing:
  - Constituency name
  - Representative name + photo
  - Party
  - Link to abgeordnetenwatch profile

### GeoJSON Data Preparation

Need to convert Bundestag and state constituency shapefiles to GeoJSON:
1. Download from bundeswahlleiterin.de / daten.berlin.de / transparenz.hamburg.de
2. Convert Shapefile → GeoJSON using ogr2ogr or mapshaper
3. Simplify geometry for web performance (target < 500KB per file)
4. Commit to repo alongside existing district GeoJSON files

## Files Changed

| File | Change |
|---|---|
| `shared/types.ts` | Add PoliticalDistrict + Representative types |
| `packages/server/src/cron/ingest-political.ts` | New — weekly abgeordnetenwatch cron |
| `packages/server/src/routes/political.ts` | New — API route |
| `packages/server/src/db/schema.ts` | Add politicalData table |
| `packages/server/src/db/writes.ts` | Persist political data |
| `packages/server/src/db/reads.ts` | Read political data |
| `packages/server/src/app.ts` | Register cron + route |
| `packages/web/src/data/districts/*-bundestag.geojson` | New — constituency boundaries |
| `packages/web/src/data/districts/*-landesparlament.geojson` | New — state constituency boundaries |
| `packages/web/src/lib/api.ts` | Add political API types + methods |
| `packages/web/src/hooks/usePolitical.ts` | New — React Query hook |
| `packages/web/src/stores/useCommandCenter.ts` | Add mapMode + politicalLayer state |
| `packages/web/src/components/map/CityMap.tsx` | Add political layer rendering |
| `packages/web/src/components/sidebar/Sidebar.tsx` | Add map mode selector |
| `packages/web/src/components/sidebar/PoliticalLayerPicker.tsx` | New — sub-filter UI |
| `packages/web/src/components/map/PoliticalPopup.tsx` | New — representative popup |

## Implementation Order

1. Source and convert GeoJSON boundary data (Bundestag + state)
2. Create ingest-political.ts cron job (abgeordnetenwatch API)
3. Create DB schema + writes/reads
4. Create API route + register in app.ts
5. Create frontend hook + API method
6. Extend useCommandCenter store with mapMode + politicalLayer
7. Add map mode selector UI to sidebar
8. Implement political boundary rendering in CityMap
9. Add click-to-inspect popup
10. Style by party color
11. Typecheck

## Decisions

- **Data approach**: Server-side weekly cron fetching abgeordnetenwatch API. Handles mid-term changes without manual intervention.
- **Political levels**: All three — Bezirke + Bundestag + Landesparlament. Same pattern, different data.
- **GeoJSON sourcing**: Deferred to separate plan (`.plans/08-geojson-boundaries.md`). Currently using existing Bezirke polygons as interim.
- **Scope of representatives**: Both Direktmandat and party-list (Zweitstimme) where available. Party-list MdBs still represent the state.
- **Parliament period IDs**: All period IDs (Bundestag + state) are now fetched dynamically via `fetchCurrentPeriod()` — no hardcoded IDs that need manual updates after elections.
