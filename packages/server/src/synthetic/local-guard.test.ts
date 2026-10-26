import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOCAL_DATABASE_URL, assertLocalDatabaseUrl, blockExternalFetch, checkLocalDatabaseUrl, syntheticDatabaseUrl,
} from './local-guard.js';

const NO_ENV = {};

describe('checkLocalDatabaseUrl', () => {
  it.each([
    LOCAL_DATABASE_URL,
    'postgres://cmdev:cmdev_local@127.0.0.1:5434/city_monitor_dev',
    'postgresql://user@LOCALHOST/city_monitor_dev?sslmode=disable&connect_timeout=5',
  ])('accepts %s', (url) => {
    expect(checkLocalDatabaseUrl(url, NO_ENV)).toBeNull();
  });

  it.each([
    ['postgres://user:pw@dpg-abc123.frankfurt-postgres.render.com/city_monitor_dev', 'not this machine'],
    ['postgres://user:pw@10.0.0.5:5432/city_monitor_dev', 'not this machine'],
    ['postgres://user:pw@localhost.example.com/city_monitor_dev', 'not this machine'],
    // postgres.js cannot connect to a bracketed IPv6 host, so ::1 is not offered
    ['postgres://user:pw@[::1]:5434/city_monitor_dev', 'not this machine'],
    ['postgres://user:pw@localhost:5434,db.example.com:5432/city_monitor_dev', 'several hosts'],
    // postgres.js decodes the part after the first @ and would connect to "b" first
    ['postgres://a@b%2Cdb.example.com@localhost/city_monitor_dev', 'several hosts'],
    ['postgres:///city_monitor_dev', 'names no host'],
    ['postgres://user:pw@localhost:5434', 'names no database'],
    ['mysql://user:pw@localhost/city_monitor_dev', 'scheme'],
    ['not a url', 'not a valid URL'],
  ])('refuses %s', (url, reason) => {
    expect(checkLocalDatabaseUrl(url, NO_ENV)).toContain(reason);
  });

  it.each(['host=db.example.com', 'HOST=db.example.com', 'hostaddr=10.0.0.5', 'HostAddr=10.0.0.5', 'database=city_monitor', 'user=postgres'])(
    'refuses the query parameter %s, which can redirect the connection',
    (param) => {
      const problem = checkLocalDatabaseUrl(`${LOCAL_DATABASE_URL}?sslmode=disable&${param}`, NO_ENV);
      expect(problem).toContain(`query parameter ${param.split('=')[0]}`);
    },
  );

  it('refuses another local database name, since a local port can forward to a remote server', () => {
    const url = 'postgres://cmdev:pw@localhost:5434/city_monitor';
    expect(checkLocalDatabaseUrl(url, NO_ENV)).toContain('its database city_monitor is not city_monitor_dev');
    expect(checkLocalDatabaseUrl(url, { SYNTHETIC_ALLOW_DATABASE_NAME: 'other' })).not.toBeNull();
    expect(checkLocalDatabaseUrl(url, { SYNTHETIC_ALLOW_DATABASE_NAME: 'city_monitor' })).toBeNull();
  });

  it('never lets the name override reach a remote host', () => {
    const url = 'postgres://u:pw@db.example.com/city_monitor';
    expect(checkLocalDatabaseUrl(url, { SYNTHETIC_ALLOW_DATABASE_NAME: 'city_monitor' })).toContain('not this machine');
  });
});

describe('assertLocalDatabaseUrl', () => {
  it.each([
    'postgres://user:secret@db.example.com/city_monitor_dev',
    'postgres://user:secret@localhost/production',
    'postgres://user:secret@localhost/city_monitor_dev?host=db.example.com',
  ])('says why it refuses %s, without the password', (url) => {
    let message = '';
    try {
      assertLocalDatabaseUrl(url, NO_ENV);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/^Refusing to use this database for synthetic data: its (host|database|query)/);
    expect(message).not.toContain('secret');
  });

  it('passes the docker-compose database', () => {
    expect(() => assertLocalDatabaseUrl(LOCAL_DATABASE_URL, NO_ENV)).not.toThrow();
  });
});

describe('syntheticDatabaseUrl', () => {
  it('ignores DATABASE_URL', () => {
    expect(syntheticDatabaseUrl({ DATABASE_URL: 'postgres://u:p@prod.example.com/db' })).toBe(LOCAL_DATABASE_URL);
  });

  it('takes SYNTHETIC_DATABASE_URL, which the guard still checks', () => {
    const url = 'postgres://u:p@127.0.0.1:5432/other';
    expect(syntheticDatabaseUrl({ SYNTHETIC_DATABASE_URL: url })).toBe(url);
  });
});

describe('blockExternalFetch', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
    vi.unstubAllGlobals();
  });

  it('rejects requests to other hosts and passes local ones through', async () => {
    const realFetch = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', realFetch);
    restore = blockExternalFetch();

    await expect(fetch('https://api.open-meteo.com/v1/forecast')).rejects.toThrow(/blocks outbound requests \(api\.open-meteo\.com\)/);
    await expect(fetch(new URL('https://api.openai.com/v1/responses'))).rejects.toThrow(/api\.openai\.com/);
    await expect(fetch(new Request('https://tiles.example.org/x.png'))).rejects.toThrow(/tiles\.example\.org/);
    expect(realFetch).not.toHaveBeenCalled();

    await fetch('http://localhost:3001/api/health');
    expect(realFetch).toHaveBeenCalledTimes(1);
  });

  it('restores the original fetch', () => {
    const realFetch = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', realFetch);
    blockExternalFetch()();
    expect(globalThis.fetch).toBe(realFetch);
  });
});
