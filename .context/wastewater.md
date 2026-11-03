# Wastewater Monitoring

Weekly viral load in wastewater for all four cities (Influenza A, Influenza B, RSV, SARS-CoV-2). Each city's source is `dataSources.wastewater` in its server config:

| City | Provider | Plants (`sites`) | Flu A/B, RSV from | SARS-CoV-2 from |
|---|---|---|---|---|
| Berlin | `lageso` | `Berlin Ruhleben`, `Berlin Schönerlinde`, `Berlin Waßmannsdorf` | LAGeSo CSV | AMELAG |
| Hamburg | `amelag` | `Hamburg 01` (581,423 people), `Hamburg 02` (1,464,784) | AMELAG | AMELAG |
| Köln | `amelag` | `Köln` (863,455) | AMELAG | AMELAG |
| München | `amelag` | `München` (1,240,000) | AMELAG | AMELAG |

## Data Sources

### Lageso BEWAC (Berlin)
- **CSV URL:** `https://data.lageso.de/infektionsschutz/opendata/abwassermonitoring/BEWAC_abwassermonitoring_berlin.csv` (`csvUrl` in `berlin.ts`)
- **Format:** Semicolon-delimited, German decimal format (comma), quoted fields
- **Pathogens:** Influenza A, Influenza B, RSV
- **Plants:** 3 treatment plants (Ruhleben, Schonerlinde, Wassmannsdorf) covering ~84% of Berlin
- **Update frequency:** CSV updated daily. Since autumn 2026 Influenza A is sampled twice a week (Wednesday and Sunday), B and RSV on Wednesdays only, so the newest sample date often holds Influenza A alone; the ingestion groups by calendar week for this reason
- **License:** Datenlizenz Deutschland - Namensnennung - Version 2.0

### RKI AMELAG (all four cities)
- **TSV URL:** `https://raw.githubusercontent.com/robert-koch-institut/Abwassersurveillance_AMELAG/main/amelag_einzelstandorte.tsv`
- **Format:** Tab-separated, nationwide, 56 MB on 2026-11-02 and growing. Columns `standort, bundesland, datum, viruslast, viruslast_normalisiert, vorhersage, obere_schranke, untere_schranke, einwohner, laborwechsel, typ, unter_bg`; the parser finds them by header name
- **Rows:** one per plant, `typ` and day; days without a sample have `viruslast` NA. Plants sample two or three times a week
- **`typ` used:** `Influenza A`, `Influenza B`, `SARS-CoV-2`, and the combined RSV figure, spelt `RSV A+B` (Hamburg, Köln) or `RSV A/B` (Berlin, München). `Influenza A+B`, `RSV A` and `RSV B` are skipped
- **Below the detection limit:** `unter_bg` = `ja` rows carry the lab's limit as `viruslast` (10,000 or 35,000 in Hamburg, 750–2,440 in Köln, 1,000 in München); they count as 0, so an absent pathogen shows "None" rather than a constant value. A combined RSV A+B sample is flagged `ja` when either part is below the limit, so a week where only RSV B was measurable counts as 0 too (seen in Köln on 2026-10-07)
- **Update frequency:** Weekly (~Wednesdays), up to 2-week lag from sampling to publication
- **License:** CC BY 4.0 (Robert Koch-Institut), credited per city on the Sources page
- **Memory:** Stream-parsed line by line, keeping only the configured plants' measured rows (a few thousand)

## Architecture

### Ingestion (`packages/server/src/cron/ingest-wastewater.ts`)

