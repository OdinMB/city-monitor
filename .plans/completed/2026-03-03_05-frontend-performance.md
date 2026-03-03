# Frontend Performance

Reduce initial bundle size, eliminate unnecessary re-renders, and prepare for splitting the mega CityMap component.

## Changes

### 1. Verify CityMap lazy loading (already done)

CityMap is already lazy-loaded via `React.lazy()` in `CommandLayout.tsx:31-33` and wrapped in a `Suspense` boundary. It's only imported in that one location. **No fix needed here** — this is already correct.

**Bundle verification:** Run `npx vite-bundle-visualizer` (or add `rollup-plugin-visualizer` to vite.config.ts) to confirm chunk boundaries and identify the actual chunk sizes.

### 2. Add manual chunks — `packages/web/vite.config.ts`

Configure `build.rollupOptions.output.manualChunks` to split:
- `maplibre-gl` into its own chunk (largest dependency, ~800KB)
- `@tanstack/react-query` into a vendor chunk
- `react` + `react-dom` into a framework chunk

This improves caching — maplibre only re-downloads when its version changes, not on every app code change.

### 3. React.memo on list-item components

Wrap all inline sub-components in strip files with `React.memo`:
- `NewsStrip.tsx` → `CompactNewsItem`
- `TransitStrip.tsx` → `AlertRow`
- `PoliticalStrip.tsx` → `RepRow`, `RepList`
- `AppointmentsStrip.tsx` → `ServiceRow`
- `BathingStrip.tsx` → `SpotRow`
- `WaterLevelStrip.tsx` → `StationRow`
- `AirQualityStrip.tsx` → `PollutantCard`, `StationEntry`

These components are rendered in lists. Without memo, every parent re-render (e.g., from polling) re-renders every list item even when data hasn't changed.

### 4. useMemo for expensive computations

Add `useMemo` to array filter/sort operations that run on every render:
- `BathingStrip.tsx:71-78` — filter + sort bathing spots
- `AirQualityStrip.tsx:122-125` — filter + sort AQ stations
- `NewsStrip.tsx:50-72` — category filtering and calculations
- `WastewaterStrip.tsx` — pathogen data transformations

### 5. Split CityMap into sub-components (optional, lower priority)

CityMap is a 34k+ token mega-component. Consider splitting into:
- `MapContainer` — initialization, refs, resize
- `useMapLayers` hook — layer visibility logic
- `useMapPopups` hook — popup rendering
- `useMapStyle` hook — theme/style switching

This is a larger refactor. It improves maintainability but doesn't directly affect runtime performance.

## Decisions

- **CityMap split:** Include in this plan. Split into MapContainer, useMapLayers, useMapPopups, useMapStyle.
- **Bundle visualizer:** Add `rollup-plugin-visualizer` as a permanent dev dependency. Auto-generates stats.html on each build.

## Testing

- Verify: city picker page doesn't load CityMap chunk (check network tab)
- Verify: strip components don't re-render when parent polls (React DevTools profiler)
- Verify: bundle sizes with visualizer before/after

## Scope

- 10-12 files modified
- No new runtime dependencies
- Optionally 1 dev dependency (visualizer)
