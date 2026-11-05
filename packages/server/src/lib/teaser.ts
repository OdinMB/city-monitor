/**
 * A feed description cut down to a plain-text teaser. For feeds whose
 * permission covers headline and teaser only, while the feed itself carries
 * the full text as HTML (München's Rathaus Umschau): the classifier, the
 * digest, the API and Postgres then never see more than the teaser. Also
 * HHT's event descriptions (hht-events.ts), whose HTML uses named entities
 * such as &uuml; and &bdquo;.
 */
import { decodeHTML } from 'entities';

export function toTeaser(html: string | undefined, maxChars: number): string | undefined {
  if (!html) return undefined;
  const text = decodeHTML(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  if (text.length <= maxChars) return text;

  const room = text.slice(0, maxChars - 1);
  const lastSpace = room.lastIndexOf(' ');
  const cut = lastSpace > 0 ? room.slice(0, lastSpace) : room;
  return `${cut.trimEnd()}…`;
}
