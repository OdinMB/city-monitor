import { Skyline, type SkylineProps } from './Skyline.js';

/** A container gantry crane on its rails, its boom out over the water to the left. */
const CRANE =
  'M0 110V62h26v48h-3V66H3v44z' + // legs and portal
  'M-46 56h84v4h-84z' + // boom and back-reach
  'M3 50h18v6H3z' + // machinery house
  'M11 50V36h3v14z' + // apex
  'M11 36L-46 56h4l18-6L14 38zM14 36l24 20h-3L14 39z'; // stays

/** The same crane with its boom raised. */
const CRANE_RAISED =
  'M0 110V62h26v48h-3V66H3v44z' +
  'M3 56h35v4H3z' +
  'M3 50h18v6H3z' +
  'M11 50V36h3v14z' +
  'M14 36l24 20h-3L14 39z' +
  'M2 58L-14 16h4L6 56z';

/** Hamburg: Elbphilharmonie, St. Michaelis, Heinrich-Hertz-Turm, Rathaus, St. Nikolai, harbour cranes. */
export function HamburgSkyline({ fill }: SkylineProps) {
  return (
    <Skyline fill={fill}>
      {/* Harbour cranes over stacked containers, left */}
      <path d="M0 110V98h50v12zM96 110V102h40v8z" />
      <path d={CRANE} transform="translate(60)" />
      <path d={CRANE_RAISED} transform="translate(150)" />

      {/* Blocks */}
      <path d="M190 110V80h22v30zM216 110V86h26v24z" />

      {/* Heinrich-Hertz-Turm: shaft, the pod, the upper platform and the mast */}
      <path d="M252 110l2-76h3l2 76zM246 54l3-4h13l3 4v6l-3 4h-13l-3-4zM250 42h11v4h-11zM254.5 34V10h2v24z" />

      {/* Blocks */}
      <path d="M268 110V76h28v34zM300 110V84h34v26z" />

      {/* St. Michaelis: nave, then the tower, its clock stage, belvedere, copper cupola, lantern and spire */}
      <path d="M338 110V84l10-8h60l10 8v26z" />
      <path d="M371 110V62h18v48zM370 62l1-2h18l1 2zM373 60V52h14v8zM372 52h16v-2h-16zM375 50v-6h10v6zM374 44h12v-2h-12zM376 42q4-9 8 0zM378.5 35v-4h3v4zM379 31L380 14l1 17z" />

      {/* Speicherstadt warehouses with their gables */}
      <path d="M422 110V80l6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6v30z" />

      {/* Elbphilharmonie: the brick Kaispeicher with the open Plaza between it and the glass hall, under the wave roof */}
      <path
        fillRule="evenodd"
        d="M503 110V85h-3V52C504 50 510 44 514 34C518 44 532 58 552 60C566 58 578 52 586 42C592 52 604 58 620 58C636 58 652 50 662 38C668 48 684 54 700 54V85h-3v25zM507 81h186v3H507z"
      />

      {/* HafenCity blocks */}
      <path d="M706 110V76h22v34zM732 110V86h22v24z" />

      {/* Rathaus: the hall with its corner turrets, the central tower and its copper spire */}
      <path d="M760 110V80l6-6h68l6 6v30zM762 74V64l2-4 2 4v10zM834 74V64l2-4 2 4v10z" />
      <path d="M794 80V52h12v28zM792 52h16l-3-5h-10zM796 47v-5h8v5zM797 42l3-12 3 12z" />

      {/* Blocks */}
      <path d="M846 110V78h20v32zM868 110V86h20v24z" />

      {/* St. Nikolai: the tower that stands, its corner pinnacles, the belfry and the needle spire */}
      <path d="M893 110V64h14v46zM892 66l1.5-10 1.5 10zM905 66l1.5-10 1.5 10zM895 64v-8h10v8zM895 56L900 14l5 42z" />

      {/* Blocks */}
      <path d="M912 110V80h26v30zM942 110V74h22v36zM968 110V86h28v24zM1000 110V82h20v28z" />

      {/* Harbour cranes, right, booms out to the right */}
      <path d={CRANE_RAISED} transform="translate(1050) scale(-1 1)" />
      <path d={CRANE} transform="translate(1150) scale(-1 1)" />
      <path d="M1056 110V100h44v10zM1152 110V96h48v14z" />
    </Skyline>
  );
}
