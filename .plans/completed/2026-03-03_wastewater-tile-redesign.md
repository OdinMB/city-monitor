# Wastewater Tile Redesign

## Goal

Redesign the WastewaterStrip to make better use of tile space: pathogen names as large titles, bigger charts with date labels.

## Current State

- 3 pathogens displayed horizontally in a tight row
- Pathogen names are tiny 10px labels at the bottom
- Sparklines are 60×20px — very small
- No date labels on charts
- Most tile space unused

## Changes (single file: `WastewaterStrip.tsx`)

1. **Stack vertically** — each pathogen gets its own section with room to breathe
2. **Pathogen name as title** — bold, left-aligned, prominent (text-sm font-semibold)
3. **Level + trend as badge** — right-aligned next to the title, colored
4. **Larger sparklines** — full width of the tile, ~36px tall
5. **Date labels** — show first and last dates of the 12-week history below chart (computed from `sampleDate` by stepping back in weeks)
6. **Remove redundant sample date line** — dates are now on the charts

## Layout Per Pathogen

```
┌─────────────────────────────────┐
│  Flu A              Low →      │
│  ╱╲  ╱╲___╱╲╱                   │
│  Jan 6          Feb 24          │
├─────────────────────────────────┤
│  Flu B              None ↓     │
│  ___╱╲_____                     │
│  Jan 6          Feb 24          │
├─────────────────────────────────┤
│  RSV                Moderate ↑ │
│  ╱╲  ╱╲___╱╲╱╲╱╲               │
│  Jan 6          Feb 24          │
└─────────────────────────────────┘
```

## No Test Changes

Pure visual/styling change — no new logic to test beyond date computation, which is trivial. Existing type checks and lint still apply.
