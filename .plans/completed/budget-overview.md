# Budget Overview — Berlin Doppelhaushalt Integration

## Data Source

**Berlin Doppelhaushalt 2026/2027 CSV**
- URL: `https://www.berlin.de/sen/finanzen/service/daten/260223_doppelhaushalt_2026_2027.csv`
- ~47,000 rows, semicolon-delimited, UTF-8 with BOM
- License: CC-BY
- Updated rarely (when Nachträge are published, a few times per budget cycle)

### CSV Columns (relevant subset)
| Column | Description | Example |
|--------|-------------|---------|
| Bereich | Area code: 30=state, 31-42=districts | `30` |
| Bereichsbezeichnung | Area name | `Hauptverwaltung`, `Mitte`, `Pankow` |
| Hauptfunktion | Policy area code (0-8) | `1` |
| Hauptfunktionsbezeichnung | Policy area name | `Bildungswesen, Wissenschaft...` |
| Titelart | Revenue or expense | `Einnahmetitel` / `Ausgabetitel` |
| Jahr | Fiscal year | `2026` / `2027` |
| BetragTyp | Amount type (always "Soll" = planned) | `Soll` |
| Betrag | Amount in EUR | `40000` |

### Area Codes
- `30` — Hauptverwaltung (state-level administration)
- `31` — Mitte
- `32` — Friedrichshain-Kreuzberg
- `33` — Pankow
- `34` — Charlottenburg-Wilmersdorf
- `35` — Spandau
- `36` — Steglitz-Zehlendorf
- `37` — Tempelhof-Schöneberg
- `38` — Neukölln
- `39` — Treptow-Köpenick
- `40` — Marzahn-Hellersdorf
- `41` — Lichtenberg
- `42` — Reinickendorf

### Policy Area Codes (Hauptfunktion)
- `0` — General Services
- `1` — Education, Science, Research, Culture
- `2` — Social Security, Family, Youth, Labor
- `3` — Health, Environment, Sport
- `4` — Housing, Urban Development
- `5` — Agriculture, Forestry
- `6` — Energy, Water, Commerce
- `7` — Transport, Communications
- `8` — Finance

## Architecture

### Approach: Cache-only static ingest (like construction)

The budget CSV changes very rarely (a few times per 2-year cycle). The cron job downloads the full CSV, aggregates it server-side into a compact summary (~2 KB JSON), and stores it in the memory cache. No DB persistence needed — the data is always available from the public URL and can be re-fetched on restart.

**Debt calculation:** Revenue minus expenses = surplus (positive) or new debt (negative). We show this as "new debt" for the budget period.

### Server-side Aggregation

The cron job produces a `BudgetSummary`:

```ts
interface BudgetCategoryAmount {
  code: number;       // Hauptfunktion code (0-8)
  name: string;       // Short English label (mapped from German)
  amount: number;     // Sum in EUR
}

interface BudgetAreaSummary {
  areaCode: number;
  areaName: string;   // "Berlin (Total)" or district name
  revenues: BudgetCategoryAmount[];
  expenses: BudgetCategoryAmount[];
  totalRevenue: number;
  totalExpense: number;
}

interface BudgetSummary {
  year: string;              // "2026/2027"
  areas: BudgetAreaSummary[];
  fetchedAt: string;
}
```

The aggregation logic:
1. Download and parse the CSV
2. Filter to year=2026 (first year of the double budget) and BetragTyp=Soll
3. Group by (Bereich, Titelart, Hauptfunktion)
4. Sum Betrag within each group
5. Build one `BudgetAreaSummary` per Bereich, plus a synthetic "Berlin (Total)" that sums all areas
6. Store as `${cityId}:budget` in cache with long TTL (24h)

### Files to Create/Modify

#### Server (packages/server/)
1. **`src/cron/ingest-budget.ts`** — new cron job: download CSV, parse, aggregate, cache
2. **`src/cron/ingest-budget.test.ts`** — unit test with mock CSV data
3. **`src/routes/budget.ts`** — new route: `GET /:city/budget`
4. **`src/routes/budget.test.ts`** — route test
5. **`src/app.ts`** — register cron job + route

#### Shared (shared/)
6. **`types.ts`** — add `BudgetSummary`, `BudgetAreaSummary`, `BudgetCategoryAmount`

#### Frontend (packages/web/)
7. **`src/hooks/useBudget.ts`** — React Query hook
8. **`src/components/strips/BudgetStrip.tsx`** — main component with city/district modes and pie charts
9. **`src/components/layout/CommandLayout.tsx`** — add Budget tile
10. **`src/lib/api.ts`** — add `getBudget` to api object, add to `BootstrapData`
11. **`src/hooks/useBootstrap.ts`** — seed budget query from bootstrap
12. **`src/i18n/{en,de,tr,ar}.json`** — add `panel.budget.*` keys

#### Config
13. **`src/config/cities/berlin.ts`** — add `budget` data source config

## Frontend Design

### City Mode (default)
```
┌─────────────────────────────────────────┐
│ City Budget                  [City ▼]   │
│                             [Districts] │
│                                         │
│  ┌──── Revenues ────┐ ┌── Expenses ──┐  │
│  │    (pie chart)    │ │  (pie chart) │  │
│  │                   │ │              │  │
│  │  €XX.X bn total   │ │ €XX.X bn    │  │
│  └───────────────────┘ └──────────────┘  │
│                                         │
│  New debt: €X.X bn  │  Total: €XX.X bn  │
└─────────────────────────────────────────┘
```

- Two pie charts side by side: revenues and expenses, both by Hauptfunktion
- Below: "New debt" (total expenses minus total revenues for the period) and "Total budget" (sum of expenses)
- Data is for Berlin as a whole (all Bereiche summed)

### Districts Mode
```
┌─────────────────────────────────────────────┐
│ City Budget                       [City]    │
│                               [Districts ▼] │
│                                             │
│  ┌ [Berlin (Total) ▼] ┐ ┌ [Neukölln    ▼] ┐│
│  │    (pie chart)      │ │   (pie chart)   ││
│  │    expenses         │ │   expenses      ││
│  │    €XX.X bn         │ │   €XXX M        ││
│  └─────────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────┘
```

- Two expense pie charts side by side, each with its own dropdown
- Dropdowns: "Berlin (Total)" + each of the 12 districts
- This allows easy comparison of any two areas
- Each pie shows expenses by Hauptfunktion with the total below

### Pie Chart Implementation

Hand-rolled SVG (following the existing `SeatChart` pattern in PoliticalStrip):
- `<svg viewBox>` with `<path>` arcs computed from percentage shares
- Color-coded segments with a legend below
- Total amount displayed in the center

## Cron Schedule

- **Schedule:** `0 6 * * *` (daily at 6 AM) — the data changes extremely rarely
- **runOnStart:** `true` — ensure data is available immediately
- **Cache TTL:** 86400 seconds (24 hours)
- **Cache-Control:** 3600 seconds (1 hour) on the API route

## Decisions

- **Year:** 2026 only (first year of double budget, cleaner single-year numbers)
- **District mode:** Expenses only (district-level revenues are mostly state transfers)
- **Tile span:** 2 (half desktop width, enough for two pie charts)

## Scope

- Berlin only (no Hamburg budget data source yet)
- No map overlay
- No DB persistence (cache-only, like construction)
- No Nachträge detection (future enhancement)
