# Feuerwehr (Fire Department)

Berlin-only monthly fire department statistics from the [Berliner Feuerwehr Open Data](https://github.com/Berliner-Feuerwehr/BF-Open-Data) GitHub repository.

## Data Source

**CSV:** `BFw_mission_data_monthly.csv` — auto-updated daily via GitHub commits, covers 2018–present.

URL: `https://raw.githubusercontent.com/Berliner-Feuerwehr/BF-Open-Data/main/Datasets/Daily_Data/BFw_mission_data_monthly.csv`

30 columns per row (YYYY-MM granularity): mission counts by type (all, EMS, fire, technical rescue, urgency levels RD1-RD5) and response time statistics (mean, median, std) for EMS critical, CPR, fire pump, fire ladder, full crew, and technical rescue.

## Architecture

Follows the standard data source pattern (like labor-market):

- **Cron:** `ingest-feuerwehr.ts` — daily at 08:00, fetches CSV, parses last 3 months (previous, current complete, current partial)
- **Type:** `FeuerwehrSummary` = `{ current, partial, previous }` where each is a `FeuerwehrMonthData`
- **Cache key:** `CK.feuerwehr(cityId)` — included in bootstrap bundle
- **DB:** `feuerwehr_snapshots` table (JSONB), 30-day retention
- **Route:** `GET /:city/feuerwehr` — cache-first, DB fallback, 12h HTTP cache

## Frontend

- **Hook:** `useFeuerwehr(cityId, isBerlin)` — 24h refetch, 12h stale
- **Component:** `FeuerwehrStrip` — Berlin-only expandable tile
  - **Collapsed:** 3 KPI blocks — total missions, EMS response time (min:sec), fire pump response time (min:sec), each with month-over-month delta
  - **Expanded:** Mission type breakdown bar (EMS/fire/rescue) + current partial month stats
- **Placement:** After wastewater tile, before labor market tile

## Key Fields Used

| CSV Column | Maps To |
|---|---|
| `mission_count_all` | Total missions |
| `mission_count_ems` | EMS missions |
| `mission_count_fire` | Fire missions |
| `mission_count_technical_rescue` | Technical rescue |
| `response_time_ems_critical_median` | EMS response (seconds) |
| `response_time_fire_time_to_first_pump_median` | Fire pump response (seconds) |
