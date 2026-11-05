/**
 * Polizei Bayern press releases (polizei.bayern.de). The Polizeipräsidium
 * München's RSS feed lists one item per "Medieninformation" bulletin, titled
 * only with its date and with no report text; each bulletin page holds several
 * numbered reports, each headed "<number>. <headline> – <place>". This module
 * splits a bulletin page into one SafetyReport per report.
 *
 * Use is allowed by the Polizeipräsidium München (2026-11-05): the feed polled
 * at most every 15 minutes, for a list and map points with credit and link.
 * Searches (`/fahndung`, above all for missing persons) are excluded because
 * they are often withdrawn, so they are dropped here: never show them.
 */
import type { SafetyReport } from '@city-monitor/shared';
import { decodeHTML } from 'entities';
import { hashString } from './hash.js';
import { toTeaser } from './teaser.js';
import { utcOffsetMs } from './traffic-count-parsers.js';

/** Report texts are cut to a teaser; the bulletin page is linked for the rest. */
export const BULLETIN_TEASER_CHARS = 300;

const SEARCH_PATTERN = /fahndung|vermisst|abgängig/i;

/** True for a link or text that is a search, which the police asked not to spread. */
export function isSearch(text: string): boolean {
  return SEARCH_PATTERN.test(text);
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * The feed's pubDate carries no zone ("Wed, 4 Nov 2026 15:53:00"): it is
 * München's local time. A date with a zone is taken as it is.
 */
export function parseBayernPubDate(value: string): string {
  const m = /^\s*(?:\w{3},\s*)?(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(value);
  if (!m || MONTHS[m[2]] === undefined) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }
  const wall = Date.UTC(Number(m[3]), MONTHS[m[2]], Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  // The offset at the wall-clock instant read as UTC is right except within the
  // hour of a clock change, where a press release is not likely.
  return new Date(wall - utcOffsetMs(wall, 'Europe/Berlin')).toISOString();
}

const HEADING = /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi;
const NUMBERED = /^\d+\.\s*(.+)$/;
/** The place after the headline's last spaced dash, unless it is the whole city. */
function placeOf(headline: string): string | undefined {
  const separator = [...headline.matchAll(/ [–—-] /g)].at(-1);
  if (!separator) return undefined;
  const place = headline.slice(separator.index! + separator[0].length).trim();
  if (!place || /stadtgebiet/i.test(place)) return undefined;
  return place;
}

/**
 * The numbered reports on a bulletin page. A report runs from its heading to
 * the next heading or the end of the page's content section. Reports whose
 * headline names a search are left out.
 */
export function parseBulletin(html: string, bulletin: { url: string; publishedAt: string }): SafetyReport[] {
  const headings = [...html.matchAll(HEADING)];
  const reports: SafetyReport[] = [];
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const text = decodeHTML(heading[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    const numbered = NUMBERED.exec(text);
    if (!numbered) continue;
    const title = numbered[1].trim();

    const start = heading.index! + heading[0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index! : html.length;
    let body = html.slice(start, end);
    const sectionEnd = body.indexOf('</section>');
    if (sectionEnd >= 0) body = body.slice(0, sectionEnd);
    const description = toTeaser(body, BULLETIN_TEASER_CHARS) ?? '';

    // By headline only: report texts often say a search ("Fahndung") followed.
    if (isSearch(title)) continue;

    reports.push({
      id: hashString(bulletin.url + title),
      title,
      description,
      publishedAt: bulletin.publishedAt,
      url: bulletin.url,
      district: placeOf(title),
    });
  }
  return reports;
}
