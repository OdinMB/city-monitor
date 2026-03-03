# Historical Data Views

Add trend/history charts to dashboard tiles, letting users see how metrics change over time instead of only seeing the latest snapshot.

## Motivation

The app stores time-series data in Postgres (weather, air quality, water levels, unemployment) but only displays the most recent value. Historical trends are one of the most requested features in city dashboards — "Is air quality getting better or worse?" requires seeing the trend.

## Changes

### 1. Backend: Historical data endpoints

Add `?history=7d` (or `30d`) query parameter support to existing endpoints. The server queries Postgres for historical snapshots and returns a time-series array.

**Endpoints to add history support:**
| Endpoint | Data | Resolution | Max Range |
|----------|------|------------|-----------|
| `/api/:city/weather` | Temperature, humidity | Hourly snapshots | 7 days |
| `/api/:city/air-quality` | AQI values | Hourly snapshots | 30 days |
| `/api/:city/water-levels` | Gauge readings | 6-hourly snapshots | 30 days |
| `/api/:city/labor-market` | Unemployment rate | Monthly | 12 months |

**Response shape:**
```typescript
{
  current: T,           // existing
  history?: Array<{     // new, only when ?history param present
    timestamp: string,
    value: number
  }>
}
```

**Implementation:**
- Query the relevant table with `WHERE fetchedAt >= NOW() - interval` and `ORDER BY fetchedAt`
- Downsample if needed (e.g., pick one reading per hour for weather)
- Cache the history response with a TTL matching the cron interval

### 2. Frontend: Sparkline/chart component

Create a reusable `<TrendChart>` component:
- Small inline sparkline for collapsed tiles (like wastewater already has)
- Larger interactive chart for expanded tiles
- Uses SVG path (no charting library) — the wastewater sparkline is already a good reference implementation
- Tooltip on hover showing exact value + timestamp
- Responsive: adapts to tile width

### 3. Integrate into tiles

- **WeatherStrip:** 7-day temperature trend line in expanded view
- **AirQualityStrip:** 30-day AQI trend in expanded view, colored by AQI category thresholds
- **WaterLevelStrip:** 30-day level trend per station, with MNW/MHW reference lines
- **LaborMarketStrip:** 12-month unemployment rate chart (already has YoY % — add the visual)

### 4. Data retention alignment

Current retention periods (from `data-retention.ts`):

| Data | Current Retention | Needed for History | Action |
|------|------------------|--------------------|--------|
| Weather | 7 days | 7 days | OK |
| Air quality | 7 days | 30 days | **Extend to 30 days** |
| Water levels | 7 days | 30 days | **Extend to 30 days** |
| Labor market | 30 days | 24 months | **Extend to 24 months** |

Extending retention increases DB storage usage. Estimate impact:
- AQ grid: ~1 row/30min × 2 cities × 30 days = ~2,880 rows (JSONB, maybe 50-100MB)
- Water levels: ~1 row/6h × 2 cities × 30 days = ~240 rows (small)
- Labor market: ~1 row/month × 2 cities × 24 months = ~48 rows (tiny)

## Decisions

- **Charting library:** Add `@visx` (~50KB). Interactive tooltips, axes, responsive. More capable than pure SVG for expanded chart views.
- **Fetch strategy:** Lazy-load. Only fetch history when user expands a tile and clicks "Show trend". Saves bandwidth for the majority of users who just glance at current values.
- **Data retention:** Extend retention for air quality (7d → 30d), water levels (7d → 30d), and labor market (30d → 24 months). Storage impact is modest (see table in section 4).

## Scope

- 4 route files modified (add history query support)
- 4 DB read functions modified (add date range queries)
- 1 new reusable component (TrendChart)
- 4 strip components modified (integrate TrendChart)
- Possibly extend data retention (migration)
- No new runtime dependencies if using pure SVG
