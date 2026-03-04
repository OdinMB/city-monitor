# Council Meeting Agendas — Berlin BVV + Abgeordnetenhaus

## Research Summary (verified 2026-03-04 from Berlin IP)

### BVV District Assemblies — OParl API

**11 of 12 districts** have working OParl 1.0 JSON endpoints at `sitzungsdienst-*.de/oi/oparl/1.0/`.

| District | Base URL | Status |
|----------|----------|--------|
| Mitte | `sitzungsdienst-mitte.de` | 20 meetings |
| Pankow | `sitzungsdienst-pankow.de` | 20 meetings |
| Charlottenburg-Wilmersdorf | `sitzungsdienst-charlottenburg-wilmersdorf.de` | 20 meetings |
| Friedrichshain-Kreuzberg | `sitzungsdienst-friedrichshain-kreuzberg.de` | 0 meetings (empty) |
| Neukölln | `sitzungsdienst-neukoelln.de` | 20 meetings |
| Steglitz-Zehlendorf | `sitzungsdienst-steglitz-zehlendorf.de` | 20 meetings |
| Treptow-Köpenick | `sitzungsdienst-treptow-koepenick.de` | 20 meetings |
| Marzahn-Hellersdorf | `sitzungsdienst-marzahn-hellersdorf.de` | 20 meetings (OParl 1.0, not 1.1) |
| Lichtenberg | `sitzungsdienst-lichtenberg.de` | 20 meetings (rich: locations, agendas, PDFs) |
| Reinickendorf | `sitzungsdienst-reinickendorf.de` | 20 meetings |
| Tempelhof-Schöneberg | `sitzungsdienst-tempelhof-schoeneberg.de` | 20 meetings |
| Spandau | `sitzungsdienst-spandau.de` | **No OParl (404)** |

License: CC-BY 3.0 Germany.

### OParl Meeting Object Shape (verified from Lichtenberg)

```json
{
  "id": "https://...meetings.asp?id=6145",
  "type": "https://schema.oparl.org/1.0/Meeting",
  "name": "77. Sitzung in der IX. Wahlperiode des Ausschusses ...",
  "start": "2026-03-12T19:00:00+01:00",
  "end": "2026-03-12T19:00:00+01:00",
  "location": {
    "description": "Möllendorffstraße 6, 10367 Berlin",
    "streetAddress": "Möllendorffstraße 6",
    "postalCode": "10367",
    "locality": "Berlin",
    "room": "Rathaus Lichtenberg, Raum 100"
  },
  "organization": ["https://...organizations.asp?typ=gr&id=68"],
  "agendaItem": [
    { "number": "4", "name": "Schwerpunktthema", "public": true },
    { "number": "4.1", "name": "KGA Querweg", "public": true }
  ],
  "invitation": { "accessUrl": "https://...download.asp?dtyp=105&id=445498" },
  "web": "https://www.berlin.de/ba-lichtenberg/.../to010.asp?SILFDNR=6145",
  "created": "2026-01-21T08:59:44+01:00",
  "modified": "2026-03-04T06:03:08+01:00"
}
```

Pagination: 20 items per page, `links.next` for next page.

### Abgeordnetenhaus — PARDOK XML

Both feeds return HTTP 200 from any IP (no access restrictions).

| Feed | URL | Entries | Coverage |
|------|-----|---------|----------|
| Committee schedule | `parlament-berlin.de/app_com.xml` | 1,414 | 2021–Sep 2026 |
| Plenary schedule | `parlament-berlin.de/app_plen.xml` | ~100 | 2021–Dec 2026 |

XML schema per row:
```xml
<row>
  <field name="Termin_ID">5534</field>
  <field name="committee_name">Ausschuss für Wirtschaft, Energie und Betriebe</field>
  <field name="wahlperiode">19</field>
  <field name="date_time">2026-06-01 14:00:00</field>
  <field name="date_time_end">2026-06-01 17:00:00</field>
  <field name="title">Ausschuss für Wirtschaft, Energie und Betriebe, Sitzungs-Nr. 71</field>
  <field name="address" xsi:nil="true" />
  <field name="capacity" xsi:nil="true" />
  <field name="updated">2025-09-22 15:56:25</field>
</row>
```

Limitations: no individual agenda items, address almost always null.

### Access Control Issue

The OParl servers block `curl` and similar HTTP clients (403 Forbidden) but serve data to browsers (Chromium via Playwright returns 200). This is likely TLS fingerprinting or header-based filtering. The Node.js cron will need to:
- Send full browser-like headers (User-Agent, Accept, Accept-Language, etc.)
- If that's not enough, use `undici` with HTTP/2 or a TLS-fingerprint-friendly approach
- Worst case: use Playwright/headless Chromium for ingestion (heavy but reliable)

The **Render server is in Frankfurt** (German IP), which should help with any GeoIP restrictions. The header/TLS issue needs testing from the server.

---

## Implementation Plan

### Scope

- **BVV:** 11 districts via OParl (skip Spandau, gracefully handle empty Friedrichshain-Kreuzberg)
- **Abgeordnetenhaus:** Committee + plenary schedules via PARDOK XML
- **Berlin-only** (no Hamburg data sources exist)
- **Time window:** Next 14 days

### Types

