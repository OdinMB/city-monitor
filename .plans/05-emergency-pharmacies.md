# Plan: Emergency Pharmacies (Notdienstapotheken)

## Problem

Users need to find pharmacies with emergency/night opening hours. In Germany, a rotating schedule ensures at least one pharmacy per area is always open. This data changes daily and is region-specific.

## Data Sources

### Option A: apotheken.de API (Recommended)
- **URL**: `https://mein.apotheken.de/schnittstelle`
- Provides REST API with JSON/XML responses
- Current emergency pharmacy data by location
- Requires registration for API key
- Official data from ABDA (Bundesvereinigung Deutscher Apothekerverbände)

### Option B: aponet.de Scraping
- `https://www.aponet.de/apotheke/notdienstsuche`
- Based on Bundesapothekerkammer data
- No official API — would require HTML scraping (fragile)

### Option C: BLAK XML API
- `https://www.blak.de/notdienst` — Bayerische Landesapothekerkammer
- XML interface, requires registration
- May be Bavaria-only

### Option D: Nominatim/Overpass (OpenStreetMap)
- Query pharmacies tagged with opening hours
- Free, no API key
- Does NOT include emergency duty schedules — only regular opening hours
- Not suitable for Notdienst data

### Recommended Approach

apotheken.de has a RESTful API (JSON/XML) but the ABDA (Bundesvereinigung Deutscher Apothekerverbände) charges a basic fee + monthly costs for the Notdienst data. Since the requirement is a **free** data source, alternatives:

1. **aponet.de scraping**: Official Bundesapothekerkammer data, HTML-only. Parse the search results page for emergency pharmacies by location. Fragile (HTML changes break scraper), but free and comprehensive (national coverage).
2. **BLAK XML API**: Free, but likely Bavaria-only — not suitable for Berlin/Hamburg.
3. **apotheken-notdienstdaten.de**: Download service, possibly free for non-commercial use — needs investigation.

**Recommendation**: Start with aponet.de scraping. URL pattern:
```
https://www.aponet.de/apotheke/notdienstsuche?ort=Berlin&datum=2026-03-02
```
Parse the results page to extract pharmacy name, address, phone, and opening hours. If/when apotheken.de API becomes available for free or at acceptable cost, switch to it.

**Registration steps for apotheken.de (if user decides to pay later)**:
1. Go to https://mein.apotheken.de/schnittstelle
2. Register for a developer account
3. Request API key for Notdienst data
4. Contact ABDA for pricing (Grundgebühr + monatliche Kosten)
5. Set API key as `APOTHEKEN_API_KEY` env var

## Design

### Data Model

```typescript
interface EmergencyPharmacy {
  id: string;
  name: string;
  address: string;
  district?: string;
  phone?: string;
  location: { lat: number; lon: number };
  validFrom: string;   // ISO timestamp — when duty period starts
  validUntil: string;   // ISO timestamp — when duty period ends
  distance?: number;    // km from city center (for sorting)
}
```

### Ingestion

**New cron job**: `ingest-pharmacies.ts`
- **Schedule**: Every 6 hours (`0 */6 * * *`) — duty schedules change daily at ~8:00
- **Process**:
  1. Call apotheken.de API with city center coordinates + radius (~20km)
  2. Parse response to extract currently active emergency pharmacies
  3. Filter to those within city bounding box
  4. Cache as `{cityId}:pharmacies:emergency` (TTL: 21600s / 6 hours)
  5. No DB persistence needed — data is ephemeral and changes daily

### API Route

**New route**: `GET /api/:city/pharmacies`
- Returns `EmergencyPharmacy[]`
- Cache-first, empty array fallback

**Bootstrap integration**: Add to bootstrap endpoint.

### Frontend

**Map layer**: `pharmacies` in DataLayerToggles
- Green cross markers (pharmacy symbol) at each emergency pharmacy location
- Click shows popup: name, address, phone, duty hours
- Off by default — user enables via toggle

**No dedicated panel/strip** — pharmacies are map-only since the list is short (typically 5-15 per city) and location is the key information.

**Optional**: Small badge in sidebar showing count of currently open emergency pharmacies.

## Files Changed

| File | Change |
|---|---|
| `shared/types.ts` | Add EmergencyPharmacy type |
| `packages/server/src/cron/ingest-pharmacies.ts` | New — pharmacy ingestion |
| `packages/server/src/routes/pharmacies.ts` | New — API route |
| `packages/server/src/app.ts` | Register cron job + route |
| `packages/server/src/routes/news.ts` | Add to bootstrap |
| `packages/web/src/lib/api.ts` | Add type + API method |
| `packages/web/src/hooks/usePharmacies.ts` | New — React Query hook |
| `packages/web/src/components/map/CityMap.tsx` | Add pharmacy marker layer |
| `packages/web/src/stores/useCommandCenter.ts` | Add 'pharmacies' layer toggle |
| `packages/web/src/components/sidebar/DataLayerToggles.tsx` | Add pharmacy toggle |

## Implementation Order

1. Register for apotheken.de API key
2. Define EmergencyPharmacy type
3. Create ingest-pharmacies.ts
4. Create API route
5. Register in app.ts + bootstrap
6. Create frontend hook + API method
7. Add pharmacy markers to CityMap
8. Add layer toggle
9. Typecheck

## Decisions

- **Data source**: aponet.de scraping (free) for MVP. Switch to apotheken.de API later if it becomes free or worth paying for.
- **Display**: Map-only with markers. No dedicated strip — the list is short (5-15 pharmacies) and location is the key information.
- **Search area**: Use city bounding box (already defined in city config). Berlin bounding box covers ~40km across — sufficient to find all pharmacies within city limits.
