# Pollen Forecast — Dashboard Tile

## Data Source

**DWD Pollenflug-Gefahrenindex**
- **URL:** `https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json`
- **Format:** Single JSON file (~15KB), all 27 German regions
- **License:** CC BY 4.0 (attribution: "Deutscher Wetterdienst")
- **Update:** Daily at 11:00 CET. On Fridays includes Sunday forecast.
- **Coverage:** Berlin (`region_id: 50`, `partregion_id: -1`) and Hamburg (`region_id: 10`, `partregion_id: 12`)

### Pollen Types (8)

| Key | English | Peak Season |
|---|---|---|
| `Hasel` | Hazel | Jan–Mar |
| `Erle` | Alder | Feb–Apr |
| `Esche` | Ash | Mar–May |
| `Birke` | Birch | Apr–May |
| `Graeser` | Grasses | May–Aug |
| `Roggen` | Rye | May–Jul |
| `Beifuss` | Mugwort | Jul–Sep |
| `Ambrosia` | Ragweed | Aug–Oct |

### Severity Scale

String values: `"0"`, `"0-1"`, `"1"`, `"1-2"`, `"2"`, `"2-3"`, `"3"`, `"-1"` (no data).

### Seasonality

Pollen season ~Jan–Oct. In winter, all values return `"-1"`. The JSON file remains available year-round.

## Surface

**Dashboard tile only** (no map layer). Expandable tile (span=1).

- **Collapsed:** Show only active pollen types (severity ≥ "1") for today, as colored badges. If no active pollen, show "Keine Belastung" / "No pollen burden".
- **Expanded:** 3-day forecast table (today / tomorrow / day after) for all 8 types. Rows for inactive types (`"0"` or `"-1"`) shown dimmed.
- **Off-season:** When all types are `"-1"`, show a seasonal message ("Pollen data available Feb–Oct" or similar).

### Severity colors

| Level | Color | Tailwind |
|---|---|---|
| 0 | Gray | `text-gray-400` |
| 0-1 | Light green | `text-green-400` |
| 1 | Green | `text-green-500` |
| 1-2 | Yellow | `text-yellow-500` |
| 2 | Orange | `text-orange-500` |
| 2-3 | Red-orange | `text-orange-600` |
| 3 | Red | `text-red-500` |

## Architecture

### Approach: Minimal — reuse existing patterns exactly

Single cron fetch, in-memory cache + Postgres snapshot, bootstrap-included (tiny payload). Follows the wastewater/feuerwehr tile pattern.

## Implementation Plan

### Server

1. **Shared types** (`shared/types.ts`) — `PollenForecast` interface: `{ region: string; updatedAt: string; pollen: Record<PollenType, { today: string; tomorrow: string; dayAfterTomorrow: string }> }`
2. **Cache key** (`cache-keys.ts`) — `CK.pollen(cityId)`, add to `bootstrapKeys`
3. **DB table** (`schema.ts`) — `pollen_snapshots` (city, data JSONB, fetched_at, created_at)
4. **DB writes/reads** (`writes.ts`, `reads.ts`) — `savePollen()`, `loadPollen()`
5. **Cron** (`ingest-pollen.ts`) — Fetch `s31fg.json`, extract region by city config (`pollenRegionId` + `pollenPartregionId`), parse pollen values, save to cache + DB. Schedule: every 2 hours (data updates once/day at 11:00 but we don't need to be exact).
6. **Route** (`routes/pollen.ts`) — `GET /api/:city/pollen` — 3-tier read
7. **App registration** (`app.ts`) — freshness spec, cron schedule, route mount, cache warming
8. **City config** — Add `pollenRegionId` and `pollenPartregionId` to Berlin (50, -1) and Hamburg (10, 12) configs

### Frontend

9. **API client** (`api.ts`) — `api.getPollen()`, extend `BootstrapData`
10. **Hook** (`usePollen.ts`) — poll every 60 min (data only changes daily)
11. **Bootstrap** (`useBootstrap.ts`) — seed pollen query data
12. **Tile** (`PollenStrip.tsx`) — expandable strip with collapsed/expanded views as described above
13. **Mount** in `CommandLayout.tsx` — after AirQualityStrip (Weather → AQI → Pollen grouping)
14. **i18n** — all 4 locales: pollen type names, severity labels, tile title, off-season message

### Docs & Testing

15. **Sources page** — add DWD Pollen entry to `SHARED_SOURCES`
16. **Tests** — parse logic (severity string → numeric, region extraction), edge cases (off-season, missing fields)
17. **Context file** — `.context/pollen.md`
18. **CLAUDE.md** — add reference
