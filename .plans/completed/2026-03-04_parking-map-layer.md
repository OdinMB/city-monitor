# Parking Availability — Map Layer Research

## Goal

Assess feasibility of adding a parking availability map layer for Berlin.

## Research Findings

### Real-Time Data: NOT Available for Berlin

Berlin has **no Parkleitsystem** (parking guidance system) — the fundamental prerequisite for real-time occupancy data. This is unusual for a major German city.

- **ParkenDD / ParkAPI v3** — open-source parking aggregator with 60+ German cities. Berlin is NOT supported (no system to scrape).
- **MDM / Mobilithek** — national mobility data marketplace. No Berlin parking operator publishes here.
- **LiveParking.eu** — free JSON API. Berlin NOT available despite being listed in docs. Hamburg IS available (19,010 spaces), but license is "all rights reserved" and timestamps appear stale.
- **APCOA, Contipark, Q-Park** — major Berlin garage operators. None publish open APIs.
- **Parknav** — ML-based street parking probability for Berlin, but commercial/proprietary.

**Bottom line: No viable real-time parking source for Berlin exists today.**

### Static Data: Excellent via Berlin Open Data WFS

All datasets below are **verified working**, return GeoJSON, and use **dl-de-zero-2.0** license (completely open, no attribution required).

| Dataset | WFS Endpoint | Features | Geometry | Key Fields |
|---|---|---|---|---|
| **Street Parking Inventory** | `gdi.berlin.de/services/wfs/parkplaetze` | 45,917 | MultiPolygon | space count, orientation, fee, zone, hours, EV charging, carsharing, disabled-only |
| **Managed Parking Zones** | `gdi.berlin.de/services/wfs/parkraumbewirtschaftung` | 100 | MultiPolygon | zone number, district, hours, fee/hr, notes |
| **Park & Ride** | `gdi.berlin.de/services/wfs/park_and_ride` | 48 | Point | station, spaces, surveyed occupancy, transit lines, fare zone |
| **Disabled Parking** | `gdi.berlin.de/services/wfs/behindertenparkplaetze` | 912 | Point | address, district, space count |

### WMS Alternative

Berlin GDI likely exposes a WMS for these datasets too (following the pattern of other Berlin geodata like the rent map). A WMS overlay would avoid transferring 45K polygons to the client.

## Assessment

### What we could build

**Option A — WMS Parking Zones Overlay (like rent map)**
- Render the Parkraumbewirtschaftung zones as a raster overlay
- Shows where paid parking applies, with zone boundaries
- Pros: trivial to implement (copy rent map pattern), zero server work, no data to ingest
- Cons: no interactivity (no click for details), limited visual appeal, purely informational

**Option B — GeoJSON Parking Zones + P+R Markers**
- Fetch 100 parking zones as vector GeoJSON (small enough) + 48 P+R points
- Zone polygons with fill color indicating fee level, click popup with hours/fees
- P+R point markers showing station, spaces, transit lines
- Pros: interactive, rich popups, visually distinct
- Cons: more implementation work, Berlin-only, requires cron ingestion and caching

**Option C — Skip for now**
- Without real-time occupancy, the value proposition is weak
- Static parking zone boundaries are useful but not particularly exciting for a real-time dashboard
- The data doesn't change (zones update rarely), so there's no dynamic element

### Comparison to other potential data sources

From the research list in `new-data-sources.md`, higher-impact options that offer **real-time or frequently-updating** data include:
- Bike-sharing (nextbike/Lime GBFS — standardized real-time feeds)
- EV charging stations (Bundesnetzagentur register — large static dataset, but growing)
- Noise map (Berlin strategic noise map WMS — visual but static)
- Pollen forecast (DWD — updates daily, seasonal interest)

## Recommendation

**Option C — Skip parking for now.** The lack of real-time data makes this a purely static/contextual layer. While the WFS data quality is excellent, a static parking zone overlay doesn't add much value to a real-time city dashboard. The P+R facilities (48 points) are mildly interesting but too niche.

If we want a new map layer, **bike-sharing (GBFS)** or **EV charging stations** would deliver more dynamic, frequently-updating data that fits the dashboard's real-time character better.

**Revisit when:** Berlin eventually deploys a Parkleitsystem or a parking operator starts publishing open occupancy data. The eUVM project may lead to this, but no timeline exists.
