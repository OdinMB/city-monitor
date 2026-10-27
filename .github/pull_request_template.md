## What this changes

<!-- What someone using the site, or working on the code, will notice. Link the issue if there is one. -->

## How you checked it

<!-- The tests you added or ran, and what you looked at in the browser (city, language, theme, screen size). -->

## Checklist

<!-- Tick what you did, and delete the lines that don't apply to this change. -->

- [ ] I agree to the [contribution terms in CONTRIBUTING.md](https://github.com/OdinMB/city-monitor/blob/main/CONTRIBUTING.md#contributor-license-agreement), and every commit in this pull request is signed off (`git commit -s`).
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass on my machine ([how to run them](https://github.com/OdinMB/city-monitor/blob/main/CONTRIBUTING.md#run-the-checks)).
- [ ] **New data source:** I checked its licence, including whether it allows AI input and redistribution, and followed the [new data source checklist](https://github.com/OdinMB/city-monitor/blob/main/.context/new-data-sources.md#new-data-source-checklist), including its Sources page entry.
- [ ] **New snapshot type:** the synthetic data generator writes it (`packages/server/src/synthetic/generate.ts` and `seed.ts`; [dev-database.md](https://github.com/OdinMB/city-monitor/blob/main/.context/dev-database.md#adding-a-data-source)).
- [ ] **UI strings:** every new or changed string is in all four locale files (`en`, `de`, `tr`, `ar`), with plural forms for counts ([i18n.md](https://github.com/OdinMB/city-monitor/blob/main/.context/i18n.md#plurals)).
- [ ] **The browser loads from a new host** (map tiles, an overlay, a script): it is named in `SERVICES` on the Privacy page, and I flag it here, because adding it to the CSP in `render.yaml` is the maintainer's call ([deployment.md](https://github.com/OdinMB/city-monitor/blob/main/.context/deployment.md#static-frontend)).
- [ ] **Anything AI** (a new AI feature, where AI output is shown or served, an AI label): `.context/ai-transparency.md` is updated in this pull request ([the record](https://github.com/OdinMB/city-monitor/blob/main/.context/ai-transparency.md)).
- [ ] **Visible change:** before and after screenshots are below (in Arabic too if the layout changed).
- [ ] Nothing here is on the [list of changes only the maintainer makes](https://github.com/OdinMB/city-monitor/blob/main/CONTRIBUTING.md#changes-only-the-maintainer-makes). If part of the change needs one, I say which, and leave that part to the maintainer.

## Screenshots

<!-- Before and after, for a visible change. -->
