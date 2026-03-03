# Plan 05 — Form Labels, Live Regions & Status Messages

## Problem

1. Budget district `<select>` elements have no associated label
2. NinaBanner warnings container has no `aria-live` for dynamic updates
3. Skeleton loading placeholders aren't hidden from screen readers

**WCAG violations:** 3.3.2 Labels (A), 4.1.3 Status Messages (AA), 1.3.1 Info & Relationships (A)

## Changes

### 1. Add `aria-label` to budget selects — `BudgetStrip.tsx`
In the `AreaSelect` component (line 167), add an `aria-label`:
```tsx
<select
  aria-label={t('panel.budget.selectDistrict')}
  value={value}
  onChange={(e) => onChange(Number(e.target.value))}
  ...
>
```
Also add the translation key `panel.budget.selectDistrict` to all 4 locale files.

The `DistrictView` renders two selects (lines 303, 307). Pass distinguishing labels: "Select left district" and "Select right district" (or use `aria-label` with position context).

### 2. Add `aria-live` to NinaBanner — `NinaBanner.tsx`
Wrap the warnings container (line 60) with `aria-live="polite"`:
```tsx
<div className="space-y-2 mb-4" aria-live="polite">
```
Individual cards already have `role="alert"` which is good for initial rendering. The `aria-live` ensures removals (dismissals) are also announced.

### 3. Hide Skeleton from screen readers — `Skeleton.tsx`
Add `aria-hidden="true"` and a visually hidden loading announcement:
```tsx
<div data-testid="skeleton" className="space-y-3 animate-pulse" aria-hidden="true">
```
Alternatively, add `role="status"` with an `aria-label="Loading"` — but since skeletons are purely visual placeholders, `aria-hidden` is simpler.

### 4. Add translation keys
Add to all 4 locale files (de, en, tr, ar):
- `panel.budget.selectDistrict`

## Testing
- Screen reader: navigate to budget district mode → hear "Select district" on the dropdown
- Screen reader: hear warning announcements when NINA alerts appear
- Screen reader: skeletons should not be read aloud
