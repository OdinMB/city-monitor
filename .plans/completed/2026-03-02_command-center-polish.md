# Plan: Command Center UI Polish

## Changes

### 1. TopBar — slim & clean

**File: `packages/web/src/components/layout/TopBar.tsx`**

- Remove the `{t('app.title')}` ("City Monitor") span entirely
- Reduce header padding from `py-3` to `py-2`
- Theme toggle button: change from `px-3 py-1 text-sm` to `px-2 py-1 text-xs` to match language button sizing exactly; wrap in the same `rounded border overflow-hidden` container as language buttons (or unify into one button group)

**File: `packages/web/src/components/layout/CommandLayout.tsx`**

- Update `lg:h-[calc(100vh-57px)]` to match new slimmer TopBar height (~45px → `lg:h-[calc(100vh-45px)]`)

### 2. Remove SafetyStrip

Safety is already covered by the "Kriminalität" news category filter.

**File: `packages/web/src/components/layout/CommandLayout.tsx`**
- Remove `SafetyStrip` import and usage

**File: `packages/web/src/components/sidebar/DataLayerToggles.tsx`**
- Remove `'safety'` from LAYERS array

**File: `packages/web/src/hooks/useCommandCenter.ts`**
- Remove `'safety'` from `DataLayer` type and `DEFAULT_LAYERS`

**i18n files** — remove `sidebar.layers.safety` keys

### 3. EventsStrip — compact + time filters

**File: `packages/web/src/components/strips/EventsStrip.tsx`**

- Add time filter tabs: "Today" / "Tomorrow" / "This Week" (default: "Today")
- Filter events client-side by comparing event `date` to current date
- Reduce spacing: smaller cards, denser grid (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`)
- Smaller padding on cards (`p-2` instead of `p-2.5`)

**i18n files** — add `panel.events.today`, `panel.events.tomorrow`, `panel.events.thisWeek` keys

### 4. TransitStrip — multi-column

**File: `packages/web/src/components/strips/TransitStrip.tsx`**

- Change from `space-y-2` (single column) to a responsive grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2`
- Each alert card stays the same internally but now flows into columns

### 5. Briefing — fix server prompt

**File: `packages/server/src/lib/openai.ts`**

The current prompt says "Summarize the following headlines into a 2-3 sentence briefing for residents." But the RSS feeds include national German news. The fix: strengthen the prompt to explicitly ignore non-local news.

Change the system prompt to:
> You are a local news editor for {cityName}. From the headlines below, pick ONLY those directly relevant to {cityName} or its immediate region. Ignore national or international news unless it directly impacts {cityName} residents. Summarize into 2-3 sentences focused on what affects daily life — transit, weather, local politics, safety, cultural events. Be factual and concise. Write in {language}. If no headlines are relevant to {cityName}, respond with a single dash: -

### 6. Map — minimal style

**File: `packages/web/src/components/map/CityMap.tsx`**

Switch to CARTO's no-labels styles for a clean backdrop:
- Light: `https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json`
- Dark: `https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json`

After map loads, hide POI and fine-detail layers to show only roads, water, parks, and building outlines.

Additionally, overlay Bezirk boundary polygons:
- Berlin: 12 Bezirke
- Hamburg: 7 Bezirke
- Embed static GeoJSON files in `packages/web/src/data/districts/`
- Add as a GeoJSON source + fill/line layers after map loads
- Style: semi-transparent fill with accent-colored borders

## Files Changed

| File | Type |
|---|---|
| `packages/web/src/components/layout/TopBar.tsx` | Modify |
| `packages/web/src/components/layout/CommandLayout.tsx` | Modify |
| `packages/web/src/components/sidebar/DataLayerToggles.tsx` | Modify |
| `packages/web/src/hooks/useCommandCenter.ts` | Modify |
| `packages/web/src/components/strips/EventsStrip.tsx` | Modify |
| `packages/web/src/components/strips/TransitStrip.tsx` | Modify |
| `packages/web/src/components/map/CityMap.tsx` | Modify |
| `packages/server/src/lib/openai.ts` | Modify |
| `packages/web/src/i18n/en.json` | Modify |
| `packages/web/src/i18n/de.json` | Modify |
| `packages/web/src/i18n/tr.json` | Modify |
| `packages/web/src/i18n/ar.json` | Modify |

## Implementation Order

1. TopBar + CommandLayout height fix
2. Remove SafetyStrip + update store/sidebar/i18n
3. EventsStrip compact layout + time filters + i18n
4. TransitStrip grid layout
5. Server prompt fix
6. Map minimal style
7. Run typecheck + tests
