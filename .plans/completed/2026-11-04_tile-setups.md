# Tile setups: sections, setup mode, save and share

Requested by Odin (2026-11-04). The dashboard tiles below the map are one flat grid ordered by practical relevance and read as "all mixed up". Group them into labelled sections, offer two standard setups per city plus a user-defined one, and save/share the setup together with the map layer state.

## Behaviour

### Sections

The grid becomes a list of sections. Each section has a heading (its name) and its own dense grid (same columns, spans and dense packing as today's `DashboardGrid`). A section the city has no tile for is not rendered. Each heading has a collapse toggle; collapsed sections are remembered per setup (saved, see below). Phones: sections stack, headings stay compact.

### Standard setups (always available, not editable)

Defined once, filtered by the city's features (a tile shows only where it does today, including the lift tile's special hiding), with per-city overrides where a city needs a different placement.

**Functional (default)** — what the tile does for the visitor:

- News: briefing, news, events
- Environment ("what hits me in the city"): weather, air quality, pollen, wastewater (virus load), bathing
- Disturbances: public transport, lift outages, Bürgeramt appointments
- Crises: flood status (München), crisis services (service numbers); Hamburg override: water levels here (storm surge)
- Background: council meetings, political, labour market, population, budget, electricity, soil moisture, fire brigade, water levels (except Hamburg)

**Topics:**

- News: briefing, news, events
- Weather: weather, pollen
- Environment: air quality, water levels, flood status, bathing, electricity, soil moisture
- Traffic & transport: public transport, lift outages
- Health & safety: crisis services, wastewater, fire brigade
- City hall: appointments, council meetings, political, budget
- Social: labour market, population

The support (donate) tile is a tile like the others with id `support`: in Functional it closes the Crises section (before Background); in Topics it closes the Health & safety section. In a custom setup it can be moved but not removed.

There is no noise tile (noise is map-only); nothing to place.

### Setup switcher and setup mode

Above the first section, a compact bar: a segmented switch **Functional · Topics · My setup** (My setup only once one exists), a **Customize** button and a **Share** button.

- Choosing Functional or Topics shows that standard setup. This is always one click away, so the visitor can always get back.
- **Customize** enters setup mode. Starting from a standard setup copies it into My setup (the standard stays untouched); starting from My setup edits it.
- In setup mode: each section heading gets rename (inline text input), move up/down, delete (its tiles go to the hidden tray); each tile gets move up/down within its section, a "move to section" select, and remove (to the tray). An **Add section** button. A **Hidden tiles** tray lists the city's tiles not placed in any section, each with "add to section". Tile contents keep rendering (no need to hide them) but the controls must be clearly visible and keyboard/touch usable. Up/down buttons, not drag-and-drop (accessible, phone-friendly; drag can come later).
- **Done** leaves setup mode. **Reset** inside setup mode offers "Start from Functional" / "Start from Topics" (replaces My setup after a confirm).
- My setup is per city (cities have different tiles). Tiles a city has that My setup neither places nor lists as removed (e.g. a newly added source) appear at the end of the last section, so new tiles are never silently lost.

### Saving

One first-party preference cookie (name `cm_setup`, `path=/`, max-age 1 year, `SameSite=Lax`, `Secure` on https), versioned JSON (`v: 1`). Invalid, unknown-version or oversized content is ignored (fall back to defaults), never thrown. Keep it well under 4 KB (compact keys; a size guard that drops the oldest-touched city's entry if needed).

Per city it stores: the chosen setup (`functional` | `topics` | `custom`), My setup (sections: name + tile ids), collapsed sections per setup, and the map state.

Map state saved: active layers, groups left on without layers (`openEmpty`), single view, and every sub-layer/choice in the command-center store (political, social, population, noise, noise live, news/emergency/water/traffic/heat-relief sub-layers, accident filter, crime layer, report statuses). Saved automatically on change, per city. On entering a city, a saved map state replaces that city's defaults (today `enterCity` always resets to defaults for a different city). Values the city does not have are already tolerated by the effective-sub-layer helpers; unknown values from an old cookie are dropped.

Write the cookie only after the visitor changes something (a setup choice, a collapse, a setup edit, a map change). A first visit with no interaction sets no cookie. Check the legal/privacy pages and the "0 tracking" support tile: if any text says the site sets no cookies, update it in all four languages to say it stores only the visitor's own display preferences in a first-party cookie, no tracking.

### Sharing

**Share** copies a URL to the current city's dashboard carrying the current setup and map state (Web Share API on phones where available, else clipboard, with a short "Link copied" toast). Params: `setup=functional|topics` for a standard setup, or `setup=c.<base64url compact JSON>` for a custom one (sections with names and tile ids); `map=<base64url compact JSON>` for the map state. Keep the URL short (compact keys, ids not labels).

Opening a link with these params applies them for the visit, then removes the params from the address bar (`history.replaceState`, keeping other params). A small bar says "You're viewing a shared setup" with **Keep it** (save as mine for this city) and **Back to mine** (restore the cookie state). Any edit the visitor makes counts as keeping it. Malformed params are ignored.

## Implementation notes (settled)

- Give every tile a stable string id; one registry maps id → render (title, span, row span, expandable, default expanded, feature gate) instead of the long JSX list in `CommandLayout`. Keep tile behaviour identical (the BathingTile badge, LiftOutagesTile hiding, defaultExpanded on desktop, council meetings' per-city title, political tile's expand callback).
- Pure logic (setup definitions + per-city resolution, custom setup ops, cookie and URL encode/decode, map state serialise/restore) in `lib/` with unit tests first (TDD). Store for the setup state in Zustand like `useCommandCenter`.
- Anything that scrolls to or targets a tile (see `tile-targets.test.tsx`, keyboard shortcuts) must keep working; a targeted tile in a collapsed section expands that section, in a hidden-in-custom tile is a no-op.
- i18n: all new strings in DE/EN/TR/AR; Arabic RTL layout for the bar and controls. User-entered section names render as text.
- Docs: update `.context/frontend.md` (sections, setups, cookie, URL params) and the CLAUDE.md context-file line if needed.
- Before commit: `npm run typecheck`, `npm run lint`, `npm test` all green.
