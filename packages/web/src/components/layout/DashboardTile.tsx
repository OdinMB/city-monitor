import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsDesktop } from '../../hooks/useMediaQuery.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useBathingOffSeason } from '../../hooks/useBathingOffSeason.js';
import { useLiftTileShown } from '../../hooks/useLiftTileShown.js';
import { useEventsTileShown } from '../../hooks/useEventsTileShown.js';
import { tileTitle } from '../../lib/setup-labels.js';
import type { TileId } from '../../lib/tile-setups.js';
import { Tile } from './Tile.js';
import { AiLabel } from '../AiLabel.js';
import { BriefingStrip } from '../strips/BriefingStrip.js';
import { NewsStrip } from '../strips/NewsStrip.js';
import { EventsStrip } from '../strips/EventsStrip.js';
import { TransitStrip } from '../strips/TransitStrip.js';
import { AirQualityStrip } from '../strips/AirQualityStrip.js';
import { WeatherStrip } from '../strips/WeatherStrip.js';
import { PoliticalStrip } from '../strips/PoliticalStrip.js';
import { WaterLevelStrip } from '../strips/WaterLevelStrip.js';
import { FloodStatusStrip } from '../strips/FloodStatusStrip.js';
import { LiftOutagesStrip } from '../strips/LiftOutagesStrip.js';
import { ElectricityStrip } from '../strips/ElectricityStrip.js';
import { SoilMoistureStrip } from '../strips/SoilMoistureStrip.js';
import { BathingStrip } from '../strips/BathingStrip.js';
import { AppointmentsStrip } from '../strips/AppointmentsStrip.js';
import { BudgetStrip } from '../strips/BudgetStrip.js';
import { LaborMarketStrip } from '../strips/LaborMarketStrip.js';
import { WastewaterStrip } from '../strips/WastewaterStrip.js';
import { CrisisStrip } from '../strips/CrisisStrip.js';
import { FeuerwehrStrip } from '../strips/FeuerwehrStrip.js';
import { PollenStrip } from '../strips/PollenStrip.js';
import { CouncilMeetingsStrip } from '../strips/CouncilMeetingsStrip.js';
import { PopulationStrip } from '../strips/PopulationStrip.js';

/**
 * How each dashboard tile renders, by id: its card (title, span, expand
 * behaviour) and its strip. Which tiles a city has and where they go is
 * lib/tile-setups.ts; this is only what one looks like. The support strip is
 * no tile (SupportStrip.tsx).
 */

interface TileProps {
  title: string;
  cityId: string;
  /** Tiles that start expanded on desktop start collapsed on phones. */
  isDesktop: boolean;
}

function BathingTile({ title }: TileProps) {
  const { t } = useTranslation();
  const { id: cityId } = useCityConfig();
  const offSeason = useBathingOffSeason(cityId);
  const badge = offSeason ? (
    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium badge-caution">
      {t('panel.bathing.offSeason')}
    </span>
  ) : undefined;
  return (
    <Tile title={title} titleBadge={badge} span={1} expandable>
      {(expanded) => <BathingStrip expanded={expanded} />}
    </Tile>
  );
}

/** KVB's lists (Köln) and DB stations; hidden while a DB-only city has no data (useLiftTileShown). */
export function LiftOutagesTile() {
  const { t } = useTranslation();
  if (!useLiftTileShown()) return null;
  return (
    <Tile title={t('panel.liftOutages.title')} span={1} expandable>
      {(expanded) => <LiftOutagesStrip expanded={expanded} />}
    </Tile>
  );
}

/** Public events; Hamburg Tourismus' only while the API returns some (useEventsTileShown). */
export function EventsTile() {
  const { t } = useTranslation();
  if (!useEventsTileShown()) return null;
  return (
    <Tile title={t('panel.events.title')} span={2}>
      <EventsStrip />
    </Tile>
  );
}

