/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { BuergeramtData } from '../cron/ingest-appointments.js';
import { createApp } from '../app.js';

describe('Appointments API', () => {
  let server: Server;
  let baseUrl: string;
  let appContext: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    appContext = await createApp({ skipScheduler: true });
    await new Promise<void>((resolve) => {
      server = appContext.app.listen(0, () => {
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

  it('GET /api/berlin/appointments returns empty default when no data', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/appointments`);
    const body = await res.json() as BuergeramtData;
    expect(res.status).toBe(200);
    expect(body.services).toEqual([]);
    expect(body.bookingUrl).toContain('service.berlin.de');
  });

  it('GET /api/berlin/appointments returns cached data', async () => {
    const mockData: BuergeramtData = {
      services: [
        {
          serviceId: '120686',
          name: 'Anmeldung',
          earliestDate: '2026-03-10',
          availableDays: 12,
          status: 'available',
        },
      ],
      fetchedAt: '2026-03-03T10:00:00Z',
      bookingUrl: 'https://service.berlin.de/terminvereinbarung/',
    };
    appContext.cache.set('berlin:appointments', mockData, 60);

    const res = await fetch(`${baseUrl}/api/berlin/appointments`);
    const body = await res.json() as BuergeramtData;
    expect(res.status).toBe(200);
    expect(body.services).toHaveLength(1);
    expect(body.services[0].name).toBe('Anmeldung');
    expect(body.services[0].status).toBe('available');
    expect(body.fetchedAt).toBe('2026-03-03T10:00:00Z');
  });

  it('GET /api/unknown/appointments returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/appointments`);
    expect(res.status).toBe(404);
  });
});
