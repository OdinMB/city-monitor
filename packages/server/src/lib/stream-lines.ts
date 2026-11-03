/**
 * Line-by-line reading of large downloads, so a file of tens of MB is never
 * held whole as one string or one array of lines (.context/server.md,
 * "Memory at startup").
 */
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { StringDecoder } from 'node:string_decoder';

/** The text lines of a byte stream (UTF-8, LF or CRLF), without a leading BOM. */
export async function* streamLines(stream: AsyncIterable<unknown>): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  let rest = '';
  let first = true;
  for await (const chunk of stream) {
    rest += decoder.write(chunk as Buffer);
    if (first && rest.length > 0) {
      if (rest.charCodeAt(0) === 0xfeff) rest = rest.slice(1);
      first = false;
    }
    const parts = rest.split('\n');
    rest = parts.pop()!;
    for (const part of parts) yield part.replace(/\r$/, '');
  }
  rest += decoder.end();
  if (rest.length > 0) yield rest.replace(/\r$/, '');
}

/** The text lines of a fetch response's body, streamed as it arrives. */
export function responseLines(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error('response has no body');
  return streamLines(Readable.fromWeb(res.body as WebReadableStream));
}
