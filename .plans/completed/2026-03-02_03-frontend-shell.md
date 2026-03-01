# Milestone 03 — Frontend Shell

**Goal:** Build the React app layout, panel grid, city config context, and basic theming.

**Depends on:** [01-scaffolding.md](01-scaffolding.md) (can be built in parallel with milestone 02)

---

## Steps

### 1. City config context (`packages/web/src/config/`)

Mirror the server's city config on the frontend. The city ID comes from the URL path (`/:city/`) or defaults to `berlin`.

```typescript
// config/cities/berlin.ts — same CityConfig, different import path
// hooks/useCityConfig.ts — React context + hook
```

The `CityProvider` wraps the app and provides the current city config to all components.

### 2. App layout (`packages/web/src/components/layout/`)

```
Shell.tsx
├── TopBar          # City name, current time, weather icon (placeholder), theme toggle
├── PanelGrid       # CSS Grid container for dashboard panels
│   └── Panel       # Generic card wrapper (title, loading state, content slot)
└── Footer          # Data freshness, attribution links
```

**Panel grid CSS** (from worldmonitor's pattern):

**Reference:** `.worldmonitor/src/components/` — various panel components use the grid

```tsx
// PanelGrid.tsx
<div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 p-4 auto-rows-auto">
  {children}
</div>
```

Each `Panel` component:
```tsx
<div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
    {lastUpdated && <time className="text-xs text-gray-400">{lastUpdated}</time>}
  </div>
  <div className="p-4">{isLoading ? <Skeleton /> : children}</div>
</div>
```

### 3. Skeleton loading

**Reference:** `.worldmonitor/src/components/` — inline skeleton CSS pattern

Tailwind equivalent:
```tsx
function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded"
             style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}
```

### 4. Dark/light theme

Tailwind's `class` strategy + `data-city` attribute for accent colors:

```css
/* globals.css */
@import 'tailwindcss';

:root {
  --accent: #3b82f6;  /* default blue */
}

[data-city="berlin"] { --accent: #E2001A; }
[data-city="hamburg"] { --accent: #004B93; }
```

Theme toggle persists to localStorage. Default follows system preference via `prefers-color-scheme`.

### 5. React Query setup

```tsx
// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,       // 2 min
      gcTime: 30 * 60 * 1000,          // 30 min
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
});
```

### 6. API client (`packages/web/src/lib/api.ts`)

Typed fetch wrapper for all API endpoints:

```typescript
const BASE = '/api';

export const api = {
  getBootstrap: (city: string) => fetchJson<BootstrapData>(`${BASE}/${city}/bootstrap`),
  getNewsDigest: (city: string) => fetchJson<NewsDigest>(`${BASE}/${city}/news/digest`),
  getNewsSummary: (city: string) => fetchJson<NewsSummary>(`${BASE}/${city}/news/summary`),
  getWeather: (city: string) => fetchJson<WeatherData>(`${BASE}/${city}/weather`),
  getTransit: (city: string) => fetchJson<TransitAlert[]>(`${BASE}/${city}/transit`),
  getEvents: (city: string) => fetchJson<CityEvent[]>(`${BASE}/${city}/events`),
  // ...
};
```

### 7. Placeholder panels

Create empty panel components that show their name and a skeleton loader:
- `NewsBriefingPanel` — "News" (built out in milestone 05)
- `WeatherPanel` — "Weather" (built out in milestone 06)
- `TransitPanel` — "Transit" (built out in milestone 09)
- `EventsPanel` — "Events" (built out in milestone 10)
- `MapPanel` — "Map" (built out in milestone 08)

These render in the PanelGrid so the layout is visible from the start.

---

## Done when

- [ ] `npm run dev` shows a dashboard layout with TopBar, PanelGrid, Footer
- [ ] Panel grid is responsive (1 column on mobile, 2-3 on desktop)
- [ ] Dark/light theme toggle works, persists to localStorage
- [ ] City name ("Berlin") shows in the TopBar with accent color
- [ ] Placeholder panels render with skeleton loaders
- [ ] API client is typed and makes requests to `/api/:city/*`
- [ ] Vite proxy forwards to Express backend
