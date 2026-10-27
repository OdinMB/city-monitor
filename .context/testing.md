# Testing

## Framework

Both packages use **Vitest 3.x** with separate configs:

- `packages/web/vitest.config.ts` — jsdom environment, `@vitejs/plugin-react`, setup file `src/test-setup.ts`
- `packages/server/vitest.config.ts` — Node environment, no DOM

## Running Tests

```bash
# All tests in all packages
npx turbo run test

# Specific package (verbose)
npx turbo run test --filter=@city-monitor/web -- --reporter=verbose
npx turbo run test --filter=@city-monitor/server -- --reporter=verbose

# Specific test file (path relative to package root)
npx turbo run test --filter=@city-monitor/web -- src/components/strips/NewsStrip.test.tsx
npx turbo run test --filter=@city-monitor/server -- src/lib/parse-history.test.ts
```

**Never run `npx vitest` from the monorepo root** — it resolves the wrong vitest config and setup files. Always either:
1. Use `npx turbo run test --filter=<package>`, or
2. Run `npx vitest run` from within the package directory itself

To run the app with data but without production access, use the synthetic dev database ([dev-database.md](dev-database.md)).

The guarded browser run under `harness/` has its own `node:test` suite, outside the workspaces and outside `npm test`: `node --test harness/test/*.test.mjs` ([harness/README.md](../harness/README.md)).

## Web Package (`@city-monitor/web`)

- **Environment:** jsdom. A file can run in Node instead with `// @vitest-environment node` as its first line: `src/built-css.test.ts` does, since it runs the production CSS build (Vite with the Tailwind plugin, nothing written to disk), and esbuild refuses to run under jsdom's globals
- **Setup file:** `src/test-setup.ts` — initializes i18n (all four bundles, English active), stubs `URL.createObjectURL`, the canvas 2D context, `ResizeObserver` and `matchMedia` (the DOM stubs only where there is a `window`), and mocks `maplibre-gl`. It does not load `@testing-library/jest-dom` (listed in devDependencies but imported nowhere), so use plain `expect` assertions
- **Libraries:** `@testing-library/react` (no `user-event`; tests use `fireEvent`)
- **Globals:** `true` — `describe`, `it`, `expect` are available without imports (but explicit imports from `vitest` also work)
- **Test location:** Co-located with source files (e.g., `src/components/Foo.test.tsx`)
- **Mocking:** `vi.mock()` for modules; i18n is auto-initialized via setup file

## Server Package (`@city-monitor/server`)

- **Environment:** Node (default)
- **Test location:** Co-located (e.g., `src/lib/parse-history.test.ts`)
- **No setup file** needed for most tests
- **Config:** `pool: 'forks'` capped at 3 workers (`maxForks`), `silent: true` (console output suppressed)
- **Needs a built `shared`:** server code imports `@city-monitor/shared/schemas.js` at runtime, so `npx vitest run` in a fresh checkout fails most route files with "Cannot find package" until `npm run build --workspace=shared` has run. `turbo run test` builds it first (`dependsOn: ["^build"]`).

## Conventions

- Test files use `.test.ts` (server) or `.test.tsx` (web) suffix
- Co-located with source: `src/components/Foo.tsx` → `src/components/Foo.test.tsx`
- Import from `vitest` for `describe`, `it`, `expect`, `vi` (even when globals are enabled)
- Use `@testing-library/react` `render`/`screen` for component tests
- No snapshot tests — prefer explicit assertions
- Import the module under test statically, at the top of the file. Vitest's 5 s per-test timeout covers the test body but not file collection, so an `await import('./module.js')` inside a test makes the first test pay for loading the module graph (Drizzle, the DB schema, city configs), and on a busy machine that overran the timeout. Use a dynamic import only after `vi.resetModules()`, when a test needs a fresh module instance.
