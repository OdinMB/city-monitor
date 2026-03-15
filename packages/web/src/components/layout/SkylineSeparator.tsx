/**
 * SVG skyline silhouette separator between the hero map and dashboard tiles.
 * Berlin: TV Tower, Brandenburg Gate, Cathedral, generic buildings.
 * Hamburg: placeholder for future implementation.
 */

import { useEffect, useState, useCallback } from 'react';

interface SkylineSeparatorProps {
  cityId: string;
}

export function SkylineSeparator({ cityId }: SkylineSeparatorProps) {
  const [opacity, setOpacity] = useState(1);

  const handleScroll = useCallback(() => {
    const vh = window.innerHeight;
    const start = 50;
    const end = vh * 0.4;
    const scrollY = window.scrollY;

    if (scrollY <= start) {
      setOpacity(1);
    } else if (scrollY >= end) {
      setOpacity(0);
    } else {
      setOpacity(1 - (scrollY - start) / (end - start));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div
      className="relative w-full overflow-hidden pointer-events-none"
      aria-hidden="true"
      style={{ opacity }}
    >
      {/* Gradient backdrop so the silhouette contrasts against the map above */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent dark:from-white/15 dark:to-transparent" />
      {/* Mobile: slice preserves aspect ratio, crops from top */}
      <svg
        viewBox="0 0 1200 120"
        preserveAspectRatio="xMidYMax slice"
        className="relative w-full h-16 sm:hidden"
      >
        {cityId === 'berlin' ? <BerlinSkyline /> : <GenericSkyline />}
      </svg>
      {/* Desktop: stretch to fill — shorter without cropping buildings */}
      <svg
        viewBox="0 30 1200 90"
        preserveAspectRatio="none"
        className="relative w-full hidden sm:block sm:h-10 lg:h-12"
      >
        {cityId === 'berlin' ? <BerlinSkyline /> : <GenericSkyline />}
      </svg>
    </div>
  );
}

/** Berlin skyline: TV Tower, Brandenburg Gate, Cathedral, buildings */
function BerlinSkyline() {
  return (
    <g style={{ fill: 'var(--surface-0)' }}>
      {/* Base ground */}
      <rect x="0" y="110" width="1200" height="10" />

      {/* Buildings left cluster */}
      <rect x="0" y="70" width="40" height="50" />
      <rect x="45" y="60" width="35" height="60" />
      <rect x="85" y="75" width="30" height="45" />
      <rect x="120" y="65" width="45" height="55" />
      <rect x="170" y="72" width="28" height="48" />

      {/* TV Tower (Fernsehturm) — iconic needle */}
      <rect x="258" y="8" width="4" height="112" />
      <ellipse cx="260" cy="55" rx="14" ry="10" />
      <ellipse cx="260" cy="52" rx="10" ry="7" />

      {/* Buildings center-left */}
      <rect x="300" y="68" width="40" height="52" />
      <rect x="345" y="58" width="50" height="62" />
      <rect x="400" y="72" width="35" height="48" />

      {/* Brandenburg Gate — pillars with gaps, entablature on top */}
      {/* 6 pillars */}
      <rect x="482" y="58" width="5" height="62" />
      <rect x="493" y="58" width="5" height="62" />
      <rect x="504" y="58" width="5" height="62" />
      <rect x="515" y="58" width="5" height="62" />
      <rect x="526" y="58" width="5" height="62" />
      <rect x="537" y="58" width="5" height="62" />
      {/* Entablature (horizontal beam connecting pillars) */}
      <rect x="480" y="55" width="64" height="5" />
      {/* Pediment (triangular top) */}
      <polygon points="478,55 542,55 530,45 490,45" />
      {/* Quadriga on top */}
      <rect x="502" y="38" width="16" height="7" />

      {/* Buildings center-right */}
      <rect x="580" y="65" width="35" height="55" />
      <rect x="620" y="70" width="45" height="50" />
      <rect x="670" y="62" width="30" height="58" />

      {/* Berliner Dom (Cathedral) */}
      <rect x="740" y="55" width="70" height="65" />
      {/* Central dome */}
      <ellipse cx="775" cy="55" rx="25" ry="15" />
      {/* Cross on dome */}
      <rect x="773" y="36" width="4" height="12" />
      <rect x="769" y="40" width="12" height="3" />
      {/* Side towers */}
      <rect x="742" y="48" width="12" height="20" />
      <rect x="796" y="48" width="12" height="20" />

      {/* Buildings right cluster */}
      <rect x="850" y="68" width="40" height="52" />
      <rect x="895" y="72" width="50" height="48" />
      <rect x="950" y="64" width="35" height="56" />
      <rect x="990" y="70" width="28" height="50" />
      <rect x="1025" y="60" width="45" height="60" />
      <rect x="1075" y="74" width="35" height="46" />
      <rect x="1115" y="66" width="40" height="54" />
      <rect x="1160" y="72" width="40" height="48" />
    </g>
  );
}

/** Generic city skyline for cities without a custom design */
function GenericSkyline() {
  return (
    <g style={{ fill: 'var(--surface-0)' }}>
      <rect x="0" y="110" width="1200" height="10" />
      <rect x="50" y="70" width="40" height="50" />
      <rect x="100" y="55" width="50" height="65" />
      <rect x="160" y="65" width="35" height="55" />
      <rect x="220" y="50" width="45" height="70" />
      <rect x="300" y="60" width="40" height="60" />
      <rect x="370" y="45" width="55" height="75" />
      <rect x="450" y="55" width="40" height="65" />
      <rect x="520" y="65" width="50" height="55" />
      <rect x="600" y="50" width="45" height="70" />
      <rect x="680" y="60" width="35" height="60" />
      <rect x="750" y="45" width="55" height="75" />
      <rect x="830" y="55" width="40" height="65" />
      <rect x="900" y="65" width="50" height="55" />
      <rect x="980" y="55" width="45" height="65" />
      <rect x="1050" y="60" width="40" height="60" />
      <rect x="1120" y="70" width="50" height="50" />
    </g>
  );
}
