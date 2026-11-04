/**
 * The preview gate on Hamburg Tourismus' events. They are ingested and stored
 * like any source, but served only once HHT_EVENTS_PUBLIC is true, or to a
 * request that carries HHT_EVENTS_PREVIEW_TOKEN in the X-Preview-Token header,
 * so HHT can review the integration before it goes public. Every read path
 * that returns events goes through servedEvents(); see
 * .context/events-safety.md.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { CityEvent } from '@city-monitor/shared';

export const PREVIEW_TOKEN_HEADER = 'X-Preview-Token';
/** A shorter configured token admits no one, so a typo like "1" cannot open the gate. */
const MIN_TOKEN_LENGTH = 16;

type Env = Record<string, string | undefined>;

export function hhtEventsPublic(env: Env = process.env): boolean {
  return env.HHT_EVENTS_PUBLIC?.trim().toLowerCase() === 'true';
}

function sha256(text: string): Buffer {
  return createHash('sha256').update(text).digest();
}

/** Whether `sent` is the preview token, compared in constant time; never without a configured token. */
export function isHhtPreviewToken(sent: string | undefined, env: Env = process.env): boolean {
  const expected = env.HHT_EVENTS_PREVIEW_TOKEN?.trim();
  if (!expected || expected.length < MIN_TOKEN_LENGTH || !sent) return false;
  // Hashing first gives both sides one length, so the comparison leaks neither
  return timingSafeEqual(sha256(sent.trim()), sha256(expected));
}

/**
 * The events this request may see. HHT events are left out unless they are
 * public or the request carries the preview token; a previewed response is
 * marked `private, no-store`, so no shared cache, CDN or browser cache keeps
 * it, and every response varies on the token header.
 */
export function servedEvents(events: CityEvent[], req: Request, res: Response, env: Env = process.env): CityEvent[] {
  res.vary(PREVIEW_TOKEN_HEADER);
  if (hhtEventsPublic(env)) return events;
  if (isHhtPreviewToken(req.get(PREVIEW_TOKEN_HEADER), env)) {
    res.set('Cache-Control', 'private, no-store');
    return events;
  }
  return events.filter((e) => e.source !== 'hht');
}
