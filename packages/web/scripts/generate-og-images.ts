/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Generates Open Graph images (1200×630) for social media previews.
 * Uses Satori (HTML→SVG) and resvg (SVG→PNG).
 *
 * Usage: npx tsx scripts/generate-og-images.ts
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const WIDTH = 1200;
const HEIGHT = 630;

// Fetch Inter font from Google Fonts (TTF)
async function loadFonts() {
  const [regular, bold] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then(
      (r) => r.arrayBuffer(),
    ),
    fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then(
      (r) => r.arrayBuffer(),
    ),
  ]);
  return [
    { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const },
  ];
}

interface OgImageConfig {
  filename: string;
  claim: string;
  tagline: string;
  accent: string;
}

const IMAGES: OgImageConfig[] = [
  {
    filename: 'og-default.png',
    claim: 'Transit disruptions to air quality alerts. Real-time city intelligence.',
    tagline: 'City Monitor',
    accent: '#6366f1',
  },
  {
    filename: 'og-berlin.png',
    claim: 'Virus loads in wastewater to BVG disruptions. Berlin, live.',
    tagline: 'City Monitor — Berlin',
    accent: '#e11d48',
  },
  {
    filename: 'og-hamburg.png',
    claim: 'Elbe tidal levels to HVV disruptions. Real-time city intelligence for Hamburg.',
    tagline: 'City Monitor — Hamburg',
    accent: '#0284c7',
  },
];

/** Small 2×2 dashboard grid icon (matches favicon) */
function gridIcon(accent: string) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        width: '52px',
        height: '52px',
        gap: '4px',
      },
      children: [
        // Top-left — 60% fill
        { type: 'div', props: { style: { width: '24px', height: '24px', borderRadius: '3px', background: `linear-gradient(to top, ${accent} 60%, #374151 60%)` } } },
        // Top-right — full
        { type: 'div', props: { style: { width: '24px', height: '24px', borderRadius: '3px', backgroundColor: accent } } },
        // Bottom-left — full
        { type: 'div', props: { style: { width: '24px', height: '24px', borderRadius: '3px', backgroundColor: accent } } },
        // Bottom-right — 40% fill
        { type: 'div', props: { style: { width: '24px', height: '24px', borderRadius: '3px', background: `linear-gradient(to top, ${accent} 40%, #374151 40%)` } } },
      ],
    },
  };
}

function buildMarkup(config: OgImageConfig) {
  const { claim, tagline, accent } = config;

  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px',
        backgroundColor: '#030712',
        color: '#f9fafb',
        fontFamily: 'Inter',
        position: 'relative',
      },
      children: [
        // Accent bar at top
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '6px',
              background: `linear-gradient(90deg, ${accent}, ${accent}88)`,
            },
          },
        },
        // Top-left: grid icon + tagline
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '36px',
              left: '60px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            },
            children: [
              gridIcon(accent),
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '30px',
                    fontWeight: 700,
                    color: '#e5e7eb',
                    letterSpacing: '-0.01em',
                  },
                  children: tagline,
                },
              },
            ],
          },
        },
        // Main claim text
        {
          type: 'div',
          props: {
            style: {
              fontSize: '68px',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              maxWidth: '1080px',
            },
            children: claim,
          },
        },
        // Bottom-right: "No login …" + URL
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '36px',
              right: '60px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '6px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '20px',
                    fontWeight: 400,
                    color: '#6b7280',
                    letterSpacing: '0.02em',
                  },
                  children: 'No login. No paywall. Just data.',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '22px',
                    fontWeight: 400,
                    color: '#4b5563',
                  },
                  children: 'citymonitor.app',
                },
              },
            ],
          },
        },
      ],
    },
  };
}

async function main() {
  const fonts = await loadFonts();
  const outDir = resolve(import.meta.dirname, '..', 'public');
  mkdirSync(outDir, { recursive: true });

  for (const config of IMAGES) {
    const markup = buildMarkup(config);
    const svg = await satori(markup as Parameters<typeof satori>[0], {
      width: WIDTH,
      height: HEIGHT,
      fonts,
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
    });
    const png = resvg.render().asPng();

    const outPath = resolve(outDir, config.filename);
    writeFileSync(outPath, png);
    console.log(`[og] Generated ${config.filename} (${(png.length / 1024).toFixed(0)} KB)`);
  }

  console.log(`[og] Done — ${IMAGES.length} images generated.`);
}

main().catch((err) => {
  console.error('[og] Failed:', err);
  process.exit(1);
});
