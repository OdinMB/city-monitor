/**
 * News source name → self-hosted favicon in `public/favicons/` (filename
 * without extension). Keys are the feed `name`s in the server's city configs
 * (`packages/server/src/config/cities/`); `news-favicons.test.ts` keeps the
 * two in step.
 */
export const FAVICON_SLUGS: Record<string, string> = {
  // Berlin
  rbb24: 'rbb24',
  Tagesspiegel: 'tagesspiegel',
  'Berliner Morgenpost': 'berliner-morgenpost',
  'Berliner Zeitung': 'berliner-zeitung',
  'taz Berlin': 'taz-berlin',
  'Polizei Berlin': 'polizei-berlin',
  'Gründerszene Berlin': 'gruenderszene',
  // Hamburg
  'NDR Hamburg': 'ndr-hamburg',
  'Hamburger Abendblatt': 'hamburger-abendblatt',
  MOPO: 'mopo',
  'hamburg.de News': 'hamburg-de-news',
};

/** URL of a news source's favicon, or null when the source has none. */
export function sourceFaviconUrl(sourceName: string): string | null {
  const slug = FAVICON_SLUGS[sourceName];
  return slug ? `/favicons/${slug}.png` : null;
}
