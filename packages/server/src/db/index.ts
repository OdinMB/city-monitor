/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('db');

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(): { db: Db; client: ReturnType<typeof postgres> } | null {
  const url = process.env.DATABASE_URL;
  if (!url) {
    log.info('DATABASE_URL not set — running without Postgres');
    return null;
  }

  const client = postgres(url, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });
  log.info('Connected to Postgres');
  return { db, client };
}

export async function testConnection(db: Db): Promise<void> {
  await db.execute(sql`SELECT 1`);
  log.info('DB connection verified');
}
