# DX & CI Improvements

Improve developer experience, CI reliability, and build monitoring.

## Changes

### 1. Create `.env.example` — project root

Document all required and optional environment variables with descriptions:
```
# Required
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...

# Optional
ACTIVE_CITIES=berlin,hamburg
FIRECRAWL_API_KEY=...
LOCATIONIQ_TOKEN=...
SENTRY_DSN=...
WAQI_TOKEN=...
TOMTOM_API_KEY=...
```

This is the single highest-impact DX improvement — new developers currently discover required vars by trial and error.

### 2. CI: Add build verification — `.github/workflows/ci.yml`

Add `npm run build` as a CI step. Currently CI runs typecheck, lint, and test but never verifies the production build succeeds. Build failures are only caught at deploy time.

### 3. CI: Parallelize jobs — `.github/workflows/ci.yml`

Split the single sequential `check` job into parallel jobs:
- `typecheck` (fastest)
- `lint` (fast)
- `test` (slowest)
- `build` (depends on typecheck passing)

This reduces CI wall time from sequential sum to the duration of the slowest job.

### 4. CI: Add Turbo cache — `.github/workflows/ci.yml`

Add `actions/cache` for `.turbo/` directory. Turbo's cache means unchanged packages skip rebuilds between CI runs.

### 5. Fix turbo.json typecheck dependency — `turbo.json`

`typecheck` currently depends on `^build` (workspace dependencies' build). It should depend on `^typecheck` — typecheck doesn't need built artifacts, just type declarations.

### 6. Bundle size monitoring — `packages/web/vite.config.ts` + CI

Add `rollup-plugin-visualizer` as a dev dependency. Generate a size report on each build. Optionally add a CI step that fails if the main bundle exceeds a threshold (e.g., 600KB).

### 7. Pre-commit hooks (optional)

Add `husky` + `lint-staged` for:
- ESLint on staged `.ts`/`.tsx` files
- TypeScript check on staged files

This prevents broken code from being committed.

## Decisions

- **Pre-commit hooks:** Skip. CI is sufficient. Avoids slowing down commits.
- **Bundle size CI gate:** Warn only. Report size in CI output but don't block deploys.

## Scope

- 1 new file (.env.example)
- 2-3 files modified (ci.yml, turbo.json, vite.config.ts)
- 1-2 dev dependencies (visualizer, optionally husky)
