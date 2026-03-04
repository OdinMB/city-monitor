/**
 * One-off script: clear LLM assessments for recent news items so the next
 * cron cycle reclassifies them with the updated prompt.
 *
 * Usage: npx tsx packages/server/src/scripts/reclassify-news.ts
 *
 * What it does:
 * 1. Connects to the DB (uses DATABASE_URL from .env)
 * 2. NULLs out relevant_to_city, importance, lat, lon, location_label
 *    for news items published in the last 48 hours
 * 3. The running server's next news cron cycle (every 15 min) will
 *    re-assess these items using the updated LLM prompt
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const client = postgres(url, { max: 1, idle_timeout: 5 });
const db = drizzle(client);

const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

console.log(`Clearing assessments for news items published after ${cutoff}…`);

const result = await db.execute(sql`
  UPDATE news_items
  SET relevant_to_city = NULL,
      importance = NULL,
      lat = NULL,
      lon = NULL,
      location_label = NULL
  WHERE published_at > ${cutoff}
`);

console.log(`Done — ${(result as unknown as Record<string, unknown>).count ?? 'unknown number of'} rows updated.`);
console.log('The next news cron cycle will reclassify these items.');

await client.end();
