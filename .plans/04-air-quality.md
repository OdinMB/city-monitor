# Plan: Air Quality on Map

## Problem

Users want to see current air quality data on the map — PM2.5, PM10, NO2, ozone levels and the overall European Air Quality Index (AQI).

## Data Source

### Open-Meteo Air Quality API (Recommended)

Already using Open-Meteo for weather — adding air quality is a natural extension.

**Endpoint**: `https://air-quality-api.open-meteo.com/v1/air-quality`

**Parameters**:
- `latitude`, `longitude` (required)
- `current`: Real-time values (15-min model data)
- `hourly`: Hourly forecast up to 5 days
- `timezone`: IANA timezone string

**Available variables**:
- `pm10` — Particulate Matter PM10 (μg/m³)
- `pm2_5` — Particulate Matter PM2.5 (μg/m³)
- `nitrogen_dioxide` — NO₂ (μg/m³)
- `ozone` — O₃ (μg/m³)
- `sulphur_dioxide` — SO₂ (μg/m³)
- `carbon_monoxide` — CO (μg/m³)
- `european_aqi` — European Air Quality Index (0–500+)
- `european_aqi_pm2_5`, `european_aqi_pm10`, `european_aqi_no2`, `european_aqi_o3` — Per-pollutant AQI

**Sample request**:
```
https://air-quality-api.open-meteo.com/v1/air-quality?latitude=52.52&longitude=13.405&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone&hourly=european_aqi,pm2_5,pm10&timezone=Europe/Berlin&forecast_days=2
```

**Free tier**: 10,000 calls/day (non-commercial), no API key required.
**Data source**: CAMS (Copernicus Atmosphere Monitoring Service), 11km resolution for Europe.

### Why Not OpenAQ?
OpenAQ provides station-based measurements (actual sensor readings), but stations are sparse and data can be delayed. Open-Meteo provides modeled data at any coordinate with no gaps — better for a dashboard.

## Design

### Data Model

```typescript
interface AirQuality {
  current: {
    europeanAqi: number;       // 0–500+
    pm25: number;              // μg/m³
    pm10: number;              // μg/m³
    no2: number;               // μg/m³
    o3: number;                // μg/m³
    updatedAt: string;         // ISO timestamp
  };
  hourly: Array<{
    time: string;              // ISO timestamp
    europeanAqi: number;
    pm25: number;
    pm10: number;
  }>;
}
```

**European AQI scale**:
| AQI Range | Label | Color |
|---|---|---|
| 0–20 | Good | Green (#50C878) |
| 20–40 | Fair | Yellow (#FFD700) |
| 40–60 | Moderate | Orange (#FF8C00) |
| 60–80 | Poor | Red (#FF4444) |
| 80–100 | Very Poor | Purple (#8B008B) |
| 100+ | Extremely Poor | Maroon (#800000) |

### Ingestion

**Extend existing `ingest-weather.ts`** rather than creating a new cron job:
- The weather cron already calls Open-Meteo every 30 minutes
- Add a second API call to the air quality endpoint in the same cron cycle
- Cache as `{cityId}:air-quality` (TTL: 1800s / 30 minutes)
- Optionally persist to DB (JSONB snapshot like weather)

### Multi-Point Grid (Optional Enhancement)

For a heatmap-style visualization, query multiple points across the city:
- Berlin: 4–9 grid points covering the city area
- Each point returns its own AQI value
- Display as colored overlay on the map

**But**: At 11km resolution, values across Berlin (~40km) may only differ at ~4 distinct values. A single city-center point might be sufficient for MVP.

### API Route

**New route**: `GET /api/:city/air-quality`
- Returns `AirQuality`
- Cache-first, null fallback

**Bootstrap integration**: Add to bootstrap endpoint.

### Frontend

#### Map Visualization

**AQI Badge Overlay + Heatmap** (both):

1. **AQI Badge**: Floating badge on the map showing current AQI value
   - Color-coded by AQI scale
   - Position: top-right of map area or near city center
   - Click expands to show breakdown (PM2.5, PM10, NO2, O3)
   - Always visible when air-quality layer is enabled

2. **Heatmap Overlay**: Multi-point grid with interpolated color overlay
   - Query 4-9 grid points across the city for spatial variation
   - Semi-transparent color fill interpolated between points
   - Careful opacity (~0.3) to not obscure the map
   - Visual gradient showing where air quality varies

#### Strip/Panel Component

**New `AirQualityStrip`** in the content area:
- Current AQI with color-coded badge and label (Good/Fair/etc.)
- Breakdown: PM2.5, PM10, NO2, O3 values with small progress bars
- 24h trend chart (small sparkline using AQI hourly data)
- Health recommendation text based on AQI level

#### Layer Toggle

Add `'air-quality'` to DataLayerToggles. Default: off.

### DB Schema (Optional)

**New table** or extend `weatherSnapshots`:
- Since air quality changes slowly and is fetched with weather, could add an `airQuality jsonb` column to `weatherSnapshots`
- Or create a separate `airQualitySnapshots` table (cleaner separation)

## Files Changed

| File | Change |
|---|---|
| `shared/types.ts` | Add AirQuality type |
| `packages/server/src/cron/ingest-weather.ts` | Add air quality fetch alongside weather |
| `packages/server/src/routes/air-quality.ts` | New — API route |
| `packages/server/src/app.ts` | Register route |
| `packages/server/src/routes/news.ts` | Add to bootstrap |
| `packages/server/src/db/schema.ts` | Add airQuality JSONB or new table |
| `packages/server/src/db/writes.ts` | Persist air quality |
| `packages/server/src/db/reads.ts` | Read air quality |
| `packages/server/src/db/warm-cache.ts` | Warm air quality cache |
| `packages/web/src/lib/api.ts` | Add type + API method |
| `packages/web/src/hooks/useAirQuality.ts` | New — React Query hook |
| `packages/web/src/components/strips/AirQualityStrip.tsx` | New — AQI display strip |
| `packages/web/src/components/map/CityMap.tsx` | Add AQI badge/overlay |
| `packages/web/src/stores/useCommandCenter.ts` | Add 'air-quality' layer toggle |
| `packages/web/src/components/sidebar/DataLayerToggles.tsx` | Add air quality toggle |

## Implementation Order

1. Define AirQuality type in shared/types.ts
2. Add air quality fetch to ingest-weather.ts
3. Create API route
4. Add to bootstrap + cache warming
5. Create frontend hook + API method
6. Create AirQualityStrip component
7. Add AQI map badge/overlay
8. Add layer toggle
9. DB schema + persistence (optional)
10. Typecheck

## Decisions

- **Map visualization**: Both AQI badge and heatmap. Badge for quick reading, heatmap for spatial context.
- **Cron integration**: Extend existing weather cron (shared 30-min schedule). One less job to manage, and air quality data naturally fits alongside weather.
- **Multi-point grid**: Yes — query 4-9 points across the city for the heatmap. At 11km resolution, Berlin (~40km) will show ~4 distinct data regions. Each point is a separate API call, but they're free and fast.
- **DB storage**: JSONB column in weatherSnapshots table (add `airQuality jsonb` column). Air quality is naturally paired with weather data.
