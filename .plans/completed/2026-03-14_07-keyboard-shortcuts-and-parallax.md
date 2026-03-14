# Plan 07: Keyboard Shortcuts with Hints & Parallax Scroll

## Goal
1. Add global keyboard shortcuts for common actions (theme toggle, layer toggles, etc.)
2. Show keyboard shortcut hints to users on first visit
3. Add parallax scrolling between the map section and dashboard tiles

## Current State

### Keyboard Handling
- **useTabKeys.ts:** Arrow/Home/End for tab navigation (EventsStrip, CouncilMeetingsStrip)
- **HeaderControls:** Escape closes mobile menu
- **MobileLayerDrawer:** Escape closes drawer
- **No global shortcuts** — no Cmd+K, no hotkeys, no global keydown listener

### Scroll Behavior
- Map section and dashboard tiles are in a normal document flow
- No scroll listeners, no parallax, no scroll-linked animations
- Map height: `h-[50vh] lg:h-[calc(100vh-37px)]` (static)

## Implementation Plan

### Part A: Global Keyboard Shortcuts

#### A1. Create keyboard shortcut hook
- **New file:** `packages/web/src/hooks/useKeyboardShortcuts.ts`
- Single global `keydown` listener on `document`
- Guard: ignore when focus is in input/textarea/contenteditable
- Shortcut map:

| Key | Action | Description |
|-----|--------|-------------|
| `D` | Toggle dark mode | Calls `useTheme.toggle()` |
| `1`-`9` | Toggle data layers | Maps to first 9 layers in sidebar order |
| `0` | Toggle all layers off | Clears all active layers |
| `?` | Show shortcut hints | Opens hint overlay |
| `Escape` | Close hint overlay | If hints are open |
| `/` | Focus search (future) | Reserved for future command palette |

#### A2. Wire up in App or Shell component
- **File:** `packages/web/src/components/layout/Shell.tsx`
- Call `useKeyboardShortcuts()` at shell level
- Access `useTheme` and `useCommandCenter` stores for actions

#### A3. Shortcut hint overlay
- **New file:** `packages/web/src/components/layout/KeyboardHints.tsx`
- Triggered by `?` key or a small `⌨` button in the footer/topbar
- Modal/overlay showing all available shortcuts in a clean grid
- Styled like VS Code's shortcut overlay (semi-transparent, centered)
- Close on Escape or click outside

#### A4. First-visit hint toast
- On first visit (localStorage flag `hasSeenKeyboardHints`), show a brief toast:
  - "Press ? for keyboard shortcuts" — appears for 5 seconds, bottom-right
  - Dismisses on click or timeout
  - Only shown once

### Part B: Parallax Scroll

#### B1. Parallax between map and tiles
- As user scrolls down past the map section, the map moves at 50% scroll speed
- Creates a subtle depth illusion
- Implementation: CSS `transform: translateY(calc(var(--scroll-y) * 0.5))` on the map container
- Set `--scroll-y` via a lightweight scroll listener (using `requestAnimationFrame` for performance)

#### B2. Scroll listener hook
- **New file:** `packages/web/src/hooks/useScrollParallax.ts`
- Throttled via `requestAnimationFrame` (no external library)
- Sets CSS custom property on the element or uses a ref + inline style
- Only active on desktop (disable on mobile for performance)
- Respects `prefers-reduced-motion`

#### B3. Apply parallax to map section
- **File:** `packages/web/src/components/layout/CommandLayout.tsx`
- Map container gets `overflow: hidden` (to clip translated map)
- Map inner element gets the parallax transform
- Dashboard section remains in normal flow

#### B4. Optional: Tile parallax layers
- Different tiles could have slightly different parallax rates (creates layered depth)
- More subtle: tiles at the top of the grid move 2-3px faster than tiles at the bottom
- This is a "nice to have" — can be skipped if it feels too busy

## Files to Create
| File | Purpose |
|------|---------|
| `packages/web/src/hooks/useKeyboardShortcuts.ts` | Global shortcut listener |
| `packages/web/src/hooks/useScrollParallax.ts` | Parallax scroll hook |
| `packages/web/src/components/layout/KeyboardHints.tsx` | Shortcut hint overlay |

## Files to Modify
| File | Changes |
|------|---------|
| `packages/web/src/components/layout/Shell.tsx` | Wire up keyboard shortcuts hook |
| `packages/web/src/components/layout/CommandLayout.tsx` | Parallax on map section |
| `packages/web/src/globals.css` | Toast animation, hint overlay styling |
| `packages/web/src/i18n/en.json` (+ de, tr, ar) | Shortcut descriptions, hint text |

## Decisions

- **Keyboard shortcuts:** Number keys 1-9 for data layer toggles (mapped to sidebar order), D for dark mode toggle, ? for hint overlay, 0 to clear all layers. No modifier keys needed.
- **Parallax intensity:** 0.3x (subtle, barely noticeable). Desktop only, disabled on mobile and for `prefers-reduced-motion`.
- **Shortcut hints:** Small toast notification ("Press ? for shortcuts") in bottom-right, auto-dismisses after 5 seconds. Only shown on first visit (localStorage flag `hasSeenKeyboardHints`).

## Testing
- Functional: All keyboard shortcuts trigger correct actions
- Functional: Shortcuts don't fire when typing in input fields
- Functional: Hint overlay opens/closes correctly
- Visual: Parallax creates smooth depth effect on scroll
- Performance: Scroll listener doesn't cause jank (rAF throttled)
- Accessibility: Reduced-motion disables parallax
- Accessibility: Hint overlay is keyboard-navigable and screen-reader friendly
- Mobile: Keyboard shortcuts gracefully ignored (no keyboard), parallax disabled
