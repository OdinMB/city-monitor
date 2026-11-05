/**
 * Downloads Hamburg Tourismus' daily export (a ZIP holding hamburg25.xml)
 * over FTPS, explicit TLS on port 21, with the credentials HHT issued to City
 * Monitor. Only the compressed archive is held in memory (a few MB, capped);
 * the XML member is unpacked and parsed as a stream (hht-xml.ts).
 */
import { Writable } from 'node:stream';
import { Client } from 'basic-ftp';
import type { CityEvent } from '@city-monitor/shared';
import { listZipEntries, openZipEntry } from './zip.js';
import { parseHhtExport } from './hht-events.js';

const FTP_PORT = 21;
/** Idle timeout of the control and data connections */
const FTP_TIMEOUT_MS = 60_000;
/** The archive was about 6 MB in 2026; far past that, something is wrong. */
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

export interface HhtFtpSettings {
  host: string;
  file: string;
  user: string;
  password: string;
}

/** The part of basic-ftp's Client this module uses (tests pass a fake). */
export interface FtpClientLike {
  access(options: { host: string; port: number; user: string; password: string; secure: true }): Promise<unknown>;
  downloadTo(destination: Writable, fromRemotePath: string): Promise<unknown>;
  close(): void;
}

export interface HhtFtpOptions {
  createClient?: () => FtpClientLike;
  maxBytes?: number;
}

/**
 * Host and file from the configured `ftp://<host>/<file>` URL, each
 * overridable by HHT_FTP_HOST and HHT_FTP_FILE; null without HHT_FTP_USER and
 * HHT_FTP_PASSWORD, so a fork without an HHT contract skips the source.
 */
export function hhtFtpSettings(configUrl: string, env: Record<string, string | undefined> = process.env): HhtFtpSettings | null {
  const user = env.HHT_FTP_USER?.trim();
  const password = env.HHT_FTP_PASSWORD;
  if (!user || !password) return null;
  const url = new URL(configUrl);
  return {
    host: env.HHT_FTP_HOST?.trim() || url.hostname,
    file: env.HHT_FTP_FILE?.trim() || decodeURIComponent(url.pathname.replace(/^\//, '')),
    user,
    password,
  };
}

/** The archive's bytes; rejects past `maxBytes`, always closing the connection. */
export async function downloadHhtArchive(settings: HhtFtpSettings, options: HhtFtpOptions = {}): Promise<Buffer> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const client = options.createClient?.() ?? new Client(FTP_TIMEOUT_MS);
  const chunks: Buffer[] = [];
  let size = 0;
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) {
        callback(new Error(`HHT export larger than ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
      callback();
    },
  });
  try {
    await client.access({ host: settings.host, port: FTP_PORT, user: settings.user, password: settings.password, secure: true });
    await client.downloadTo(sink, settings.file);
  } finally {
    client.close();
  }
  return Buffer.concat(chunks);
}

/** Downloads the export and returns its Hamburg events for the next `lookaheadDays`. */
export async function fetchHhtEvents(
  settings: HhtFtpSettings,
  now: Date,
  options: HhtFtpOptions & { lookaheadDays?: number } = {},
): Promise<CityEvent[]> {
  const archive = await downloadHhtArchive(settings, options);
  const entry = listZipEntries(archive).find((e) => e.name.toLowerCase().endsWith('.xml'));
  if (!entry) throw new Error('HHT archive holds no XML file');
  return parseHhtExport(openZipEntry(archive, entry), now, options.lookaheadDays);
}
