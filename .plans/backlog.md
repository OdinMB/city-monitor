# Backlog

Open work only, highest priority first. Delete an item when it lands.

- **Dependency upgrades:** update body-parser, compression, proxy-addr, ip-address, express-rate-limit, zod and brace-expansion within their ranges, stop `express.json()` inflating request bodies, and patch vite, source-map-js and sharp. vitest 3 → 4 later.
- **Transit disruptions:** disruption text is truncated and can't be read in full, even with the tile expanded.
- **Privacy page:** it says nothing loads from external CDNs, but the analytics script loads from `scripts.simpleanalyticscdn.com` (`index.html`). Correct the claim.
- **Political map colours:** `normalizePoliticalName` (`packages/web/src/components/map/base.ts`) cuts names at an early dash, so Steglitz-Zehlendorf, Tempelhof-Schöneberg, Treptow-Köpenick and Marzahn-Hellersdorf likely get no party colour.
- **Political tile empties in alternate weeks:** data is cached for 7 days but refreshed every 14, and the route has no database fallback.
- **UV index:** the weather tile shows none since the switch to Bright Sky, though the DWD UV forecast (`dwdUv`) is still fetched.
