/**
 * The static meta of every pre-rendered route: what `vite-plugin-seo.ts`
 * writes into each route's own index.html, and the sitemap. Pure, so
 * `vite.config.ts` can build the list from the active cities at build time.
 */

import type { WebCityConfig } from '@city-monitor/shared';

export interface PageMeta {
  /** Route path, e.g. '/imprint' */
  path: string;
  title: string;
  description: string;
  /** OG image filename relative to public/, e.g. 'og-berlin.png'. Overrides the default. */
  ogImage?: string;
  /** A dashboard (or the city picker): in the sitemap as changing always, at priority 1.0. */
  dashboard?: boolean;
}

/**
 * Each configured city's description and share image, written before the city
 * goes live: its pages are built, and listed in the sitemap, once it is in
 * `ACTIVE_CITY_IDS`. The image is `public/<ogImage>`, made by
 * `scripts/generate-og-images.ts` (its `IMAGES`).
 */
export const CITY_META: Readonly<Record<string, { description: string; ogImage: string }>> = {
  berlin: {
    description: 'Real-time Berlin dashboard: news, weather, transit, events, water levels, and more.',
    ogImage: 'og-berlin.png',
  },
  hamburg: {
    description: 'Real-time Hamburg dashboard: news, police reports, weather, air quality, Elbe tidal levels, and more.',
    ogImage: 'og-hamburg.png',
  },
  koeln: {
    description: 'Real-time Köln dashboard: weather, air quality, Rhine water levels, civil-protection alerts, pollen, and more.',
    ogImage: 'og-koeln.png',
  },
  muenchen: {
    description: 'Real-time München dashboard: weather, air quality, Isar flood status, civil-protection alerts, pollen, emergency pharmacies, and more.',
    ogImage: 'og-muenchen.png',
  },
};

/**
 * The home page, the static pages and two pages per active city. Throws for an
 * active city without an entry in CITY_META, or whose share image `hasImage`
 * says is missing, so a city cannot go live with blank or broken previews.
 */
export function seoPages(activeCities: readonly WebCityConfig[], hasImage: (file: string) => boolean): PageMeta[] {
  const cities = activeCities.map((city) => {
    const meta = Object.hasOwn(CITY_META, city.id) ? CITY_META[city.id] : undefined;
    if (!meta) throw new Error(`No page meta for the active city "${city.id}": add it to CITY_META in src/lib/seo-pages.ts.`);
    if (!hasImage(meta.ogImage)) {
      throw new Error(`public/${meta.ogImage} is missing for the active city "${city.id}": run npm run generate:og in packages/web.`);
    }
    return { ...city, ...meta };
  });
  const names = new Intl.ListFormat('en', { type: 'conjunction' }).format(cities.map((city) => city.name));

  return [
    {
      // The city picker (App.tsx), with more than one active city; with
      // one, / redirects to it. Its HTML is dist/index.html, which also
      // answers every route not listed here (render.yaml's rewrite).
      path: '/',
      title: 'City Monitor — Choose your city',
      description: `Real-time dashboards for ${names} from open data: news, weather, warnings, water levels and more.`,
      ogImage: 'og-default.png',
      dashboard: true,
    },
    {
      path: '/imprint',
      title: 'Legal Notice — City Monitor',
      description: 'Legal notice and contact information for City Monitor.',
    },
    {
      path: '/privacy',
      title: 'Privacy Policy — City Monitor',
      description: 'Privacy policy for City Monitor. No tracking cookies, no user tracking, privacy-friendly analytics.',
    },
    {
      path: '/no-ads-no-tracking',
      title: 'No Ads, No Tracking — City Monitor',
      description: 'City Monitor is free, open source, and respects your privacy. No ads, no tracking, no tracking cookies.',
    },
    ...cities.map((city) => ({
      path: `/${city.id}`,
      title: `City Monitor — ${city.name}`,
      description: city.description,
      ogImage: city.ogImage,
      dashboard: true,
    })),
    ...cities.map((city) => ({
      path: `/${city.id}/sources`,
      title: `Data Sources — City Monitor ${city.name}`,
      description: `All data sources used by City Monitor for ${city.name}.`,
      ogImage: city.ogImage,
    })),
  ];
}
