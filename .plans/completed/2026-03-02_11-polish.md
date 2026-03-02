# Milestone 11 — Polish

**Goal:** Internationalization, theme refinement, error tracking, SEO, and performance.

**Depends on:** All feature milestones (05–10) should be substantially complete.

---

## Steps

### 1. i18n with i18next

**Reference:** worldmonitor uses `i18next` — same library.

Set up `react-i18next` with:
- German (primary for Berlin)
- English (international residents)
- Language auto-detection from browser `Accept-Language`
- Language switcher in TopBar

Translation scope is small — just UI labels, panel titles, category names, time formatting. News content stays in its original language (the AI summary can be generated in the user's language).

### 2. Theme refinement

- Verify all panels look good in both dark and light mode
- Ensure city accent color is used consistently (panel headers, links, active states)
- Test on mobile (320px), tablet (768px), desktop (1440px)
- Add subtle transitions for theme toggle (150ms on background-color, color)

### 3. Sentry integration

Add `@sentry/react` to frontend, `@sentry/node` to server:
- Frontend: capture React error boundaries, failed API calls
- Server: capture unhandled rejections, cron job failures, upstream API errors
- Tag events with `cityId` for filtering

### 4. SEO

Even though it's an SPA, basic SEO matters for discovery:
- `<title>` and `<meta description>` set per city (via the city config)
- Open Graph tags for social sharing
- `sitemap.xml` with city landing pages
- Inject `<noscript>` fallback with city name and description

### 5. Performance

- Lazy-load MapLibre (it's heavy — ~200KB). Don't load until MapPanel is visible.
- React Query `placeholderData` to avoid layout shift during refetches
- Verify bootstrap endpoint is called once and hydrates all queries
- Add `Cache-Control` headers on API responses (per route tier)
- Check bundle size with `vite-bundle-visualizer`

### 5a. Database optimization

- Add indices on frequently queried columns: `news_articles(city_id, created_at)`, `events(city_id, date)`, `transit_disruptions(city_id, resolved)`
- Connection pooling: verify `postgres` driver pool settings (default is fine for single-instance)
- Add data retention: prune old `news_articles` (>7 days), `weather_snapshots` (>30 days), resolved `transit_disruptions` (>48h) via a nightly cron job
- Monitor query performance via `EXPLAIN ANALYZE` on common queries

### 6. Favicon and PWA manifest

Per-city favicon with the city's accent color. Basic PWA manifest so it's installable on mobile:

```json
{
  "name": "Berlin Dashboard",
  "short_name": "Berlin",
  "theme_color": "#E2001A",
  "display": "standalone"
}
```

---

## Done when

- [ ] Language switcher toggles between German and English
- [ ] All UI labels are translated
- [ ] Dark/light theme works on all panels with smooth transitions
- [ ] Sentry captures errors in both frontend and server
- [ ] SEO meta tags are set per city
- [ ] MapLibre is lazy-loaded
- [ ] Bundle size is under 300KB gzipped (excluding map tiles)
- [ ] Lighthouse score > 90 on performance
