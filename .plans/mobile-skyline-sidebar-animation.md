# Mobile Skyline Visibility & Sidebar Icon Animation

- **Date**: 2026-03-15
- **Status**: done
- **Type**: bugfix

## Problem
On mobile, the skyline SVG and scroll indicator sit below the 100vh map hero section, so they're not visible above the fold. The skyline only flashes briefly when the user clicks the chevron to scroll down. Additionally, the mobile sidebar (layer drawer) tab handle is too subtle and easy to miss.

## Approach
1. Move the skyline separator and scroll indicator inside the hero `div` so they overlap the bottom of the map, visible within the viewport on load.
2. Add a subtle pulse animation to the mobile layer drawer tab handle that stops after the user's first click (tracked via localStorage).

## Changes

| File | Change |
|------|--------|
| `packages/web/src/components/layout/CommandLayout.tsx` | Move `ScrollIndicator` + `SkylineSeparator` from below the hero div into the hero div (absolutely positioned at bottom). Remove the wrapper `<div className="relative">`. |
| `packages/web/src/components/layout/SkylineSeparator.tsx` | Change from `-mt-16` pull-up to absolute positioning at the bottom of the hero. Adjust z-index so it sits above the map but below the scroll indicator. |
| `packages/web/src/components/layout/ScrollIndicator.tsx` | Adjust positioning: place above the skyline within the hero section (absolute bottom positioning instead of negative translate). |
| `packages/web/src/components/sidebar/MobileLayerDrawer.tsx` | Add pulse animation class to the tab handle. Track first click in localStorage (`layers-drawer-opened`). After first click, remove the animation permanently. |
| `packages/web/src/globals.css` | Add `@keyframes drawer-pulse` animation (subtle scale + glow effect). |

## Tests
- Existing `SkylineSeparator.test.tsx` and `ScrollIndicator.test.tsx` should still pass (structural changes don't affect rendered output logic).
- No new tests needed — this is CSS positioning and a simple localStorage flag.

## Out of Scope
- Redesigning the skyline SVG itself.
- Changing desktop layout (skyline positioning on desktop is fine).
- Adding new map features or sidebar functionality.
