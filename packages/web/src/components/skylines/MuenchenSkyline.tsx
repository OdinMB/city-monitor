import { Skyline, type SkylineProps } from './Skyline.js';

/** One of the Frauenkirche's towers at x 0, 20 wide: the square brick tower, its octagon, the domed hood and lantern. */
const FRAUENKIRCHE_TOWER = 'M0 110V58h20v52zM2 58V48h16v10zM2 48C-1 43 1 35 10 30c9 5 11 13 8 18zM9 30v-6h2v6z';

/** One of the Theatinerkirche's towers at x 0, 12 wide: the shaft and its scrolled helmet. */
const THEATINER_TOWER = 'M0 110V64h12v46zM0 64q0-6 4-8q-2-2 0-5l2-4 2 4q2 3 0 5q4 2 4 8zM5.5 47v-4h1v4z';

/** München: Allianz Arena, Olympiaturm, BMW tower, Theatinerkirche, Frauenkirche, Neues Rathaus. */
export function MuenchenSkyline({ fill }: SkylineProps) {
  return (
    <Skyline fill={fill}>
      {/* Allianz Arena: the inflated ring */}
      <path d="M40 110c-14-2-18-10-15-15 5-7 37-11 82-11s77 4 82 11c3 5-1 13-15 15z" />

      {/* Blocks */}
      <path d="M0 110V86h20v24zM204 110V82h26v28zM234 110V88h22v22zM260 110V76h24v34z" />

      {/* Olympiaturm: shaft, the ringed head, the mast */}
      <path d="M297 110l1.5-62h3l1.5 62zM291 60V48h18v12zM290 56h20v-2h-20zM290 51h20v-2h-20zM297 48v-6h6v6zM299 42V6h2v36z" />

      {/* Blocks */}
      <path d="M314 110V84h22v26z" />

      {/* BMW four-cylinder tower, hung above its narrow core, and the museum's bowl */}
      <path
        fillRule="evenodd"
        d="M349 110v-10h-9V77h1v-3h-1V55q0-3 3-3h28q3 0 3 3v19h-1v3h1v23h-9v10zM350.5 56h1.5v17h-1.5zM350.5 78h1.5v20h-1.5zM362 56h1.5v17H362zM362 78h1.5v20H362z"
      />
      <path d="M378 110v-8l-4-10q12-4 24 0l-4 10v8z" />

      {/* Blocks */}
      <path d="M402 110V80h22v30z" />

      {/* Theatinerkirche: the facade and its gable, the dome with drum and lantern, the twin towers */}
      <path d="M439 110V74h38v36zM442 75l16-9 16 9zM450 71v-9h16v9zM447 62q11-22 22 0zM456 52v-6h4v6zM455 46.5q3-5 6 0zM457.5 45v-7h1v7z" />
      <path d={THEATINER_TOWER} transform="translate(428)" />
      <path d={THEATINER_TOWER} transform="translate(476)" />

      {/* Blocks */}
      <path d="M492 110V80h24v30zM520 110V86h26v24zM550 110V74h24v36z" />

      {/* Frauenkirche: the twin towers, the gable of the nave between them */}
      <path d={FRAUENKIRCHE_TOWER} transform="translate(580)" />
      <path d={FRAUENKIRCHE_TOWER} transform="translate(616)" />
      <path d="M599 110V72l9-6 9 6v38z" />

      {/* Blocks */}
      <path d="M646 110V84h24v26zM674 110V76h22v34zM700 110V86h26v24z" />

      {/* Neues Rathaus: the hall with its row of gables, the tower with corner pinnacles, lantern and figure */}
      <path d="M730 110V80l4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6h20l4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6v30z" />
      <path d="M781 82V44h14v38zM779 46l1.5-8 1.5 8zM794 46l1.5-8 1.5 8zM783 44v-8h10v8zM783 36l5-6 5 6zM787.5 30v-4h1v4z" />

      {/* Blocks */}
      <path d="M850 110V82h24v28zM878 110V74h22v36zM904 110V86h32v24zM940 110V78h26v32zM970 110V88h24v22z" />
      <path d="M998 110V80h32v30zM1034 110V74h24v36zM1062 110V86h38v24zM1104 110V78h28v32zM1136 110V84h30v26zM1170 110V76h30v34z" />
    </Skyline>
  );
}
