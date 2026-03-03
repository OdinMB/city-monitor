# Plan 06 — Miscellaneous Accessibility Polish

## Problem

Collection of medium/low severity issues that don't fit in the other plans.

## Changes

### 1. SVG `aria-hidden` on icon-only buttons
Add `aria-hidden="true"` to all decorative SVGs inside buttons that already have `aria-label`. Prevents screen readers from attempting to describe the SVG paths.

**Files:**
- `TopBar.tsx:135-145` — moon/sun SVGs in theme toggle
- `TopBar.tsx:157-161` — hamburger SVG
- `TopBar.tsx:192-202` — mobile menu theme SVGs
- `MobileLayerDrawer.tsx:92-96` — layers SVG
- `DataLayerToggles.tsx:74` — layer badge SVGs (inside buttons with text labels)
- `Tile.tsx:49-61` — chevron SVG

### 2. State-aware theme toggle label
`TopBar.tsx:132` — Change `aria-label="Toggle theme"` to:
```tsx
aria-label={theme === 'light' ? t('topbar.theme.switchDark') : t('topbar.theme.switchLight')}
```
Add translation keys for `topbar.theme.switchDark` and `topbar.theme.switchLight`.

### 3. Location emoji accessible name
`NewsStrip.tsx:135` — Wrap the 📍 emoji:
```tsx
<span aria-label={t('panel.news.locationPin')} role="img">📍</span>
```

### 4. Sparkline SVG accessibility
`WastewaterStrip.tsx:67` — Add `role="img"` and a descriptive `aria-label`:
```tsx
<svg role="img" aria-label={`${pathogenLabel} trend chart`} viewBox={...}>
```
Pass the pathogen label through to the Sparkline component.

### 5. Remove "T1" badge
`NewsStrip.tsx:126-130` — Remove the T1 tier badge entirely. It's cryptic and adds no value for most users.

### 6. Pie chart overall description
`BudgetStrip.tsx:102` — Add `role="img"` and `aria-label` to the pie chart SVG:
```tsx
<svg role="img" aria-label={`${label}: ${formatAmount(total)}`} viewBox="0 0 120 120" ...>
```

### 8. Add translation keys
Add to all 4 locale files:
- `topbar.theme.switchDark`
- `topbar.theme.switchLight`
- `panel.news.locationPin`

## Testing
- Screen reader: SVGs inside buttons should not be separately announced
- Screen reader: theme toggle should say "Switch to dark mode" not "Toggle theme"
- Screen reader: sparkline charts should be described
- Screen reader: T1 badge should explain meaning
