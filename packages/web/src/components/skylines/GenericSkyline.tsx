import { Skyline, type SkylineProps } from './Skyline.js';

/** Generic city skyline for cities without a drawing of their own. */
export function GenericSkyline({ fill }: SkylineProps) {
  return (
    <Skyline fill={fill}>
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
    </Skyline>
  );
}
