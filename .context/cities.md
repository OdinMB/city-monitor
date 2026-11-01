# Cities: what each one has, what is missing, what is pending

_Last updated: 2026-11-01._ One overview per city: which sources it has, what was looked for and not found (or ruled out), and which requests to data owners are still unanswered. The details live in the topic files linked from `CLAUDE.md`; this file is the map. Update it in the same change whenever a city gains or loses a source, a request is answered, or a search comes up empty.

The research behind the Köln, München and Hamburg rows (licence verdicts, URLs, dead ends) is in the PM repo: `city-monitor-pm/references/engineering/2026-11-01_koeln-muenchen-hamburg-sources.md`. Feed licence verdicts are in [news.md](news.md) ("Feed status").

## Every city

Weather (BrightSky), DWD warnings, air quality (WAQI/Open-Meteo), rain radar, traffic incidents (TomTom), NINA alerts, DWD pollen, pharmacies (aponet), defibrillators (OSM), roadworks ([roadworks.md](roadworks.md)) and the crisis-line tile (hand-kept directory per city, re-check each November; [new-data-sources.md](new-data-sources.md)).

## Berlin

- **Has:** everything. On top of the shared sources: 6 news feeds with AI briefing, police (berlin.de), VBB transit, events (kulturdaten.berlin, Ticketmaster, go~mus), Spree/Havel/Dahme gauges and bathing water, council meetings (BVV OParl + Abgeordnetenhaus), political data (Bundestag, Abgeordnetenhaus, district mayors), budget, social atlas, population, labour market, wastewater, fire brigade, Bürgeramt appointments (Firecrawl), live noise sensors, noise map, rent map.
- **Stale data to check:** the hand-kept district-mayor table was last verified 2026-03-02, before the September 2026 Berlin elections.
- **Ruled out:** BZ Berlin (AI-input ban), taz Berlin (terms forbid automated access; removed 2026-11-01).
- **Pending requests:** none.

## Hamburg

- **Has:** 3 news feeds (NDR, MOPO, Feuerwehr Hamburg) with AI briefing, police (Polizei Hamburg on presseportal), Elbe gauges, roadworks (Bauweiser OGC API), political data (Bundestag, Bürgerschaft), noise map, crisis tile.
- **Looked for, not found or ruled out:**
  - News: Hamburger Abendblatt (feed terms forbid passing items on; removed), hamburg.de (feed gone), WELT (AI-input ban), ZEIT, taz Nord, t-online (blanket automated-access bans).
  - Transit: HVV's only source is the Geofox GTI API, which needs a key and restricts third-party use; gtfs.de has no Hochbahn real-time yet.
  - Events: hamburg.events (formerly MRH events) needs a usage agreement.
  - Budget: Offener Haushalt still only covers the 2019–2022 plan.
  - Appointments: possible only through Firecrawl's paid plan.
  - Two Elbe gauges (Bunthaus, Seemannshöft) have no characteristic values, so they show their level without a state. St. Pauli is tidal and reads "very high" often.
  - Crisis tile: the child-protection line is labelled generically.
- **Not looked for yet:** council meetings (Bürgerschaft, Bezirksversammlungen).

## Köln

- **Has:** 4 news feeds (WDR Rheinland, Kölner Stadt-Anzeiger, EXPRESS, Stadt Köln) with AI briefing, police (Polizei Köln on presseportal, also covers Leverkusen), Rhein gauge, roadworks (city WFS, permit periods), events (Stadt Köln open data), council meetings (SessionNet OParl 1.1), political data (Bundestag members for Köln I–III and Leverkusen – Köln IV, Landtag NRW members for Köln I–VII, by candidacy; the Oberbürgermeister and 9 Bezirksbürgermeister from a hand-kept table), crisis tile.
- **Looked for, not found or ruled out:**
  - News: Kölnische Rundschau left out because it repeats the Stadt-Anzeiger's newsroom; no WDR feed for Köln alone.
  - Transit: KVB publishes lift and escalator outages only; line disruptions exist only as an unlicensed web page. gtfs.de carries no KVB alerts.
  - DWD has no UV forecast for Köln.
  - District outlines: open (dl-de/zero-2.0) but only as a Shapefile; not wired, so nothing on the map is grouped by Stadtbezirk and there is no political map layer (Stadtbezirke are not constituencies anyway).

## München

- **Has:** 2 news feeds (BR24 Oberbayern, Feuerwehr München) with AI briefing, roadworks (Geoportal WFS, filtered), council meetings (RIS RSS feeds, about 10 days ahead), Isar flood class and flood warnings for the München and Puppling gauges (LHP, [water-levels.md](water-levels.md)), political data (Bundestag members for München-Nord/-Ost/-Süd/-West-Mitte, Bayerischer Landtag members for Stimmkreise 101–109, by candidacy; München-Land left out; the Oberbürgermeister from a hand-kept table), crisis tile.
- **Looked for, not found or ruled out:**
  - News: Süddeutsche and tz forbid automated access; Rathaus Umschau and muenchen.de are private use only; Abendzeitung unclear.
  - Police: Polizeipräsidium München is not on presseportal, has no feed, and its robots.txt disallows all crawling.
  - Transit: MVG's messages API is unofficial and tolerates only private use. gtfs.de's open real-time feed (CC BY-SA 4.0) carries MVG alerts; the owner chose to wait for MVG's answer rather than build on it.
  - Events: no open source (opendata.muenchen.de has only historic CSVs).
  - Isar water levels in cm: the Isar is not on PEGELONLINE, and LHP gives flood classes only. Levels exist only on HND pages (private use) or GKD downloads (CC BY 4.0, no API); they need the LfU's permission or the HND API it has announced.
  - District outlines: open WFS (dl-de/by-2.0), not wired, so no political map layer.
  - The 25 Bezirksausschuss chairs: one web page each, no dataset; too many to keep by hand.

## Requests to data owners, all sent 2026-11-01

Texts are in the project files (`cities/2026-11-01_emails-and-registrations.md`). On an answer, update this list and the city above.

- presseportal API key, for Polizei and Feuerwehr Hamburg, Polizei Köln and Feuerwehr München. Their terms ask sites that embed ots items automatically to apply. Once granted: switch those feeds to the API and show the "(ots)" tag. WAITING (presseportal, since 2026-11-01)
- Geofox GTI access, for Hamburg transit. WAITING (Hochbahn/HVV, since 2026-11-01)
- Permission or a feed for Polizeipräsidium München press releases. WAITING (PP München press office, since 2026-11-01)
- Rathaus Umschau feed, for München news. WAITING (Presse- und Informationsamt München, since 2026-11-01)
- Abendzeitung München RSS with AI classification. WAITING (Abendzeitung, since 2026-11-01)
- MVG disruption messages, for München transit. WAITING (MVG, since 2026-11-01)
- hamburg.events usage agreement, for Hamburg events. WAITING (Hamburg Tourismus, since 2026-11-01)
- Hamburger Abendblatt licence. WAITING (Funke Medien, since 2026-11-01)
