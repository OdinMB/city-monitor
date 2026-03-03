# Test Coverage Expansion

The server has ~46% test coverage by file count. The web frontend has ~9.5%. This plan targets meaningful coverage increases focused on the highest-risk, highest-value areas.

## Current State

**Server (good):** 51 test files / 111 source files. Cron jobs, routes, and lib utilities well-tested.

**Web (poor):** 8 test files / 84 source files. Only tested: App, TopBar, CityPicker, useBootstrap, useNewsDigest, useNewsSummary, format-time, weather-codes.

**Not tested at all:**
- All Strip components (13+)
- Most data hooks (useAeds, useAirQuality, useBathing, useConstruction, useEvents, useLaborMarket, useNina, usePharmacies, usePolitical, useSocialAtlas, useTraffic, useWastewater, useWaterLevels)
- Sidebar, layout components
- Map components
- API layer
- Routing

## Plan

### Phase 1: Hook tests (highest ROI)

Test all data-fetching hooks. These are the integration points between API and UI — if they break, entire tiles break. Pattern:
- Mock the API response (MSW or manual fetch mock)
- Verify the hook returns the correct shape
- Verify error/loading states
- Verify polling interval is set correctly

Hooks to test:
1. `useAirQuality`
2. `useEvents`
3. `useTransit`
4. `useSafety`
5. `useWaterLevels`
6. `useBathing`
7. `useWastewater`
8. `useLaborMarket`
9. `usePharmacies`
10. `useTraffic`
11. `useConstruction`
12. `useNina`
13. `usePolitical`
14. `useSocialAtlas`
15. `useAeds`

### Phase 2: Strip component tests (highest user-facing risk)

Test that strip components render correctly given data, handle empty states, and don't crash on malformed input. Pattern:
- Provide mock data via React Query's `QueryClient`
- Render the component
- Assert key UI elements are present
- Assert empty state renders when data is null/empty

Priority strips:
1. `WeatherStrip` (most visible)
2. `NewsStrip` (most complex — tabs, categories, expansion)
3. `TransitStrip` (severity coloring, line grouping)
4. `AirQualityStrip` (gauge, pollutant cards)
5. `SafetyStrip` (district display)
6. `EventsStrip` (date grouping, expansion)

### Phase 3: Coverage reporting & CI gate

1. Add `@vitest/coverage-v8` to both packages
2. Configure coverage thresholds in `vitest.config.ts`:
   - Server: 50% (maintain current level)
   - Web: 25% (achievable with Phase 1+2)
3. Add coverage check to CI (`vitest run --coverage`)
4. Add `npm run build` to CI (catches build failures)

### Phase 4: API layer tests

Test `packages/web/src/lib/api.ts`:
- `fetchBootstrap` returns correct structure
- Error handling (network failure, 404, 500)
- Type correctness of parsed responses

## Decisions

- **Mocking strategy:** Use `vi.mock` for fetch. Simpler, no extra dependency, sufficient for unit-testing hooks and components.
- **Coverage targets:** 25% web coverage as initial target.
- **E2E tests:** Defer to a separate plan. Keep this plan focused on unit/component coverage.

## Scope

- 20-30 new test files
- 1 new dev dependency (@vitest/coverage-v8, possibly MSW)
- CI config update
