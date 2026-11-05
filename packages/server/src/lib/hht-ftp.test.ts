import { describe, it, expect, vi } from 'vitest';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { deflateRawSync } from 'node:zlib';
import { downloadHhtArchive, fetchHhtEvents, hhtFtpSettings, type FtpClientLike } from './hht-ftp.js';

const CONFIG_URL = 'ftp://ftp.example.org/export.xml.zip';

describe('hhtFtpSettings', () => {
  it('needs both credentials', () => {
    expect(hhtFtpSettings(CONFIG_URL, {})).toBeNull();
    expect(hhtFtpSettings(CONFIG_URL, { HHT_FTP_USER: 'u' })).toBeNull();
    expect(hhtFtpSettings(CONFIG_URL, { HHT_FTP_PASSWORD: 'p' })).toBeNull();
  });

  it('takes host and file from the configured URL', () => {
    expect(hhtFtpSettings(CONFIG_URL, { HHT_FTP_USER: 'u', HHT_FTP_PASSWORD: 'p' }))
      .toEqual({ host: 'ftp.example.org', file: 'export.xml.zip', user: 'u', password: 'p' });
  });

  it('lets HHT_FTP_HOST and HHT_FTP_FILE override them', () => {
    expect(hhtFtpSettings(CONFIG_URL, { HHT_FTP_USER: 'u', HHT_FTP_PASSWORD: 'p', HHT_FTP_HOST: ' other.example.org ', HHT_FTP_FILE: 'dir/x.zip' }))
      .toEqual({ host: 'other.example.org', file: 'dir/x.zip', user: 'u', password: 'p' });
  });
});

function fakeClient(payload: Buffer, chunkSize = 1024) {
  const client = {
    access: vi.fn(async () => ({ code: 230, message: 'ok' })),
    // Like basic-ftp: the data connection is piped into the destination
    downloadTo: vi.fn(async (dest: Writable, _path: string) => {
      const chunks: Buffer[] = [];
      for (let i = 0; i < payload.length; i += chunkSize) chunks.push(payload.subarray(i, i + chunkSize));
      await pipeline(Readable.from(chunks), dest);
      return { code: 226, message: 'done' };
    }),
    close: vi.fn(),
  };
  return client satisfies FtpClientLike;
}

const SETTINGS = { host: 'ftp.example.org', file: 'export.xml.zip', user: 'u', password: 'p' };

describe('downloadHhtArchive', () => {
  it('logs in over explicit TLS and returns the file', async () => {
    const client = fakeClient(Buffer.from('archive bytes'), 4);
    const buf = await downloadHhtArchive(SETTINGS, { createClient: () => client });
    expect(buf.toString()).toBe('archive bytes');
    expect(client.access).toHaveBeenCalledWith({ host: 'ftp.example.org', port: 21, user: 'u', password: 'p', secure: true });
    expect(client.downloadTo.mock.calls[0]![1]).toBe('export.xml.zip');
    expect(client.close).toHaveBeenCalled();
  });

  it('gives up on a file larger than the cap, and still closes the connection', async () => {
    const client = fakeClient(Buffer.alloc(100), 10);
    await expect(downloadHhtArchive(SETTINGS, { createClient: () => client, maxBytes: 50 })).rejects.toThrow();
    expect(client.close).toHaveBeenCalled();
  });

  it('closes the connection when the login fails', async () => {
    const client = fakeClient(Buffer.alloc(0));
    client.access.mockRejectedValueOnce(new Error('530 Login incorrect'));
    await expect(downloadHhtArchive(SETTINGS, { createClient: () => client })).rejects.toThrow('530');
    expect(client.close).toHaveBeenCalled();
  });
});

/** A one-member deflated ZIP, as the export is published. */
function zipOf(name: string, content: Buffer): Buffer {
  const data = deflateRawSync(content);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuf.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

describe('fetchHhtEvents', () => {
  it('unpacks the XML member and maps its events', async () => {
    const { readFileSync } = await import('node:fs');
    const xml = readFileSync(new URL('./hht-fixtures/export-sample.xml', import.meta.url));
    const client = fakeClient(zipOf('export.xml', xml));
    const events = await fetchHhtEvents(SETTINGS, new Date('2030-05-10T10:00:00Z'), { createClient: () => client });
    expect(events.map((e) => e.id)).toEqual(['hht-900002', 'hht-900001', 'hht-900004']);
  });

  it('fails on an archive without an XML member', async () => {
    const client = fakeClient(zipOf('readme.txt', Buffer.from('hello')));
    await expect(fetchHhtEvents(SETTINGS, new Date(), { createClient: () => client })).rejects.toThrow(/no XML/);
  });
});
