# Milestone 08 — City Map

**Goal:** Add an interactive MapLibre GL map centered on the city, showing relevant points of interest.

**Depends on:** [03-frontend-shell.md](03-frontend-shell.md) (needs the panel system)

---

## Steps

### 1. MapLibre GL setup

**Reference files:**
- `.worldmonitor/public/map-styles/happy-dark.json` and `happy-light.json` — bundled CARTO map style JSONs that can be served locally (no tile API key needed)
- `.worldmonitor/src/components/DeckGLMap.ts` — complex, do NOT port. Only reference for understanding map layer patterns.

Use CARTO vector tiles (free, no API key):
- Dark: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`
- Light: `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`

Or bundle the style JSON locally (as worldmonitor does) for offline resilience.

### 2. Map component (`packages/web/src/components/map/CityMap.tsx`)

```tsx
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

function CityMap() {
  const { map: mapConfig, theme } = useCityConfig();
  const mapRef = useRef<maplibregl.Map>();

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDark ? DARK_STYLE : LIGHT_STYLE,
      center: mapConfig.center,
      zoom: mapConfig.zoom,
      minZoom: mapConfig.minZoom ?? 9,
      maxZoom: mapConfig.maxZoom ?? 16,
      maxBounds: mapConfig.bounds,  // lock panning to city area
    });
    mapRef.current = map;
    return () => map.remove();
  }, []);

  // ...
}
```

### 3. Map markers

Show city-relevant points from the data already flowing through the system:
- **News events** — geocoded headlines (if coordinates available)
- **Transit disruptions** — affected stations/stops (from milestone 09)
- **Police reports** — if geocoded (from milestone 10)
- **Weather alerts** — overlay alert zone polygon (from milestone 06)

For MVP, the map can just show the city centered with basic OSM data visible (streets, transit lines, parks). Markers get added as other milestones provide geocoded data.

### 4. Per-city map configuration

The `CityConfig.map` object controls everything city-specific:

```typescript
// Berlin example
map: {
  center: [13.405, 52.52],
  zoom: 11,
  minZoom: 9,
  maxZoom: 17,
  bounds: [[12.9, 52.3], [13.8, 52.7]],  // lock to Berlin metro area
  layers: [
    {
      id: 'districts',
      type: 'geojson',
      source: '/data/berlin-bezirke.geojson',  // static file in public/
      style: { lineColor: 'var(--accent)', lineWidth: 1, fillOpacity: 0.05 },
    },
  ],
}
```

Adding a city means providing its `center`/`zoom`/`bounds` — the map tiles work globally.

### 5. Map panel integration

```tsx
// MapPanel wraps CityMap in a Panel that spans 2 grid columns on wide screens
<div className="col-span-1 lg:col-span-2">
  <Panel title="Map">
    <div className="h-[400px]">
      <CityMap />
    </div>
  </Panel>
</div>
```

### 6. Theme-aware map style

Switch between dark and light CARTO styles based on the current theme. Use `map.setStyle()` on theme toggle.

---

## Done when

- [ ] MapPanel renders an interactive map centered on Berlin
- [ ] Map uses CARTO tiles (no API key required)
- [ ] Panning is locked to the city's bounding box
- [ ] Dark/light map styles match the dashboard theme
- [ ] City config controls center, zoom, bounds, and custom layers
- [ ] Map is responsive and works on mobile
