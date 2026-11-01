import { Skyline, type SkylineProps } from './Skyline.js';

/** A Kranhaus at x 0: the stair leg and the block it holds out over the Rheinauhafen. */
const KRANHAUS = 'M0 110V54h46v12H12v44z';

/**
 * One of the cathedral's west towers at x 0, 16 wide: the buttressed tower, its corner
 * pinnacles and the open-work spire, whose tip sits on the desktop clip at y 30.
 */
const DOM_TOWER = 'M0 110V70h1v-8h14v8h1v40zM0 64l1.5-10 1.5 10zM13 64l1.5-10 1.5 10zM3 62L8 30l5 32zM7.5 30v-5h1v5z';

/** One arch of the Hohenzollernbrücke at x 0, 90 wide: the arch, its hangers and the pier under it. */
const BRIDGE_ARCH =
  'M0 100Q45 56 90 100h-5Q45 64 5 100z' +
  'M14 100V89h2v11zM29 100V82h2v18zM44 100V80h2v20zM59 100V82h2v18zM74 100V89h2v11z' +
  'M-2 104h6v6h-6z';

/** Köln: the cathedral, Hohenzollernbrücke, Groß St. Martin, Colonius, KölnTriangle, Kranhäuser. */
export function KoelnSkyline({ fill }: SkylineProps) {
  return (
    <Skyline fill={fill}>
      {/* Kranhäuser in the Rheinauhafen */}
      <path d={KRANHAUS} transform="translate(24)" />
      <path d={KRANHAUS} transform="translate(86)" />
      <path d={KRANHAUS} transform="translate(148)" />

      {/* Blocks */}
      <path d="M200 110V80h24v30zM228 110V86h30v24z" />

      {/* Colonius: shaft, the stepped pulpit, the mast */}
      <path d="M276 110l2-66h4l2 66zM269 56h22v-6h-22zM267 50h26l-2-4h-22zM271 62h18l-4 6h-10zM271 56h18v6h-18zM279 46V8h2v38z" />

      {/* Old town houses */}
      <path d="M296 110V84l6-6 6 6v-2l6-6 6 6v28zM324 110V82l7-7 7 7v28zM342 110V86h34v24z" />

      {/* Groß St. Martin: church and apse, the crossing tower, its four turrets and pyramid roof */}
      <path d="M380 110V90h58v20zM438 110V92a10 10 0 0 1 12 0v18z" />
      <path d="M398 92V64h22v28zM400 64l9-20 9 20zM394 74V54h5v20zM419 74V54h5v20zM394 54l2.5-8 2.5 8zM419 54l2.5-8 2.5 8z" />

      {/* Blocks */}
      <path d="M456 110V84h30v26z" />

      {/* The cathedral: west towers and the portal gable between them, nave with buttress pinnacles, crossing spire, choir */}
      <path d={DOM_TOWER} transform="translate(498)" />
      <path d={DOM_TOWER} transform="translate(526)" />
      <path d="M513 110V70l7-8 7 8v40z" />
      <path d="M541 110V86l5-6h112l14 12v18zM672 110V92q14 0 18 10v8z" />
      <path d="M554 82l1.5-8 1.5 8zM565 82l1.5-8 1.5 8zM576 82l1.5-8 1.5 8zM587 82l1.5-8 1.5 8zM598 82l1.5-8 1.5 8zM630 82l1.5-8 1.5 8zM641 82l1.5-8 1.5 8zM652 82l1.5-8 1.5 8zM667 90l1.5-8 1.5 8zM680 94l1.5-8 1.5 8z" />
      <path d="M611 80l3-10 1.5-22 1.5 22 3 10z" />

      {/* Hohenzollernbrücke: deck and three arches, out over the Rhine */}
      <path d="M689 104.5v-5h288v5z" />
      <path d={BRIDGE_ARCH} transform="translate(696)" />
      <path d={BRIDGE_ARCH} transform="translate(790)" />
      <path d={BRIDGE_ARCH} transform="translate(884)" />

      {/* KölnTriangle on the Deutz bank, and Deutz blocks */}
      <path d="M990 110V56h20v54zM992 56v-4h16v4z" />
      <path d="M1016 110V80h28v30zM1048 110V88h30v22zM1082 110V76h24v34zM1110 110V86h40v24zM1154 110V80h26v30zM1184 110V90h16v20z" />
    </Skyline>
  );
}