// Each Tile's `span` below must match TILE_SPANS (lib/tile-setups.ts), which sizes its section.
const TILES: Record<TileId, (props: TileProps) => ReactNode> = {
  briefing: ({ title }) => (
    <Tile title={title} titleBadge={<AiLabel />} span={2} rowSpan={2}>
      <BriefingStrip />
    </Tile>
  ),
  news: ({ title }) => (
    <Tile title={title} span={2}>
      <NewsStrip />
    </Tile>
  ),
  weather: ({ title, isDesktop }) => (
    <Tile title={title} span={1} expandable defaultExpanded={isDesktop}>
      {(expanded) => <WeatherStrip expanded={expanded} />}
    </Tile>
  ),
  airQuality: ({ title, isDesktop }) => (
    <Tile title={title} span={1} expandable defaultExpanded={isDesktop}>
      {(expanded) => <AirQualityStrip expanded={expanded} />}
    </Tile>
  ),
  transit: ({ title, isDesktop }) => (
    <Tile title={title} span={1} expandable defaultExpanded={isDesktop}>
      {(expanded, setExpanded) => <TransitStrip expanded={expanded} onExpand={() => setExpanded(true)} />}
    </Tile>
  ),
  liftOutages: () => <LiftOutagesTile />,
  pollen: ({ title }) => (
    <Tile title={title} span={1} expandable>
      {(expanded) => <PollenStrip expanded={expanded} />}
    </Tile>
  ),
  floodStatus: ({ title }) => (
    <Tile title={title} span={1}>
      <FloodStatusStrip />
    </Tile>
  ),
  events: () => <EventsTile />,
  appointments: ({ title, isDesktop }) => (
    <Tile title={title} span={1} expandable defaultExpanded={isDesktop}>
      {(expanded, setExpanded) => <AppointmentsStrip expanded={expanded} onExpand={() => setExpanded(true)} />}
    </Tile>
  ),
  bathing: (props) => <BathingTile {...props} />,
  crisis: ({ title, cityId, isDesktop }) => (
    <Tile title={title} span={1} expandable defaultExpanded={isDesktop}>
      {(expanded, setExpanded) => <CrisisStrip cityId={cityId} expanded={expanded} onExpand={() => setExpanded(true)} />}
    </Tile>
  ),
  wastewater: ({ title }) => (
    <Tile title={title} span={1} expandable>
      {(expanded) => <WastewaterStrip expanded={expanded} />}
    </Tile>
  ),
  electricity: ({ title }) => (
    <Tile title={title} span={1} expandable>
      {(expanded) => <ElectricityStrip expanded={expanded} />}
    </Tile>
  ),
  waterLevels: ({ title }) => (
    <Tile title={title} span={1}>
      <WaterLevelStrip />
    </Tile>
  ),
  councilMeetings: ({ title }) => (
    <Tile title={title} span={2}>
      <CouncilMeetingsStrip />
    </Tile>
  ),
  political: ({ title }) => (
    <Tile title={title} expandable>
      {(expanded, setExpanded) => <PoliticalStrip expanded={expanded} onExpand={() => setExpanded(true)} />}
    </Tile>
  ),
  laborMarket: ({ title, isDesktop }) => (
    <Tile title={title} span={1} expandable defaultExpanded={isDesktop}>
      {() => <LaborMarketStrip />}
    </Tile>
  ),
  population: ({ title }) => (
    <Tile title={title} span={1}>
      <PopulationStrip />
    </Tile>
  ),
  budget: ({ title }) => (
    <Tile title={title} span={2}>
      <BudgetStrip />
    </Tile>
  ),
  feuerwehr: ({ title }) => (
    <Tile title={title} span={1} expandable>
      {(expanded) => <FeuerwehrStrip expanded={expanded} />}
    </Tile>
  ),
  soilMoisture: ({ title }) => (
    <Tile title={title} span={1} expandable>
      {(expanded) => <SoilMoistureStrip expanded={expanded} />}
    </Tile>
  ),
};

/**
 * One dashboard tile, as its id renders. Memoised: a change to its section
 * (a collapse, a rename in setup mode) reaches the card through
 * TileSlotContext without rendering the strip again.
 */
export const DashboardTile = memo(function DashboardTile({ id }: { id: TileId }) {
  const { t } = useTranslation();
  const { id: cityId } = useCityConfig();
  const isDesktop = useIsDesktop();
  const render = TILES[id];
  return <>{render({ title: tileTitle(t, id, cityId), cityId, isDesktop })}</>;
});
