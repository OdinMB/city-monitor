/**
 * The preview gate on Hamburg Tourismus' events. They are ingested and stored
 * like any source, but while HHT_PREVIEW_ONLY is true they are served only to
 * a request that carries HHT_EVENTS_PREVIEW_TOKEN in the X-Preview-Token
 * header, so HHT can review the integration before it goes public (contract
 * 3.2). Going public is a code change: set HHT_PREVIEW_ONLY to false once HHT
 * has approved in writing. HHT_EVENTS=false on the server (a source opt-out)
 * hides them from everyone, token or not. Every read path that returns events
 * goes through servedEvents(); see .context/events-safety.md.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { CityEvent } from '@city-monitor/shared';
import { isSourceEnabled } from './source-switch.js';

export const PREVIEW_TOKEN_HEADER = 'X-Preview-Token';
/** A shorter configured token admits no one, so a typo like "1" cannot open the gate. */
const MIN_TOKEN_LENGTH = 16;
/** True until HHT approves the integration; then false, in a one-line change. */
export const HHT_PREVIEW_ONLY = true;
/** Source opt-out: HHT_EVENTS=false hides HHT's events everywhere. */
export const HHT_EVENTS_SWITCH = 'HHT_EVENTS';

type Env = Record<string, string | undefined>;

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
 * The events this request may see. HHT events are left out when switched off,
 * and while in preview unless the request carries the preview token; a
 * previewed response is marked `private, no-store`, so no shared cache, CDN or
 * browser cache keeps it, and every response varies on the token header.
 */
export function servedEvents(
  events: CityEvent[],
  req: Request,
  res: Response,
  env: Env = process.env,
  previewOnly: boolean = HHT_PREVIEW_ONLY,
): CityEvent[] {
  res.vary(PREVIEW_TOKEN_HEADER);
  if (!isSourceEnabled(HHT_EVENTS_SWITCH, env)) return events.filter((e) => e.source !== 'hht');
  if (!previewOnly) return events;
  if (isHhtPreviewToken(req.get(PREVIEW_TOKEN_HEADER), env)) {
    res.set('Cache-Control', 'private, no-store');
    return events;
  }
  return events.filter((e) => e.source !== 'hht');
}
