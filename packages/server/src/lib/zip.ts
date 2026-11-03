/**
 * Reads one file out of a ZIP archive held in memory, as a stream, so a large
 * member (the Unfallatlas CSV is 42 MB unpacked) is never held whole. Stored
 * and deflated members only, no ZIP64: enough for the archives the jobs fetch.
 */
import { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** The end record is 22 bytes plus a comment of up to 65,535. */
const EOCD_MAX_DISTANCE = 22 + 0xffff;

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

/** The members listed in the archive's central directory; throws when `buf` is not a ZIP. */
export function listZipEntries(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - EOCD_MAX_DISTANCE); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP archive (no end of central directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIGNATURE) throw new Error('corrupt ZIP central directory');
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    entries.push({
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      localOffset: buf.readUInt32LE(p + 42),
      name: buf.toString('utf8', p + 46, p + 46 + nameLength),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The member's contents as a stream of bytes. */
export function openZipEntry(buf: Buffer, entry: ZipEntry): Readable {
  if (entry.compressedSize === 0xffffffff || entry.localOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported');
  const p = entry.localOffset;
  if (buf.readUInt32LE(p) !== LOCAL_SIGNATURE) throw new Error(`corrupt ZIP local header for ${entry.name}`);
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Readable.from([data]);
  if (entry.method === 8) return Readable.from([data]).pipe(createInflateRaw());
  throw new Error(`unsupported ZIP compression method ${entry.method} for ${entry.name}`);
}
