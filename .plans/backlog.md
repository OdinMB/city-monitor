# Backlog

Open work only, highest priority first. Delete an item when it lands.

- **Dependency vulnerabilities:** triage the open Dependabot alerts — which are reachable from the live site, which upgrades are small — into one upgrade plan.
- **Privacy page:** it says nothing loads from external CDNs, but the analytics script loads from `scripts.simpleanalyticscdn.com` (`index.html`). Correct the claim.
- **Political map colours:** `normalizePoliticalName` (`packages/web/src/components/map/base.ts`) cuts names at an early dash, so Steglitz-Zehlendorf, Tempelhof-Schöneberg, Treptow-Köpenick and Marzahn-Hellersdorf likely get no party colour.
- **Political tile empties in alternate weeks:** data is cached for 7 days but refreshed every 14, and the route has no database fallback.
- **UV index:** the weather tile shows none since the switch to Bright Sky, though the DWD UV forecast (`dwdUv`) is still fetched.
- **Map popups:** translate the remaining English strings (traffic, water, noise, emergencies, choropleths, political, "Read more").
- **Footer contrast:** grey footer text (gray-400 on white, 2.6:1) is below WCAG AA.
- **News favicons:** the favicon map in `NewsStrip.tsx` lacks the Polizei Berlin feed and still lists removed feeds.
- **Dead code:** remove the unused `SafetyStrip`, `StaleBadge` and `CityPicker` (with its test).
- **Berlin-only jobs:** wastewater, bathing, labour-market, population and fire-brigade jobs fetch Berlin data whatever `ACTIVE_CITIES` says.
- **Dev database:** freeze the handle `openLocalDatabase` returns, so code can't swap its connection after the guard ran.
- **Air-quality credit:** credit Copernicus (CAMS) for the Open-Meteo air-quality data on the Sources page.
