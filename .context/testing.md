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
npx turbo run test --filter=@city-monitor/web -- src/components/TrendChart.test.tsx
npx turbo run test --filter=@city-monitor/server -- src/lib/parse-history.test.ts
```

**Never run `npx vitest` from the monorepo root** — it resolves the wrong vitest config and setup files. Always either:
1. Use `npx turbo run test --filter=<package>`, or
2. Run `npx vitest run` from within the package directory itself

## Web Package (`@city-monitor/web`)

- **Environment:** jsdom (simulated DOM via happy-dom/jsdom)
- **Setup file:** `src/test-setup.ts` — imports `@testing-library/jest-dom` matchers
- **Libraries:** `@testing-library/react`, `@testing-library/user-event`
- **Globals:** `true` — `describe`, `it`, `expect` are available without imports (but explicit imports from `vitest` also work)
- **Test location:** Co-located with source files (e.g., `src/components/Foo.test.tsx`)
- **Mocking:** `vi.mock()` for modules; i18n is auto-initialized via setup file

## Server Package (`@city-monitor/server`)

- **Environment:** Node (default)
- **Test location:** Co-located (e.g., `src/lib/parse-history.test.ts`)
- **No setup file** needed for most tests

## Conventions

- Test files use `.test.ts` (server) or `.test.tsx` (web) suffix
- Co-located with source: `src/components/Foo.tsx` → `src/components/Foo.test.tsx`
- Import from `vitest` for `describe`, `it`, `expect`, `vi` (even when globals are enabled)
- Use `@testing-library/react` `render`/`screen` for component tests
- No snapshot tests — prefer explicit assertions
