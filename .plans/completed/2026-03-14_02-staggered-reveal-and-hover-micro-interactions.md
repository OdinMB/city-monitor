# Plan 02: Staggered Tile Reveal & Hover Micro-Interactions

## Goal
1. Dashboard tiles fade/slide in with staggered delays as they enter the viewport
2. Tiles respond to hover with subtle scale and shadow changes

## Current State
- **DashboardGrid:** `packages/web/src/components/layout/DashboardGrid.tsx` — simple CSS grid, no animations
- **Tile:** `packages/web/src/components/layout/Tile.tsx` — static rendering, no entrance or hover effects
- **Animations:** Only `animate-pulse` on skeletons and `transition-transform` on chevrons
- **No animation library** in the project (no framer-motion, GSAP, etc.)

## Implementation Plan

### Part A: Staggered Tile Entrance Animation

#### A1. Intersection Observer approach (no library needed)
- Create a custom hook: `useRevealOnScroll()` or inline in Tile component
- Uses `IntersectionObserver` with `threshold: 0.1` (trigger when 10% visible)
- Each tile starts with `opacity: 0; transform: translateY(20px)`
- On intersection: add class that transitions to `opacity: 1; transform: translateY(0)`
- Transition: `600ms ease-out` for opacity + transform

#### A2. Stagger via CSS custom property
- DashboardGrid passes an index to each Tile child (via React.Children.map or a wrapper)
- Each Tile sets `style={{ '--reveal-delay': `${index * 80}ms` }}`
- CSS transition-delay reads from `var(--reveal-delay)`
- This creates a cascading wave effect (tile 0 at 0ms, tile 1 at 80ms, tile 2 at 160ms, etc.)
- Cap max delay at ~800ms so late tiles don't feel too slow (e.g., `Math.min(index * 80, 800)`)

#### A3. Respect reduced-motion preference
- Wrap in `@media (prefers-reduced-motion: no-preference)`
- Users with reduced motion get instant appearance (no animation)

#### A4. Only animate on first render
- Use a ref to track if the tile has already been revealed
- Once revealed, stay visible (don't re-animate on scroll up/down)

### Part B: Hover Micro-Interactions

#### B1. Scale + shadow on hover
- Add to Tile component's outer div:
  ```
  hover:scale-[1.01] hover:shadow-md
  transition-all duration-200 ease-out
  ```
- Subtle 1% scale increase + shadow elevation
- `transition-all` covers transform + shadow in one declaration

#### B2. Ensure no layout shift
- Use `transform: scale()` which doesn't affect layout flow
- `will-change: transform` on hover target for GPU acceleration
- Test that hover on span-2 and full-width tiles doesn't push neighbors

#### B3. Header accent on hover (optional enhancement)
- On tile hover, the title text could shift to `var(--accent)` color
- Adds a "focused" feel without being distracting

## Files to Modify
| File | Changes |
|------|---------|
| `packages/web/src/components/layout/Tile.tsx` | Add reveal animation classes, hover classes, IntersectionObserver |
| `packages/web/src/components/layout/DashboardGrid.tsx` | Pass stagger index to children |
| `packages/web/src/globals.css` | Add reveal keyframes, reduced-motion media query |

## Decisions

- **Animation library:** framer-motion (~30KB gzipped). Used across plans 02, 03, 05, 07 for consistent spring physics and layout animations.
- **Reveal direction:** Slide up + fade (translateY 20px → 0, opacity 0 → 1). Most natural for scrolling content.
- **Hover scale:** 1.01 (barely perceptible, elegant). Combined with shadow-md elevation.

## Testing
- Visual: Tiles animate in sequentially on page load / scroll
- Visual: Hover produces smooth scale + shadow change
- Accessibility: `prefers-reduced-motion: reduce` disables all animations
- Performance: No jank on mobile with 19 tiles animating
- Layout: No shift or overflow on hover for span-2/full tiles
