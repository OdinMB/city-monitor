# Council Meetings

Upcoming council meetings for Berlin (BVV district assemblies and Abgeordnetenhaus), Köln (Rat, committees and Bezirksvertretungen) and München (Stadtrat committees and Bezirksausschüsse). One job, one adapter per kind of source, chosen by the keys a city sets in `dataSources.councilMeetings`.

## Data Sources

### Berlin: BVV (ALLRIS OParl 1.0)
- **11 Berlin districts** with OParl JSON REST APIs hosted at `sitzungsdienst-*.de`
- Spandau has no OParl endpoint (excluded)
- Paginated: 20 meetings per page, up to 10 pages fetched per district
- Requires browser-like headers (User-Agent, Accept, Accept-Language) — plain fetch gets 403
- 1s delay between district requests for rate limiting
- Returns: meeting name, start/end, location (room + address), agenda items, web URL
- Licence: CC BY 3.0 DE (credited on the Sources page)

### Berlin: PARDOK (Parliament XML)
- Two XML feeds: `app_com.xml` (committee), `app_plen.xml` (plenary)
- Uses `fast-xml-parser` with `ignoreAttributes: false` to read `<field name="...">` attributes
- Dates are in Europe/Berlin local time — `berlinUtcOffset()` handles CET/CEST correctly

### Köln: SessionNet OParl 1.1 (`oparlBody`)
- `https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln/meetings` (SOMACOS Session, system "Stadt Köln - OParl 1.1"). `ratsinformation.stadt-koeln.de/oparl` resets the connection; use `buergerinfo`.
- **One body for everything:** council, committees, Stadtarbeitsgemeinschaften and the nine Bezirksvertretungen. A meeting whose name contains `districtBody` ("Bezirksvertretung") is `source: 'bvv'` with the words after it as `district` ("Sitzung der Bezirksvertretung Lindenthal" → Lindenthal); every other meeting is `source: 'parliament'`.
- **Order and paging:** the list is sorted by creation (newest id first), not by date, and holds meetings planned up to two years ahead. The job asks for `?limit=100` (OParl 1.1; the default is 25) and follows `links.next` until a page has no meeting from now on, at most 15 pages; in November 2026 that was 7 pages (~30 s). The 14-day window is applied per meeting.
- **Quirks:** the end time is often midnight of the meeting day (before the start), so an end not after the start is dropped. Meetings carry no `web`; the link is `webUrlPrefix` + the id's last segment (`https://buergerinfo.stadt-koeln.de/si0057.asp?__ksinr=<id>`). `cancelled: true` and "nichtöffentlich" meetings are skipped. Locations have a room only.
- Licence: neither `system` nor `body` has a `license` field (`licenseValidSince` 2017-01-31). These are official public records of the city's council information system; credited on the Sources page as such. Contact: 12-session@stadt-koeln.de.

### München: RIS RSS (`muenchenRis`)
- No OParl (`risi.muenchen.de/risi/oparl` is 404). Two RSS feeds: `https://risi.muenchen.de/risi/rss?feed=StR-Sitzungen` (Stadtrat committees and plenary) and `…?feed=BA-Sitzungen` (the 25 Bezirksausschüsse). robots.txt allows everything except jsessionid URLs.
- Each feed holds only its newest ~11–13 meetings, about the next 10 days, so the tile may show less than the 14-day window.
- `parseRisTitle()` reads the title: "BA-Sitzung BA 16 - Vollgremium am Donnerstag, 12. November 2026, 19:30 Uhr" → body "BA 16 - Vollgremium", start `2026-11-12T19:30:00+01:00` (German month names, local time with `berlinUtcOffset()`, so CET or CEST by date). A trailing note ("im Anschluss an vorhergehende Sitzung.") is ignored.
- StR items are `source: 'parliament'` with the committee as named. BA items are `source: 'bvv'`, `district` the Stadtbezirk of the BA number (`MUENCHEN_BEZIRKE`), committee "Bezirksausschuss 16 – Vollgremium".
- The location is the description's "Sitzungsort" line; the description's HTML carries its entities a second time (`Gro&amp;szlig;er`), so it is decoded after the XML parser. The id is `muenchen-ris-<RIS id>` from the item link, which is also `webUrl`.
- Licence: none stated; official public records of the city's council information system, credited on the Sources page as such.

## Pipeline

1. **Cron** (`ingest-council-meetings.ts`): every 6h, runs the adapters the city configures, 14-day lookahead; merges, sorts by start and deduplicates by id. All adapters returning nothing keeps the old data.
2. **Cache**: `{cityId}:council-meetings`, TTL 25920s (7.2h)
3. **DB**: Unified `snapshots` table, type `oparl-meetings`, 2-day retention plus the 100-row cap (`CAPPED_RETENTION` in `cron/data-retention.ts`); DB reads refuse rows older than 48 h
4. **Route**: `GET /:city/council-meetings` — 3-tier read (cache → DB → null)
5. **Bootstrap**: included in `GET /:city/bootstrap` response

Council data is not AI input.

## Schema

```typescript
interface CouncilMeeting {
  id: string;
  source: 'bvv' | 'parliament';   // district body | city-wide body (state parliament in Berlin)
  district?: string;        // bvv only
  committee: string;
  start: string;            // ISO datetime with offset
  end?: string;
  location?: string;
  agendaItems?: Array<{ number: string; name: string; public: boolean }>;
  webUrl?: string;
}
```

## Frontend

- Hook: `useCouncilMeetings` (1h refetch, 30min stale)
- Strip: `CouncilMeetingsStrip` — a select picks the city-wide body (default) or one district; that source's meetings are grouped by day in a scrolling list (max 300 px), each with time, committee, district, location, agenda-item count and a link
- Labels per city through i18next context (`{ context: cityId }`): `panel.councilMeetings.parliament_koeln` ("Rat der Stadt" / "City Council"), `parliament_muenchen` ("Stadtrat"), German `bvv_koeln` ("Bezirksvertretung"), `bvv_muenchen` ("Bezirksausschuss") and `title_koeln`/`title_muenchen` ("Ratssitzungen"); without a city key the Berlin wording is used
- Span-2 tile in `CommandLayout.tsx` (governance row, after Budget) for each city with the `councilMeetings` feature; not expandable
- i18n: `panel.councilMeetings.*` keys in all 4 locales

## Config

```typescript
// berlin.ts
councilMeetings: {
  bvv: [{ district: 'Mitte', baseUrl: '...' }, ...],  // 11 districts
  parliament: { committeeUrl: '...', plenaryUrl: '...' },
}
// koeln.ts
councilMeetings: {
  oparlBody: { meetingsUrl: '…/bodies/stadtverwaltung_koeln/meetings', districtBody: 'Bezirksvertretung', webUrlPrefix: '…/si0057.asp?__ksinr=' },
}
// muenchen.ts
councilMeetings: {
  muenchenRis: { councilFeedUrl: '…?feed=StR-Sitzungen', districtFeedUrl: '…?feed=BA-Sitzungen' },
}
```

Tests use trimmed recorded responses in `packages/server/src/cron/fixtures/` (`koeln-oparl-meetings-page*.json`, `muenchen-ris-*.xml`).
