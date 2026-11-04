/**
 * A feed description cut down to a plain-text teaser. For feeds whose
 * permission covers headline and teaser only, while the feed itself carries
 * the full text as HTML (München's Rathaus Umschau): the classifier, the
 * digest, the API and Postgres then never see more than the teaser.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? match;
  });
}

export function toTeaser(html: string | undefined, maxChars: number): string | undefined {
  if (!html) return undefined;
  const text = decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  if (text.length <= maxChars) return text;

  const room = text.slice(0, maxChars - 1);
  const lastSpace = room.lastIndexOf(' ');
  const cut = lastSpace > 0 ? room.slice(0, lastSpace) : room;
  return `${cut.trimEnd()}…`;
}
