import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { EvChargingData } from '@city-monitor/shared';
import type { EvChargingRegister, EvChargingStatus } from '../lib/ev-charging.js';

describe('EV charging API', () => {
  let server: Server;
  let baseUrl: string;
  let appContext: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
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
    vi.unstubAllEnvs();
  });

  const register: EvChargingRegister = {
    edition: '2026-09-01',
    stations: [
      { id: '1009424', lat: 53.54938, lon: 10.00471, operator: 'HEnW-Mobil', address: 'Altstädter Str. 2', points: 2, maxKw: 22, fast: false, plugs: ['type2'], evse: ['DE*HHM*E977'] },
    ],
  };

  it('GET /api/berlin/ev-charging returns empty data when no cache', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/ev-charging`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: null, fetchedAt: null });
    expect(res.headers.get('cache-control')).toBe('public, max-age=120');
  });

  it('GET /api/hamburg/ev-charging returns the register without EVSE ids, and liveUpdated null while the status is missing', async () => {
    appContext.cache.set('hamburg:ev-charging:register', register, 60);
    const body = await (await fetch(`${baseUrl}/api/hamburg/ev-charging`)).json() as { data: EvChargingData; fetchedAt: string };
    expect(body.data.edition).toBe('2026-09-01');
    expect(body.data.stations[0]).not.toHaveProperty('evse');
    expect(body.data.stations[0]).not.toHaveProperty('live');
    expect(body.data.liveUpdated).toBeNull();
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/hamburg/ev-charging merges the live status, which bootstrap leaves out', async () => {
    const status: EvChargingStatus = {
      stations: [{
        station: 'DE*HHM*E977', lat: 53.54938, lon: 10.00471, address: 'Altstädter Straße 2', plugs: ['type2'], dc: false,
        points: [{ id: 'DE*HHM*E977*01', status: 'occupied', since: 1793670149 }],
      }],
      updated: '2026-11-03T02:00:00.000Z',
    };
    appContext.cache.set('hamburg:ev-charging:register', register, 60);
    appContext.cache.set('hamburg:ev-charging:status', status, 60);
    const body = await (await fetch(`${baseUrl}/api/hamburg/ev-charging`)).json() as { data: EvChargingData };
    expect(body.data.liveUpdated).toBe('2026-11-03T02:00:00.000Z');
    expect(body.data.stations[0]!.live).toEqual([{ id: 'DE*HHM*E977*01', status: 'occupied', since: 1793670149 }]);

    const boot = await (await fetch(`${baseUrl}/api/hamburg/bootstrap`)).json();
    expect(boot).not.toHaveProperty('evCharging');
  });

  it('GET /api/berlin/ev-charging has no live status in a city without a feed', async () => {
    appContext.cache.set('berlin:ev-charging:register', { edition: '2026-09-01', stations: [] }, 60);
    const body = await (await fetch(`${baseUrl}/api/berlin/ev-charging`)).json() as { data: EvChargingData };
    expect(body.data).toEqual({ edition: '2026-09-01', stations: [] });
  });

  it('GET /api/unknown/ev-charging returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/ev-charging`);
    expect(res.status).toBe(404);
  });
});
