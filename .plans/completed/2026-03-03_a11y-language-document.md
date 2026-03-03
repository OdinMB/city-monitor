# Plan 03 — Language, Document Title & RTL

## Problem

1. `<html lang="en">` never updates when the user switches language — screen readers use wrong pronunciation
2. `<title>` is static "City Monitor — Berlin" — doesn't update for Hamburg
3. No `<h1>` on the rendered dashboard page (only in `<noscript>`)
4. Arabic language has no `dir="rtl"` support

**WCAG violations:** 3.1.1 Language of Page (A), 1.3.1 Info & Relationships (A), 1.3.2 Meaningful Sequence (A)

## Changes

### 1. Sync `<html lang>` with i18n language — `App.tsx`
Add an effect that updates `document.documentElement.lang` whenever `i18n.language` changes:
```tsx
useEffect(() => {
  document.documentElement.lang = i18n.language;
  document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
}, [i18n.language]);
```
This goes in the `App` component next to the existing theme effect.

### 2. Dynamic `<title>` — `Dashboard` component in `App.tsx`
Add an effect in the `Dashboard` component (or `CityRoute`) that updates `document.title`:
```tsx
useEffect(() => {
  document.title = `City Monitor — ${city.name}`;
}, [city.name]);
```

**Decision:** Yes, update the title per city.

### 3. Add `<h1>` to the dashboard — `CommandLayout.tsx` or `Shell.tsx`
Add a visually hidden `<h1>` at the top of the page for screen readers:
```tsx
<h1 className="sr-only">City Monitor — {city.name}</h1>
```
This keeps the visual design unchanged while providing proper heading hierarchy.

### 4. RTL text direction for Arabic
The `dir="rtl"` attribute in step 1 handles basic text direction.

**Decision:** Text direction only — set `dir="rtl"` on `<html>` for Arabic. Full layout mirroring is a separate future effort.

## Testing
- Switch language to DE → inspect `<html lang="de">`
- Switch to AR → inspect `<html dir="rtl" lang="ar">`
- Navigate to Hamburg → check `<title>` says "City Monitor — Hamburg"
- Screen reader: verify correct pronunciation per language
- Check `<h1>` is present in accessibility tree
