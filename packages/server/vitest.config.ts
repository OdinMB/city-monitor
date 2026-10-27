import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    silent: true,
    pool: 'forks',
    // Limit parallel workers to avoid OOM — each fork loads the full
    // server module graph (express, drizzle, openai, etc.)
    maxWorkers: 3,
  },
});