- Loops over the active cities with `dataSources.wastewater`. Downloads the AMELAG TSV **once** per run for the union of their `sites` (`parseAmelagSites`), then builds each city from its own plants' rows
- **AMELAG city** (`buildAmelagSummary`): per pathogen (`buildAmelagPathogen`), each plant's samples are averaged per ISO calendar week (Monday start), then the plants are averaged weighted by `einwohner`. One value per week, so the sparkline's 7-day spacing holds; weeks without any sample are left out (a seasonal pause shortens the history). Value = latest week, previous = the week before, level against the highest week on record, history = last 12 weeks. Summary `sampleDate` = the newest sample date; a pathogen whose newest sample is older keeps its own `sampleDate`. `plantCount` = plants in the latest week
- **Berlin** (`provider: 'lageso'`): LAGeSo's flu and RSV go through the same weekly grouping as AMELAG (`buildSummary` hands the rows to `buildAmelagSummary`, every plant weighted 1, as LAGeSo gives no population): each plant's Wednesday and Sunday samples become one weekly value, each pathogen keeps its own newest sample date, and the trend compares the latest week with the one before. Before 2026-11-02 it grouped by sample date and showed only the newest date's pathogens, so a Sunday with Influenza A alone hid Flu B and RSV (the case `cron/fixtures/lageso-bewac-trimmed.csv`, recorded 2026-11-02, pins). Then SARS-CoV-2 from AMELAG for the three Berlin plants via the same weekly, weighted `buildAmelagPathogen`. Its `sampleDate` is set on the pathogen only when it differs from LAGeSo's
- Trend: latest vs previous (rising >1.5x, falling <0.67x, stable otherwise; "new" if previous=0, "gone" if current=0). Level: ≤25% of max low, ≤50% moderate, above high, 0 none
- Failures: AMELAG failing leaves every `amelag` city's cache and DB row as they were and Berlin without SARS-CoV-2; LAGeSo failing skips Berlin only
- DB: Unified `snapshots` table, type `lageso-wastewater` for every city (the name predates the AMELAG cities; renaming it would need a migration), one JSONB row per city and run
- Cache key: `${cityId}:wastewater:summary` (7-day TTL)
- Cron schedule: `0 6 * * *` (daily at 6 AM), conditional `runOnStart` based on DB freshness (`serves`: cities with `dataSources.wastewater`)
- Exported helpers: `computeTrend`, `computeLevel`, `parseAmelagSites`, `buildAmelagPathogen`, `buildAmelagSummary`, `AMELAG_TSV_URL`
- Tests use `cron/fixtures/amelag-einzelstandorte-trimmed.tsv`, recorded 2026-11-02 and trimmed to samples from 2026-09-28 (model columns 5–8 blanked)

### Route (`packages/server/src/routes/wastewater.ts`)

- `GET /:city/wastewater` — returns `WastewaterSummary | null`
- Cache-first, DB fallback, then null
- `Cache-Control: 43200` (12 hours)

### Frontend

- Hook: `useWastewater(cityId, enabled = true)` — 24h polling, 12h stale
- Strip: `WastewaterStrip({ expanded })` — expandable tile, shown for a city whose web config lists the `wastewater` feature (`CommandLayout.tsx`)
  - **Collapsed:** horizontal row showing each pathogen with level badge and trend arrow (e.g. "Flu A High ->"). Pathogens sit in pairs: one line when all fit, otherwise the pairs wrap into a 2x2 grid (2 + 1 for an odd count). `min-w-fit` makes the wrap follow the rendered text, and `basis-0` with a grow equal to the pair's size gives every pathogen an equal share of the line, so wrapped columns line up. The Tile clips overflow, so a non-wrapping row loses the last trend arrow on phone-width and single-column desktop tiles
  - **Expanded:** vertically stacked pathogens with bold name titles, compact measurement values (gc/L with k/M suffixes), level/trend badges, full-width sparkline charts (12-week history), date labels, and per-pathogen sample date when it differs from the main date
  - The footer's "Sample: <date>" shows AMELAG's publication lag (one to two weeks)
- Tile placed in the environment row after Pollen; starts collapsed (no `defaultExpanded`)
- Bootstrap seeded via `wastewater` field

## Shared Types

```typescript
interface WastewaterPathogen {
  name: string;            // 'Influenza A' | 'Influenza B' | 'RSV' | 'SARS-CoV-2'
  value: number;           // gene copies/L (latest week)
  previousValue: number;   // gene copies/L (previous week)
  trend: 'rising' | 'falling' | 'stable' | 'new' | 'gone';
  level: 'none' | 'low' | 'moderate' | 'high';
  history: number[];       // last 12 weeks, oldest first
  sampleDate?: string;     // per-pathogen date when it differs from summary sampleDate
}

interface WastewaterSummary {
  sampleDate: string;
  pathogens: WastewaterPathogen[];
  plantCount: number;
}
```

