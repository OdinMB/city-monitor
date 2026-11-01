import { Skyline, type SkylineProps } from './Skyline.js';

/** Berlin: TV Tower, Brandenburg Gate, Cathedral, buildings. */
export function BerlinSkyline({ fill }: SkylineProps) {
  return (
    <Skyline fill={fill}>
      {/* Buildings left cluster */}
      <rect x="0" y="70" width="40" height="50" />
      <rect x="45" y="60" width="35" height="60" />
      <rect x="85" y="75" width="30" height="45" />
      <rect x="120" y="65" width="45" height="55" />
      <rect x="170" y="72" width="28" height="48" />

      {/* TV Tower (Fernsehturm): the tapering shaft, the sphere, the antenna */}
      <polygon points="255,120 257.5,60 262.5,60 265,120" />
      <circle cx="260" cy="51" r="11" />
      <rect x="258.5" y="22" width="3" height="20" />
      <rect x="259.25" y="6" width="1.5" height="17" />

      {/* Buildings center-left, lower towards Pariser Platz */}
      <rect x="300" y="68" width="40" height="52" />
      <rect x="345" y="58" width="50" height="62" />
      <rect x="400" y="82" width="35" height="38" />

      {/* Brandenburg Gate: wide and low, about 65 m by 26 m. Six columns, the widest passage in the middle */}
      <rect x="472" y="91" width="5" height="29" />
      <rect x="487" y="91" width="5" height="29" />
      <rect x="502" y="91" width="5" height="29" />
      <rect x="521" y="91" width="5" height="29" />
      <rect x="536" y="91" width="5" height="29" />
      <rect x="551" y="91" width="5" height="29" />
      {/* Entablature */}
      <rect x="469" y="87" width="90" height="5" />
      {/* Attic, stepped up in the middle under the Quadriga */}
      <polygon points="474,88 554,88 554,83 532,83 529,79 499,79 496,83 474,83" />
      {/* Quadriga and Victoria with her staff */}
      <rect x="505" y="75" width="18" height="5" />
      <rect x="512.5" y="71" width="3" height="5" />
      <rect x="516.5" y="68" width="1" height="8" />

      {/* Buildings center-right */}
      <rect x="580" y="80" width="35" height="40" />
      <rect x="620" y="70" width="45" height="50" />
      <rect x="670" y="62" width="30" height="58" />

      {/* Berliner Dom (Cathedral): the body, four corner towers with their domes, the drum, main dome, lantern and cross */}
      <rect x="732" y="80" width="86" height="40" />
      <rect x="732" y="64" width="14" height="20" />
      <rect x="804" y="64" width="14" height="20" />
      <ellipse cx="739" cy="64" rx="7" ry="6" />
      <ellipse cx="811" cy="64" rx="7" ry="6" />
      <rect x="738" y="54" width="2" height="6" />
      <rect x="810" y="54" width="2" height="6" />
      <rect x="755" y="62" width="40" height="20" />
      <ellipse cx="775" cy="62" rx="20" ry="18" />
      <rect x="772" y="38" width="6" height="8" />
      <rect x="774" y="30" width="2" height="9" />
      <rect x="771.5" y="33" width="7" height="2" />

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
