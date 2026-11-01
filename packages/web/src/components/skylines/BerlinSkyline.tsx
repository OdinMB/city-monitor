import { Skyline, type SkylineProps } from './Skyline.js';

/** Berlin skyline: TV Tower, Brandenburg Gate, Cathedral, buildings */
export function BerlinSkyline({ fill }: SkylineProps) {
  return (
    <Skyline fill={fill}>
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
    </Skyline>
  );
}