Combined type covering both sources:

```ts
interface CouncilMeeting {
  id: string;                    // OParl ID or PARDOK Termin_ID
  source: 'bvv' | 'parliament'; // distinguish BVV vs Abgeordnetenhaus
  district?: string;             // BVV district name (absent for parliament)
  committee: string;             // committee or "Plenum"
  start: string;                 // ISO datetime
  end?: string;
  location?: string;             // street address + room if available
  agendaItems?: {
    number: string;
    name: string;
    public: boolean;
  }[];
  webUrl?: string;               // link to ALLRIS page or parlament-berlin.de
}

type CouncilMeetings = CouncilMeeting[];
```

### Server

1. **Shared types** (`shared/schemas.ts`) — Add `CouncilMeeting` Zod schema + TS type

2. **City config** (`berlin.ts`) — Add `councilMeetings` data source:
   ```ts
   councilMeetings: {
     bvv: [
       { district: 'Mitte', baseUrl: 'https://www.sitzungsdienst-mitte.de/oi/oparl/1.0' },
       { district: 'Pankow', baseUrl: 'https://www.sitzungsdienst-pankow.de/oi/oparl/1.0' },
       // ... all 11 districts
     ],
     parliament: {
       committeeUrl: 'https://www.parlament-berlin.de/app_com.xml',
       plenaryUrl: 'https://www.parlament-berlin.de/app_plen.xml',
     },
   }
   ```

3. **Cache key** (`cache-keys.ts`) — `CK.councilMeetings(cityId)`, add to `bootstrapKeys`

4. **DB table** (`schema.ts`) — `council_meeting_snapshots`: `id serial`, `city_id text`, `fetched_at timestamp`, `meetings jsonb`

5. **DB writes/reads** — `saveCouncilMeetings()` / `loadCouncilMeetings()`

6. **Cron job** (`ingest-council-meetings.ts`) — Every 6 hours:
   - **BVV:** For each district, fetch `meetings.asp?body=1`, paginate until meeting dates fall outside 14-day window. Filter to public meetings only. Extract agenda items inline. Sequential with 1s delay between districts.
   - **PARDOK:** Fetch both XML feeds, parse, filter to next 14 days, tag as `source: 'parliament'`.
   - Merge both sources, sort by `start`, save to cache + DB.
   - Graceful degradation: if a district endpoint fails, log warning and continue with others.

7. **REST route** (`routes/council-meetings.ts`) — Standard 3-tier read

8. **App registration** (`app.ts`) — Cron every 6h, `FRESHNESS_SPECS` entry, route `cacheFor(1800)`

9. **Cache warming** (`warm-cache.ts`) — Berlin-only block

10. **Bootstrap** — Add `councilMeetings` to bootstrap response

### Frontend

11. **API client** (`api.ts`) — `api.getCouncilMeetings(cityId)`, extend `BootstrapData`

12. **Data hook** — `useCouncilMeetings.ts`

13. **Bootstrap seeding** — `setQueryData` in `useBootstrap.ts`

14. **Dashboard tile** — `CouncilMeetingsStrip.tsx`:
    - **Collapsed:** "X meetings this week" + next meeting preview (committee, district, date)
    - **Expanded:** Scrollable list grouped by date:
      - Each entry: time, committee name, district badge (BVV) or "Abgeordnetenhaus" badge
      - Top 3 public agenda items if available (truncated)
      - Location if available
      - Link to source (ALLRIS page or parlament-berlin.de)
    - Berlin-only (guarded by `cityId === 'berlin'`)
    - "No upcoming meetings" state when 14-day window is empty

15. **i18n** — Keys: "Council Meetings", "District Assembly", "State Parliament", "Plenary Session", "Committee Meeting", "meetings this week", "No upcoming meetings", "Agenda", district names

### Docs & Testing

16. **Sources page** — Two entries: Berlin BVV (OParl, CC-BY) + Abgeordnetenhaus (PARDOK)

17. **Context file** — `.context/council-meetings.md`

18. **CLAUDE.md** — Add reference

19. **Unit tests** — OParl JSON parsing, PARDOK XML parsing, date filtering, merge+sort, pagination, error handling for dead endpoints

20. **Integration test** — Route with mock cache/DB

### Dependencies

- **XML parser** for PARDOK: Need `fast-xml-parser` or similar. Check if already in project.
- **Access headers** for BVV: Node.js `fetch` needs browser-like headers. Test from Render server; if blocked, escalate to `undici` with custom TLS or Playwright.

### Considerations

- **Rate limiting:** 11 endpoints × ~2 pages each = ~22 requests per ingestion cycle. With 1s delays = ~22s total. Acceptable for 6-hour cron.
- **Data volume:** 14-day window across 11 districts + parliament ≈ 30-100 meetings. Small payload, fine for bootstrap.
- **Missing Spandau:** Note in UI: "Data from 11 of 12 districts."
- **Faction meetings:** Many meetings are faction sessions (SPD-Fraktion, AfD-Fraktion, etc.) which are less interesting to citizens. Consider filtering to only "öffentliche Sitzung" (public session) of committees and BVV plenary.
- **Access from Render:** Must verify OParl endpoints work from Frankfurt server. If they don't, PARDOK still works as fallback.
