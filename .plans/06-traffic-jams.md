# Plan: Traffic Jams on Map

## Problem

Users want to see current traffic conditions and jams on the city map. This is one of the most requested features for city dashboards — real-time traffic visualization.

## Data Source Options

### Option A: TomTom Traffic API
- **Traffic Flow**: Real-time speed data per road segment
- **Traffic Incidents**: Jams, road closures, construction, accidents
- **Free tier**: 2,500 requests/day (sufficient for polling every 5-10 min)
- **Format**: JSON, with flow segments including coordinates
- **Requires**: API key (free registration)
- **MapLibre support**: Official TomTom vector tiles + raster tile overlays

### Option B: HERE Traffic API
- **Traffic Flow**: Vector tiles showing real-time traffic
- **Traffic Incidents**: Detailed incident data with GeoJSON
- **Free tier**: 250K transactions/month
- **Format**: Vector tiles (direct MapLibre integration), JSON for incidents
- **Requires**: API key (free registration)
- **Best MapLibre integration** — HERE provides direct vector tile styles for MapLibre

### Option C: OpenStreetMap + Community Data
- No real-time traffic data available from OSM
- Not suitable

### Recommended: TomTom Traffic API

**Free tier comparison**:
| Provider | Free Tier | Tile Requests | Notes |
|---|---|---|---|
| TomTom | 2,500 non-tile + 50,000 tile requests/day | 50K/day | Generous for both incidents + flow tiles |
| HERE | 250,000 transactions/month total | Shared pool | ~8.3K/day total across all API calls |

**TomTom wins** for this use case:
- 50,000 free tile requests/day is very generous for traffic flow overlay (raster tiles)
- 2,500 non-tile requests/day easily covers incident polling (288 calls/day at 5-min intervals)
- Simpler raster tile integration with MapLibre
- Better traffic incident detail

**Registration steps**:
1. Go to https://developer.tomtom.com
2. Click "Register" / "Get a free API key"
3. Create a new application
4. Copy the API key
5. Set as `TOMTOM_API_KEY` env var

## Design

### Approach 1: Traffic Incidents Only (Simpler)

Fetch traffic incidents (jams, closures, construction) and show as markers:

**Server-side**:
```typescript
interface TrafficIncident {
  id: string;
  type: 'jam' | 'closure' | 'construction' | 'accident' | 'other';
  severity: 'low' | 'moderate' | 'major' | 'critical';
  description: string;
  road?: string;
  from?: string;         // Start location description
  to?: string;           // End location description
  delay?: number;        // Delay in seconds
  length?: number;       // Length in meters
  geometry: {            // LineString or Point
    type: string;
    coordinates: number[][];
  };
  startTime?: string;
  endTime?: string;
}
```

**New cron job**: `ingest-traffic.ts`
- **Schedule**: Every 5 minutes (`*/5 * * * *`)
- Fetch incidents within city bounding box
- Cache as `{cityId}:traffic:incidents` (TTL: 300s)
- No DB persistence — real-time data, not worth storing

### Approach 2: Traffic Flow Tiles (Richer but More Complex)

Use provider's traffic flow raster/vector tiles directly in MapLibre:

**No server-side work needed** — the map client fetches tiles directly from the traffic API.

**Frontend-only**:
```typescript
// Add traffic flow tile layer to MapLibre
map.addSource('traffic-flow', {
  type: 'raster',
  tiles: [`https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=${API_KEY}`],
  tileSize: 256,
});
map.addLayer({
  id: 'traffic-flow-layer',
  type: 'raster',
  source: 'traffic-flow',
  paint: { 'raster-opacity': 0.7 },
});
```

**Pros**: Shows full traffic picture (green/yellow/red roads), no server work
**Cons**: Requires API key in frontend (security concern), adds tile requests

### Chosen: Hybrid Approach (Incidents + Flow Tiles)

1. **Traffic incidents via server** (Approach 1) — for detailed incident data + popups
2. **Traffic flow raster tiles** — visual speed overlay on all roads, API key proxied via server config endpoint

### API Design

**Server route**: `GET /api/:city/traffic`
- Returns `TrafficIncident[]`
- Cache-first, empty array fallback

**Server route**: `GET /api/config/traffic-tiles` (optional)
- Returns tile URL template with API key embedded
- Allows the frontend to load traffic flow tiles without exposing the key in client code

### Frontend

**Map layers**:
1. **Traffic incidents**: LineString geometries showing jam locations
   - Color by severity: green (low), yellow (moderate), orange (major), red (critical)
   - Width proportional to severity
   - Click shows popup: type, road name, delay, description
2. **Traffic flow** (optional): Raster tile overlay showing speed-based coloring

**Layer toggle**: Add 'traffic' to DataLayerToggles
- Default: off
- When enabled: shows incident lines + optional flow tiles

## Files Changed

| File | Change |
|---|---|
| `shared/types.ts` | Add TrafficIncident type |
| `packages/server/src/cron/ingest-traffic.ts` | New — traffic incident ingestion |
| `packages/server/src/routes/traffic.ts` | New — API route |
| `packages/server/src/app.ts` | Register cron job + route |
| `packages/server/src/routes/news.ts` | Add to bootstrap |
| `packages/web/src/lib/api.ts` | Add type + API method |
| `packages/web/src/hooks/useTraffic.ts` | New — React Query hook |
| `packages/web/src/components/map/CityMap.tsx` | Add traffic layers |
| `packages/web/src/stores/useCommandCenter.ts` | Add 'traffic' layer toggle |
| `packages/web/src/components/sidebar/DataLayerToggles.tsx` | Add traffic toggle |

## Implementation Order

1. Register for TomTom or HERE API key
2. Define TrafficIncident type
3. Create ingest-traffic.ts
4. Create API route
5. Register in app.ts + bootstrap
6. Create frontend hook + API method
7. Add traffic incident layers to CityMap
8. Add optional traffic flow tile layer
9. Add layer toggle
10. Typecheck

## Decisions

- **API provider**: TomTom — generous free tier (50K tiles + 2.5K API calls/day), good incident data, simple raster tile integration.
- **Traffic flow tiles**: Yes — include the raster flow overlay (green/yellow/red roads showing real-time speed). API key proxied through server config endpoint.
- **API key management**: `TOMTOM_API_KEY` env var, optional. Traffic feature disabled when key is absent — no errors, just hidden layer toggle.
- **Scope**: Traffic incidents + flow tiles only. Parking and speed cameras are out of scope for now.
