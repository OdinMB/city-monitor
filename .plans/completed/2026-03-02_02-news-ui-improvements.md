# Plan: News Section UI Improvements

## Problem

The current news UI (NewsBriefingPanel + NewsStrip) is functional but could be improved:
- All items look the same — no visual hierarchy based on importance
- No distinction between breaking/urgent news and routine updates
- Category tabs are text-only, not visually engaging
- No source logos or favicons
- No way to see which items have map locations
- The AI briefing section is disconnected from the individual items

## Goals

1. Improve visual hierarchy — tier-1 items should stand out
2. Better category navigation
3. Show location indicators on geolocated items
4. Improve overall information density and readability

## Design

### Option A: Card-Based Layout (Recommended)

Transform the flat list into a structured layout:

**Top section — AI Briefing**:
- Keep the blue callout box
- Add "Last updated" relative timestamp
- Add a subtle pulsing dot when briefing is fresh (< 15 min)

**Breaking/Featured section** (tier 1 items):
- Larger cards with title + first line of description
- Source name + favicon
- Category badge (colored)
- Location pin icon if geolocated
- Relative time
- Max 3 items

**Category filter bar**:
- Horizontal scrollable pills (instead of tab row)
- Each pill shows category emoji + name + count badge
- "All" pill selected by default

**Standard items** (tier 2-3):
- Compact list rows
- Title (1-2 lines)
- Source name + category badge + time
- Location pin icon if geolocated
- Subtle separator between items

### Option B: Timeline Layout

Chronological timeline with category color coding on the left edge. Each item gets a small colored dot on the timeline. Featured items get larger cards. Simpler but less structured.

### Option C: Minimal Enhancement

Keep current list layout but add:
- Tier-1 highlight (left border + slightly larger font)
- Source favicon
- Location pin icon
- Better spacing

## Shared Improvements (All Options)

- **Source favicons**: Use `https://www.google.com/s2/favicons?domain={hostname}&sz=16` for quick favicons
- **Location indicator**: Small map-pin icon (📍 or SVG) on items with `location` data; clicking it could center the map on that location
- **Read more link**: Each item title is a link to the source article (already exists)
- **Empty state**: Better empty state per category ("No {category} news right now")
- **Error state**: Retry button with explanation text
- **Loading skeleton**: Shimmer placeholders matching the card layout

## Files Changed

| File | Change |
|---|---|
| `packages/web/src/components/panels/NewsBriefingPanel.tsx` | Major UI overhaul |
| `packages/web/src/components/strips/NewsStrip.tsx` | Update to match new design patterns |
| `packages/web/src/components/strips/BriefingStrip.tsx` | Minor updates for consistency |

## Implementation Order

1. Implement chosen layout option in NewsBriefingPanel.tsx
2. Update NewsStrip.tsx to use consistent sub-components
3. Add source favicons
4. Add location pin indicators
5. Improve loading/error/empty states
6. Typecheck

## Decisions

- **Layout option**: Card-based (Option A) — featured section for tier-1, compact list for tier-2/3.
- **Map interaction**: Clicking a location pin on a news item centers the map on that location.
- **Description text**: Show description snippets for tier-1 items only — keeps the list compact.
