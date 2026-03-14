# Plan 06: Skeleton Shimmer Effect

## Goal
Replace the current `animate-pulse` skeleton loading effect with a more polished shimmer/wave effect (gradient sweeping left-to-right), which feels faster and more modern.

## Current State
- **File:** `packages/web/src/components/layout/Skeleton.tsx`
- Uses Tailwind's `animate-pulse` — a 2s infinite opacity pulse on a gray div
- Lines: configurable count (default 3), last line is 60% width
- Colors: `bg-gray-200 dark:bg-gray-700`
- Used across all strip components as loading fallback
- Also used in `CommandLayout.tsx` as Suspense fallback for the map

## Implementation Plan

### A1. Create shimmer keyframe animation
- **File:** `packages/web/src/globals.css`
- Add keyframe:
  ```css
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  ```

### A2. Update Skeleton component
- **File:** `packages/web/src/components/layout/Skeleton.tsx`
- Replace `animate-pulse` with shimmer gradient:
  ```
  background: linear-gradient(90deg,
    var(--shimmer-base) 25%,
    var(--shimmer-highlight) 50%,
    var(--shimmer-base) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  ```
- CSS variables for theme:
  ```css
  :root {
    --shimmer-base: #e5e7eb;       /* gray-200 */
    --shimmer-highlight: #f3f4f6;  /* gray-100 */
  }
  .dark {
    --shimmer-base: #374151;       /* gray-700 */
    --shimmer-highlight: #4b5563;  /* gray-600 */
  }
  ```

### A3. Respect reduced-motion
- `@media (prefers-reduced-motion: reduce)` → fall back to static `bg-gray-200 dark:bg-gray-700` (no animation)

### A4. Stagger shimmer per line (optional)
- Each skeleton line could have a slight delay offset (50ms per line)
- Creates a cascade/wave effect across lines
- Achieved via `animation-delay: calc(var(--line-index) * 50ms)`

### A5. Additional skeleton shapes
- Consider adding a circle variant (for avatar/icon placeholders)
- Consider a block variant (for the map loading state)
- Keep API backward-compatible: `<Skeleton lines={3} />` still works

## Files to Modify
| File | Changes |
|------|---------|
| `packages/web/src/components/layout/Skeleton.tsx` | Replace pulse with shimmer gradient |
| `packages/web/src/globals.css` | Add shimmer keyframe, CSS variables |

## Open Questions
None — this is a straightforward visual upgrade with no architectural decisions.

## Testing
- Visual: Shimmer gradient sweeps left-to-right smoothly
- Visual: Dark mode shimmer uses appropriate dark colors
- Visual: Multiple skeleton instances on screen don't look synchronized (stagger helps)
- Accessibility: Reduced-motion preference shows static gray bars
- Performance: CSS-only animation, no JS overhead
