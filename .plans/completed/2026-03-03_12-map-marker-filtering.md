# Smarter Map Marker Filtering

Instead of showing all data points and relying on clustering/spiderfying to manage density, reduce what's shown on the map to only the most useful markers.

## Philosophy

The map should be informative at a glance, not a data dump. Users shouldn't need to click through clusters or spider expansions to find what matters. The current "+14" overflow and spiderfying system works for close-up views — the problem is at city-wide zoom where too many markers compete for attention.

## Changes

### 1. News: Show only top-N by importance — CityMap layer logic

Currently all geolocated news items are shown on the map. At city-wide zoom, this can be 10-20+ overlapping dots.

**Fix:** Filter news markers by importance score (already available from LLM classification). At city-wide zoom (< zoom 12), show only the top 5 most important. At neighborhood zoom (12-14), show top 10. At street zoom (14+), show all.

Implementation: Use MapLibre's `filter` expression with a `zoom`-dependent threshold, or filter the GeoJSON data before setting the source.

### 2. Safety: Show only recent reports

Safety reports accumulate over 7 days (retention). At city-wide zoom, show only the last 24 hours. At close zoom, show the full 7-day window.

### 3. Pharmacies: Show only nearest N

Emergency pharmacies are spread across the city. At city-wide zoom, showing all of them is noisy. Show only the nearest 5 to the map center, or the ones within the current viewport bounds.

### 4. AEDs: Viewport-only loading

AEDs are the densest layer (hundreds of points). Only render AED markers within the current viewport bounds + a small buffer. Use MapLibre's built-in viewport culling (GeoJSON sources already do this) but also consider limiting the total count sent to the map source.

### 5. Traffic: Already zoom-filtered

Traffic incidents already have zoom-based road visibility. Verify this is working correctly and no changes needed.

## Open Questions

- What zoom thresholds feel right? This needs visual testing. Start with the values above and adjust.
- Should filtered-out markers still be accessible somehow (e.g., "Show all news on map" toggle)?

## Scope

- 1 major file modified (CityMap.tsx layer logic)
- Possibly filter logic in the data hooks or a new utility
- No new dependencies
