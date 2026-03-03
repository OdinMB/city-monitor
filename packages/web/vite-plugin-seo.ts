/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Vite plugin that generates per-route HTML files with correct <head> meta tags
 * at build time. Crawlers (Facebook, Twitter, Google) that don't execute JS will
 * receive the correct OG title/description for each static route.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import type { Plugin } from 'vite';

interface PageMeta {
  /** Route path, e.g. '/imprint' */
  path: string;
  title: string;
  description: string;
  /** OG image filename relative to public/, e.g. 'og-berlin.png'. Overrides the default. */
  ogImage?: string;
}

export function seoPlugin(pages: PageMeta[], baseUrl?: string): Plugin {
  return {
    name: 'vite-plugin-seo',
    apply: 'build',
    closeBundle() {
      const distDir = resolve(process.cwd(), 'dist');
      const templatePath = resolve(distDir, 'index.html');

      let template: string;
      try {
        template = readFileSync(templatePath, 'utf-8');
      } catch {
        console.warn('[vite-plugin-seo] Could not read dist/index.html — skipping SEO HTML generation.');
        return;
      }

      for (const page of pages) {
        let html = template
          .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
          .replace(
            /<meta name="description" content="[^"]*" \/>/,
            `<meta name="description" content="${escapeAttr(page.description)}" />`,
          )
          .replace(
            /<meta property="og:title" content="[^"]*" \/>/,
            `<meta property="og:title" content="${escapeAttr(page.title)}" />`,
          )
          .replace(
            /<meta property="og:description" content="[^"]*" \/>/,
            `<meta property="og:description" content="${escapeAttr(page.description)}" />`,
          );

        // Replace og:image if page specifies one
        if (page.ogImage && baseUrl) {
          const imgUrl = `${baseUrl}/${page.ogImage}`;
          html = html
            .replace(
              /<meta property="og:image" content="[^"]*" \/>/,
              `<meta property="og:image" content="${escapeAttr(imgUrl)}" />`,
            )
            .replace(
              /<meta name="twitter:image" content="[^"]*" \/>/,
              `<meta name="twitter:image" content="${escapeAttr(imgUrl)}" />`,
            );
        }

        // Inject og:url and canonical link if baseUrl is provided
        if (baseUrl) {
          const fullUrl = `${baseUrl}${page.path}`;
          html = html.replace(
            '</head>',
            `    <meta property="og:url" content="${escapeAttr(fullUrl)}" />\n    <link rel="canonical" href="${escapeAttr(fullUrl)}" />\n  </head>`,
          );
        }

        // Write to dist/{path}/index.html
        const cleanPath = page.path.replace(/^\//, '').replace(/\/$/, '');
        const outDir = resolve(distDir, cleanPath);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(resolve(outDir, 'index.html'), html, 'utf-8');
      }

      // Generate sitemap.xml if baseUrl is provided
      if (baseUrl) {
        const today = new Date().toISOString().split('T')[0];
        const DASHBOARD_ROUTES = ['/', '/berlin', '/hamburg'];
        const allRoutes = [
          ...DASHBOARD_ROUTES.map((path) => ({ path, changefreq: 'always' as const, priority: '1.0' })),
          ...pages
            .filter((p) => !DASHBOARD_ROUTES.includes(p.path))
            .map((p) => ({ path: p.path, changefreq: 'monthly' as const, priority: '0.5' })),
        ];

        const sitemap = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...allRoutes.map(
            (r) =>
              `  <url>\n    <loc>${escapeHtml(baseUrl + r.path)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`,
          ),
          '</urlset>',
        ].join('\n');

        writeFileSync(resolve(distDir, 'sitemap.xml'), sitemap, 'utf-8');
        console.log(`[vite-plugin-seo] Generated sitemap.xml with ${allRoutes.length} URLs.`);
      }

      console.log(`[vite-plugin-seo] Generated ${pages.length} route HTML files.`);
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
