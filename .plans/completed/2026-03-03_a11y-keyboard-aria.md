# Plan 01 — Keyboard & ARIA for Interactive Elements

## Problem

Several interactive elements are `<div onClick>` without keyboard support or ARIA attributes. This makes expandable tiles, event cards, and the mobile drawer inaccessible to keyboard-only users and screen readers.

**WCAG violations:** 2.1.1 Keyboard (A), 4.1.2 Name/Role/Value (A), 2.4.3 Focus Order (AA)

## Scope

| Component | File | Issue |
|---|---|---|
| Tile header | `Tile.tsx:41-43` | `<div onClick>` — no role, tabIndex, keyboard, aria-expanded |
| EventCard | `EventsStrip.tsx:64-66` | `<div onClick>` — no role, tabIndex, keyboard |
| Backdrop | `MobileLayerDrawer.tsx:61-65` | `<div onClick>` — no Escape key support |
| Hamburger menu | `TopBar.tsx:163-207` | No focus trap, no Escape, no focus return |

## Approach

### Decision: Convert to `<button>`
Replace interactive `<div>` elements with semantic `<button>` elements. This automatically provides keyboard support (Enter/Space), focus, and correct role. Reset button styles with Tailwind's `appearance-none`.

## Changes

### 1. `packages/web/src/components/layout/Tile.tsx`
- Replace the header `<div>` (line 41) with a `<button>` when `expandable` is true
- Add `aria-expanded={expanded}` attribute
- Add `aria-hidden="true"` to the chevron SVG
- Keep non-expandable tiles as `<div>` (they're not interactive)

### 2. `packages/web/src/components/strips/EventsStrip.tsx`
- Replace the EventCard outer `<div>` (line 64) with a `<button>` when `hasDetail` is true
- Add `aria-expanded={expanded}` attribute
- Remove the `▲`/`▼` text indicators or mark them `aria-hidden` (redundant with `aria-expanded`)

### 3. `packages/web/src/components/sidebar/MobileLayerDrawer.tsx`
- Add `role="dialog"` and `aria-label` to the drawer container
- Add `onKeyDown` handler for Escape key to close the drawer
- Add `aria-hidden="true"` to the backdrop div (it's decorative)

### 4. `packages/web/src/components/layout/TopBar.tsx`
- Add `onKeyDown` for Escape to close the hamburger menu
- Return focus to the menu button when menu closes
- Add `role="menu"` to the dropdown container

## Testing
- Tab through entire UI without mouse — verify all expandable tiles, event cards, layer toggles are reachable
- Verify Enter/Space expands/collapses tiles and event cards
- Verify Escape closes mobile drawer and hamburger menu
