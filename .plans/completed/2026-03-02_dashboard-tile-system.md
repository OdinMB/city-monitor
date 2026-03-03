# Dashboard Tile System

## Goal

Replace the full-width stacked strip layout below the map with a responsive tile grid that arranges automatically. Tiles have configurable column spans and the layout adjusts at each breakpoint.

## Architecture

### Grid System

A CSS Grid with fixed breakpoints that avoids odd-column layouts (which leave gaps with span-2 tiles):

| Breakpoint | Columns | Min tile width |
|---|---|---|
| < 640px (mobile) | 1 | full width |
| sm (640px+) | 2 | ~300px |
| xl (1280px+) | 4 | ~300px |

### Tile Sizes

Each tile declares a `span` prop:

| Span | Mobile | sm (2-col) | xl (4-col) |
|---|---|---|---|
| `1` | full width | 1 col (50%) | 1 col (25%) |
| `2` | full width | 2 cols (100%) | 2 cols (50%) |
| `full` | full width | full width | full width |

### Tile Assignments

| Tile | Span | Reason |
|---|---|---|
| Briefing | 1 | Compact prose paragraph |
| Air Quality | 1 | Compact data card with gauge |
| News | 2 | Long scrollable list |
| Events | 2 | Card grid |
| Transit | 2 | Alert card grid |

Layout at xl (4 columns):
```
[Briefing 1] [AirQuality 1] [     News 2     ]
[     Events 2     ] [     Transit 2     ]
```

Layout at sm (2 columns):
```
[Briefing] [AirQuality]
[       News 2       ]
[      Events 2      ]
[      Transit 2     ]
```

### Container Queries

Strips with internal responsive grids (Events, Transit) currently use viewport-based media queries (`sm:grid-cols-2 lg:grid-cols-3`). Inside a narrower tile, these fire incorrectly.

Fix: Tile body has `@container`. Strips use Tailwind v4 container query variants (`@sm:grid-cols-2`, `@lg:grid-cols-3`) so internal grids respond to tile width, not viewport.

## New Components

### `DashboardGrid` (`components/layout/DashboardGrid.tsx`)

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 p-4">
  {children}
</div>
```

### `Tile` (`components/layout/Tile.tsx`)

Props: `title`, `span` (1 | 2 | 'full', default 1), `children`, `className?`

- Card styling: rounded-lg, border, bg, shadow-sm
- Title header with `<h2>` (same style as current strip titles)
- Body with `@container` for container queries
- Maps span to grid-column classes

## Strip Refactoring

Each strip removes:
- Outer `<section className="border-b ...">` wrapper
- `<h2>` title (Tile provides it)
- `px-4 py-4` padding (Tile provides it)

Each strip keeps:
- All internal content, layout, data fetching
- Loading/empty state handling

Strips with internal grids switch from viewport queries to container queries:
- **EventsStrip**: `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` → `@xs:grid-cols-2 @lg:grid-cols-3 @2xl:grid-cols-4`
- **TransitStrip**: `sm:grid-cols-2 lg:grid-cols-3` → `@xs:grid-cols-2 @lg:grid-cols-3`

### CommandLayout Changes

NinaBanner stays outside the grid (full-width conditional alert). Strips move into DashboardGrid + Tile:

```tsx
<div className="bg-white dark:bg-gray-900">
  <NinaBanner />
  <DashboardGrid>
    <Tile title={t('panel.briefing.title')} span={1}>
      <BriefingStrip />
    </Tile>
    <Tile title={t('panel.airQuality.title')} span={1}>
      <AirQualityStrip />
    </Tile>
    <Tile title={t('panel.news.title')} span={2}>
      <NewsStrip />
    </Tile>
    <Tile title={t('panel.events.title')} span={2}>
      <EventsStrip />
    </Tile>
    <Tile title={t('panel.transit.title')} span={2}>
      <TransitStrip />
    </Tile>
  </DashboardGrid>
</div>
```

## Cleanup

- Delete unused `PanelGrid.tsx` and `Panel.tsx` (replaced by DashboardGrid/Tile)
- Delete unused panel components in `components/panels/` if any exist

## Files to Create

1. `packages/web/src/components/layout/DashboardGrid.tsx`
2. `packages/web/src/components/layout/Tile.tsx`

## Files to Modify

1. `packages/web/src/components/layout/CommandLayout.tsx` — new grid layout
2. `packages/web/src/components/strips/BriefingStrip.tsx` — remove section wrapper
3. `packages/web/src/components/strips/AirQualityStrip.tsx` — remove section wrapper
4. `packages/web/src/components/strips/NewsStrip.tsx` — remove section wrapper
5. `packages/web/src/components/strips/EventsStrip.tsx` — remove wrapper, container queries
6. `packages/web/src/components/strips/TransitStrip.tsx` — remove wrapper, container queries

## Files to Delete

1. `packages/web/src/components/layout/PanelGrid.tsx`
2. `packages/web/src/components/layout/Panel.tsx`
