# Self-host Favicons & Fix Contrast Issues

## Goal
1. Replace Google favicon API (`google.com/s2/favicons`) with locally hosted favicons to eliminate gstatic.com dependency
2. Fix low-contrast text flagged by Lighthouse audit
3. Add preconnect hint for `basemaps.cartocdn.com` (map tiles)

## Task 1: Self-host Favicons

### Script: `packages/web/scripts/fetch-favicons.ts`
- Download 16×16 favicons from Google's API for each domain in `FAVICON_DOMAINS`
- Save as `packages/web/public/favicons/<key>.png` (key = source name slug, e.g. `rbb24.png`)
- Run once to populate; commit the PNGs. No build-time dependency.

### Update `NewsStrip.tsx`
- Replace `https://www.google.com/s2/favicons?domain=${domain}&sz=16` with `/favicons/${key}.png`
- `FAVICON_DOMAINS` keeps the domain for the script but runtime code uses the key to build the local path

## Task 2: Fix Contrast Issues

### Gray text contrast
Lighthouse flagged `text-gray-400 dark:text-gray-500` — contrast ratio ~2.9:1 (light) / ~4.2:1 (dark), both below WCAG AA 4.5:1.

**Fix:** Swap to `text-gray-500 dark:text-gray-400` — ratio ~4.8:1 (light) / ~7.4:1 (dark), both pass.

Files:
- `DataLayerToggles.tsx:91` — inactive sub-layer label
- `DataLayerToggles.tsx:126` — single/multi view toggle
- `NewsStrip.tsx:131` — "show more" button
- `NewsStrip.tsx:164` — importance percentage

### Accent color contrast in dark mode
City accent colors (`#E2001A` Berlin, `#004B93` Hamburg) fail WCAG on dark backgrounds.

**Fix:** Add dark-mode `--accent` overrides in `globals.css` with lighter variants:
- Berlin dark: `#ff4d5e` (5.8:1 on gray-900 ✓)
- Hamburg dark: `#5b9bd5` (6.4:1 on gray-900 ✓)

Update `TopBar.tsx` to use `style={{ color: 'var(--accent)' }}` instead of `city.theme.accent` so it picks up the dark override. Same for `CityPicker.tsx`.

## Task 3: Add Preconnect

In `index.html`, add:
```html
<link rel="preconnect" href="https://basemaps.cartocdn.com" />
```

## Files Changed
- `packages/web/scripts/fetch-favicons.ts` (new)
- `packages/web/public/favicons/*.png` (new, ~9 files)
- `packages/web/src/components/strips/NewsStrip.tsx`
- `packages/web/src/components/sidebar/DataLayerToggles.tsx`
- `packages/web/src/globals.css`
- `packages/web/src/components/layout/TopBar.tsx`
- `packages/web/src/components/pages/CityPicker.tsx`
- `packages/web/index.html`
