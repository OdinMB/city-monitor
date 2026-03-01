/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from './app.js';

describe('GET /api/health', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { app } = createApp({ skipScheduler: true });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('returns status ok with expected fields', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeTypeOf('number');
    expect(body.activeCities).toContain('berlin');
    expect(body.cache).toBeDefined();
    expect(body.scheduler).toBeDefined();
  });
});
