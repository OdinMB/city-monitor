# Plan 04: Richer Dark Mode

## Goal
Replace the current pure-gray dark mode palette with richer, tinted dark colors (inspired by Linear, Vercel, Raycast) for a more premium feel.

## Current State
- **Theme:** Zustand store (`useTheme.ts`), toggles `.dark` class on `<html>`
- **Dark palette:** Standard Tailwind grays throughout:
  - Page bg: `dark:bg-gray-950`
  - Card bg: `dark:bg-gray-900`
  - Borders: `dark:border-gray-800`
  - Text: `dark:text-gray-100`, `dark:text-gray-400`, `dark:text-gray-500`
- **Accent colors (dark):** Berlin `#ff4d5e`, Hamburg `#5b9bd5`
- **globals.css:** Dark mode popup styling uses `#1f2937` (gray-800)
- **No custom color scale** — all standard Tailwind gray-*

## Implementation Plan

### Approach: CSS Custom Properties for Dark Palette
Instead of changing every `dark:bg-gray-*` class, define custom properties that remap in dark mode. This is cleaner and easier to maintain.

### A1. Define tinted dark color scale in globals.css
- **File:** `packages/web/src/globals.css`
- Add CSS custom properties for surface colors:
  ```css
  :root {
    --surface-0: #ffffff;      /* page background */
    --surface-1: #ffffff;      /* card background */
    --surface-2: #f9fafb;      /* elevated surface */
    --border: #e5e7eb;         /* borders */
    --border-subtle: #f3f4f6;  /* subtle borders */
  }
  .dark {
    --surface-0: #0c0f14;      /* deep blue-black (not pure gray-950) */
    --surface-1: #141820;      /* slightly lifted blue-gray */
    --surface-2: #1a1f2a;      /* elevated surface */
    --border: #232a36;         /* blue-tinted border */
    --border-subtle: #1c2230;  /* subtle border */
  }
  ```
- The blue tint comes from mixing the base gray with a small amount of blue (hue ~220°)
- Keeps the same lightness relationships as current gray scale

### A2. Add subtle gradient backgrounds
- Page background: subtle radial gradient from center-top, blending `--surface-0` with a very faint accent glow
  ```css
  .dark body {
    background: radial-gradient(ellipse 80% 50% at 50% 0%, rgba(var(--accent-rgb), 0.03), var(--surface-0));
  }
  ```
- This creates a barely-visible warm glow at the top of the page in the city's accent color

### A3. Migrate components to use CSS custom properties
- Replace hardcoded `dark:bg-gray-900` with `bg-[var(--surface-1)]` (or create Tailwind utility)
- Replace `dark:bg-gray-950` with `bg-[var(--surface-0)]`
- Replace `dark:border-gray-800` with `border-[var(--border)]`
- This can be done incrementally — start with Shell, Tile, TopBar, Sidebar

### A4. Enhanced card styling in dark mode
- Cards get a subtle 1px inner glow: `box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.03)`
- This mimics the "glass edge" effect seen in Linear/Raycast
- Add via a utility class `.card-glow` applied to Tile component

### A5. Update MapLibre popup dark styling
- **File:** `packages/web/src/globals.css`
- Update `.dark .maplibregl-popup-content` to use new `--surface-1` color
- Add subtle border glow

### A6. Per-city dark mood
- Berlin dark: very slight warm (red) undertone in the tint
- Hamburg dark: very slight cool (blue) undertone
- Achieved by adjusting the CSS variables under `[data-city='berlin'].dark` etc.

## Files to Modify
| File | Changes |
|------|---------|
| `packages/web/src/globals.css` | New CSS custom properties, gradient bg, card glow, popup updates |
| `packages/web/src/components/layout/Tile.tsx` | Use surface vars, add card-glow class |
| `packages/web/src/components/layout/Shell.tsx` | Use surface-0 for page bg |
| `packages/web/src/components/layout/TopBar.tsx` | Use surface vars |
| `packages/web/src/components/sidebar/Sidebar.tsx` | Use surface vars |
| `packages/web/src/components/layout/CommandLayout.tsx` | Use surface vars for dashboard bg |

## Decisions

- **Dark mode base hue:** City-specific tint. Berlin gets warm-tinted dark surfaces (reddish undertone from accent #e2001a). Hamburg gets cool-tinted (blue undertone from accent #004b93). Achieved via per-city CSS variable overrides.
- **Migration approach:** Full migration to CSS custom properties. Replace all `dark:bg-gray-*` classes with surface variables. More files to touch but cleaner and more maintainable long-term.
- **Accent gradient:** Yes — very faint radial gradient of the city's accent color at the top of the page background. Adds warmth and brand identity in dark mode.

## Testing
- Visual: Dark mode has noticeable blue-tint vs current pure gray
- Visual: Cards have subtle inner glow / premium feel
- Visual: Berlin vs Hamburg have slightly different dark moods (if option C chosen)
- Contrast: All text still meets WCAG AA contrast ratios against new surfaces
- Consistency: Popups, sidebar, topbar, tiles all use the same surface scale
- Theme toggle: Smooth 150ms transition still works between light ↔ dark
