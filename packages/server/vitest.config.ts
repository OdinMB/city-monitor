import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    silent: true,
    pool: 'forks',
    // Limit parallel workers to avoid OOM — each fork loads the full
    // server module graph (express, drizzle, openai, etc.)
    maxWorkers: 3,
    // A local `npm run build` leaves compiled tests in dist/ without their fixtures
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
