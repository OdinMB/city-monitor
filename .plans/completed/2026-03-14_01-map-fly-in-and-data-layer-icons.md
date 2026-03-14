# Plan 01: Map Fly-In Animation & Data Layer Icon Overhaul

## Goal
1. Add a cinematic fly-in animation when the map first loads (zoom from high altitude down to city)
2. Animate data layer markers fading/scaling in after the map settles
3. Reposition all data layer icons so the icon is at the geolocation and any text label sits underneath (with line-breaks for long text)

## Current State

### Map Initialization
- **File:** `packages/web/src/components/map/CityMap.tsx`
- Map initializes with `fitBounds()` using city config bounds — no animation, instant render
- No `flyTo()` usage anywhere in the codebase
- Berlin defaults: center `[13.405, 52.52]`, zoom 11, bounds `[[12.9, 52.3], [13.8, 52.7]]`

### Data Layer Icons
- **File:** `packages/web/src/lib/map-icons.ts`
- Two icon types:
  - `createMapIcon()` — 36×36 rounded square with centered Lucide icon (news, safety, pharmacy, AED, construction, bathing)
  - `createBadgeIcon()` — horizontal pill with icon left + text right (transit, water levels, AQI, noise, political)
- All icons rendered to canvas ImageData, registered with MapLibre
- Symbol layers use `icon-anchor: 'center'` by default
- Text labels are NOT separate map layers — they only appear in HTML popups on hover/click

### Spider System
- News and safety markers use pre-expanded spider groups (polar coordinate displacement)
- Spider lines connect original → expanded positions

## Implementation Plan

### Part A: Fly-In Animation

#### A1. Add fly-in on initial map load
- **File:** `packages/web/src/components/map/CityMap.tsx`
- After map `load` event fires and base layers are simplified:
  1. Set initial view to zoom 7 (Germany visible), centered on the city
  2. Call `map.flyTo({ center: cityCenter, zoom: targetZoom, duration: 1500, essential: true })`
  3. Use ease-out quad easing for a snappy feel
- Fly-in plays every page load (consistent experience) — no session/localStorage gating
- On theme change, skip fly-in (just swap style). On city change, use a shorter `flyTo` (1000ms) between cities.

#### A2. Delay data layer rendering until fly-in completes
- Listen for `moveend` event after the initial flyTo
- Set a state flag `mapReady` that gates data layer effect hooks
- Data layers only start rendering after `mapReady = true`

### Part B: Animated Data Layer Entrance

#### B1. Staggered marker appearance
- After fly-in completes and data layers render, animate markers appearing:
  - Option A: Use MapLibre's `icon-opacity` paint property, interpolating from 0 → 1 over 500ms using `requestAnimationFrame`
  - Option B: Use CSS transitions on the symbol layer's opacity (less control)
- Stagger by layer type (warnings first → news → transit → etc.) with 100-200ms delays

#### B2. Scale-in effect for markers
- Start markers at `icon-size: 0` and animate to target size (0.85 or 1.0)
- Combine with opacity for a "pop in" effect
- Use `map.setPaintProperty()` in a rAF loop

### Part C: Icon Positioning & Text Labels

#### C1. Restructure icon rendering for "icon above, text below" layout
- **File:** `packages/web/src/lib/map-icons.ts`
- Modify `createBadgeIcon()` to produce a **vertical layout**:
  - Icon at top (centered, same size as current)
  - Text label below icon, centered
  - For long text: implement word-wrap by measuring text width and splitting into lines
  - Max width ~120px for text area; text that exceeds wraps to next line
- New function: `createVerticalBadgeIcon(iconNode, bgColor, strokeColor, text, maxTextWidth?)`
  - Canvas height = icon height + padding + (lineHeight × numLines)
  - Canvas width = max(iconWidth, textWidth)

#### C2. Update symbol layer anchoring
- All symbol layers: change `icon-anchor` from `'center'` to `'top'` so the icon's top-center aligns with the coordinate
- Actually, we want the **icon** at the geolocation, so use `icon-anchor: 'bottom'` on the icon portion — but since it's a single image, the anchor should be at the icon's center within the composite image
- Better approach: keep `icon-anchor: 'center'` but offset the icon within the canvas so the icon portion is at the vertical center of the anchor point, with text extending below

#### C3. Apply to all badge-style layers
Update these layer files to use the new vertical badge:
- `packages/web/src/components/map/layers/transit.ts` — transit badges
- `packages/web/src/components/map/layers/water.ts` — water level badges
- `packages/web/src/components/map/layers/air-quality.ts` — AQI badges
- `packages/web/src/components/map/layers/noise-sensors.ts` — noise badges
- `packages/web/src/components/map/layers/political.ts` — political badges (bezirke mode)

#### C4. Handle long text with line breaks
- In the canvas text rendering, measure text width with `ctx.measureText()`
- If text exceeds `maxTextWidth` (default 100px), split at word boundaries
- Render each line with consistent line-height (e.g., 14px)
- Cap at 3 lines max, truncate with ellipsis if needed

### Part D: Non-badge icons (news, safety, etc.)
- These use `createMapIcon()` which has no text — leave as-is (icon only at geolocation)
- The category/title information remains in the popup on hover

## Files to Modify
| File | Changes |
|------|---------|
| `packages/web/src/components/map/CityMap.tsx` | Fly-in animation, mapReady gating |
| `packages/web/src/lib/map-icons.ts` | New `createVerticalBadgeIcon()`, text wrapping |
| `packages/web/src/components/map/layers/transit.ts` | Use vertical badges |
| `packages/web/src/components/map/layers/water.ts` | Use vertical badges |
| `packages/web/src/components/map/layers/air-quality.ts` | Use vertical badges |
| `packages/web/src/components/map/layers/noise-sensors.ts` | Use vertical badges |
| `packages/web/src/components/map/layers/political.ts` | Use vertical badges |

## Decisions

- **Fly-in duration:** 1.5 seconds, ease-out quad (snappy)
- **Starting zoom:** Zoom 7 (Germany visible, moderate drama)
- **Badge text wrapping:** Max 100px width, word-wrap at word boundaries, max 3 lines with ellipsis
- **Fly-in frequency:** Every page load (consistent experience)
- **Animation library:** framer-motion (shared across all plans)

## Testing
- Visual: Verify fly-in plays smoothly on Chrome, Firefox, Safari
- Visual: Verify data layers appear after fly-in with staggered animation
- Visual: Verify vertical badges render correctly with 1-line, 2-line, and 3-line text
- Functional: Verify popups still work correctly on new badge icons
- Functional: Verify spider system still works for news/safety layers
- Performance: Ensure fly-in doesn't cause jank on mobile devices