## Reported cases (RKI IfSG)

Berlin and Hamburg's expanded tile also shows the lab-confirmed influenza and RSV cases notified under the Infektionsschutzgesetz, below the viral load, so the two can be read side by side.

- **Sources:** `https://raw.githubusercontent.com/robert-koch-institut/Influenzafaelle_in_Deutschland/main/IfSG_Influenzafaelle.tsv` (about 0.7 MB, starts with a byte order mark) and `.../Respiratorische_Synzytialvirusfaelle_in_Deutschland/main/IfSG_RSVfaelle.tsv` (about 0.15 MB). The github.com pages answer 403 through the proxy; raw works. Both overwritten weekly (data cut Wednesday 0:00); newest week 2026-W43 on 2026-11-03
- **Format:** TSV `Meldewoche, Region, Region_Id, Altersgruppe, Fallzahl, Inzidenz`, columns found by name. `Region_Id` is the Land key (`00` Germany, `11` Berlin, `02` Hamburg). Only `Altersgruppe` = `00+` is used. The influenza file **leaves out a Land's weeks without a case** (Hamburg W29 and W30 of 2026), so a missing week counts as 0; the RSV file writes zeros
- **Coverage:** Land only, no Kreis, so only the city-states. Köln and München have no `dataSources.respiratoryCases` and show no cases (NRW or Bayern figures would not be the city's)
- **Licence:** CC BY 4.0, "unter Bedingung der Namensnennung des Robert Koch-Instituts als Quelle" (both Readmes). Credited on the Sources page as "RKI IfSG Influenza and RSV Cases" for Berlin and Hamburg, and in the tile section's source line
- **Ingestion** (`cron/ingest-respiratory-cases.ts`, `15 6 * * *`): downloads both files once per run (`parseIfsgTsv`), then per city `buildRespiratoryCases`: the newest week of either file, per pathogen that week's cases and incidence, the week before, the trend (`computeTrend` from the wastewater job: rising >1.5x, falling <0.67x, new, gone) and 12 weekly counts (`buildCaseSeries`; not padded before the file's first week). One file failing writes the other pathogen alone; both failing leaves cache and DB as they were
- **Storage:** snapshot type `rki-ifsg-cases` (about 300 bytes a city), cache key `${cityId}:respiratory-cases` (7 days), bootstrapped, route `GET /:city/respiratory-cases` (12 h HTTP cache), freshness spec 1 day
- **Frontend:** `useRespiratoryCases(cityId, enabled)`, enabled by the `respiratoryCases` city feature. `ReportedCases` in `WastewaterStrip.tsx` renders in the expanded view only, after the viral-load pathogens: heading "Reported cases" with the week number, per pathogen the count, incidence per 100k, trend arrow and the same `Sparkline` (blue, ending on the Meldewoche's Monday). The collapsed tile is unchanged
- Tests: `cron/fixtures/rki-ifsg-influenza-trimmed.tsv` and `rki-ifsg-rsv-trimmed.tsv`, real rows recorded 2026-11-03

```typescript
interface RespiratoryCases {
  week: string;        // "2026-W43"
  weekStart: string;   // "2026-10-19", Monday of that week
  pathogens: Array<{ name: 'Influenza' | 'RSV'; cases: number; incidence: number; previousCases: number;
    trend: 'rising' | 'falling' | 'stable' | 'new' | 'gone'; history: number[] }>;
}
```

## Adding a city

Find its plants in the AMELAG file (`standort`, with `bundesland` and `einwohner`; see the add-city skill's source-lookups.md) and set `wastewater: { provider: 'amelag', sites: [...] }`. A plant serving only part of the city still represents it; one serving mostly a neighbouring Landkreis does not. Only a city-state (Bremen would be the next) also gets `respiratoryCases: { provider: 'rki-ifsg', regionId: '<Land key>' }` and the `respiratoryCases` web feature.
