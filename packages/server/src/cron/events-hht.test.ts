import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CityEvent, EventSourceConfig } from '@city-monitor/shared';
import type { Db } from '../db/index.js';
import { createHhtSource } from './events-hht.js';

const loadLatestEventBatch = vi.hoisted(() => vi.fn());
vi.mock('../db/reads.js', () => ({ loadLatestEventBatch }));

const CONFIG: EventSourceConfig = { source: 'hht', url: 'ftp://ftp.example.org/export.xml.zip' };
const ENV = { HHT_FTP_USER: 'u', HHT_FTP_PASSWORD: 'p' };
const EVENT: CityEvent = { id: 'hht-1', title: 'Markt', date: '2030-05-11T08:00:00', category: 'market', url: '', source: 'hht' };
const SAVED: CityEvent = { ...EVENT, id: 'hht-saved' };
const HOUR = 3_600_000;

function setup(env: Record<string, string | undefined> = ENV) {
  let now = new Date('2030-05-10T06:00:00Z');
  const download = vi.fn(async () => [EVENT]);
  const warn = vi.fn();
  const source = createHhtSource({ download, now: () => now, env, warn });
  return { source, download, warn, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

beforeEach(() => {
  loadLatestEventBatch.mockReset();
  loadLatestEventBatch.mockResolvedValue(null);
});

describe('HHT events source', () => {
  it('skips the source without credentials, saying so once', async () => {
    const { source, download, warn } = setup({});
    expect(await source.fetch('hamburg', CONFIG, null)).toEqual({ events: [], save: false });
    expect(await source.fetch('hamburg', CONFIG, null)).toEqual({ events: [], save: false });
    expect(download).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('downloads at most once in 20 hours, serving the last download in between', async () => {
    const { source, download, advance } = setup();
    expect(await source.fetch('hamburg', CONFIG, null)).toEqual({ events: [EVENT], save: true });
    advance(6 * HOUR);
    expect(await source.fetch('hamburg', CONFIG, null)).toEqual({ events: [EVENT], save: false });
    advance(14 * HOUR);
    expect(await source.fetch('hamburg', CONFIG, null)).toEqual({ events: [EVENT], save: true });
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('after a restart, serves the saved rows of a download less than 20 hours old', async () => {
    const { source, download } = setup();
    loadLatestEventBatch.mockResolvedValue({ data: [SAVED], fetchedAt: new Date('2030-05-09T12:00:00Z') });
    expect(await source.fetch('hamburg', CONFIG, {} as Db)).toEqual({ events: [SAVED], save: false });
    expect(download).not.toHaveBeenCalled();
  });

  it('downloads again when the saved rows are older', async () => {
    const { source, download } = setup();
    loadLatestEventBatch.mockResolvedValue({ data: [SAVED], fetchedAt: new Date('2030-05-09T09:00:00Z') });
    expect(await source.fetch('hamburg', CONFIG, {} as Db)).toEqual({ events: [EVENT], save: true });
    expect(download).toHaveBeenCalledOnce();
  });

  it('falls back to the saved rows when the download fails', async () => {
    const { source, download } = setup();
    download.mockRejectedValueOnce(new Error('530 Login incorrect'));
    loadLatestEventBatch.mockResolvedValue({ data: [SAVED], fetchedAt: new Date('2030-05-08T06:00:00Z') });
    expect(await source.fetch('hamburg', CONFIG, {} as Db)).toEqual({ events: [SAVED], save: false });
  });

  it('passes the settings, the time and the lookahead to the download', async () => {
    const { source, download } = setup({ ...ENV, HHT_FTP_FILE: 'other.zip' });
    await source.fetch('hamburg', { ...CONFIG, lookaheadDays: 7 }, null);
    expect(download).toHaveBeenCalledWith(
      { host: 'ftp.example.org', file: 'other.zip', user: 'u', password: 'p' },
      new Date('2030-05-10T06:00:00Z'),
      { lookaheadDays: 7 },
    );
  });
});
