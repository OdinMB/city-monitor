import { lazy, Suspense, useRef } from 'react';
import { useIsDesktop } from '../../hooks/useMediaQuery.js';
import { useScrollParallax } from '../../hooks/useScrollParallax.js';
import { Sidebar } from '../sidebar/Sidebar.js';
import { MobileLayerDrawer } from '../sidebar/MobileLayerDrawer.js';
import { NinaBanner } from '../alerts/NinaBanner.js';
import { NewsMarquee } from './NewsMarquee.js';
import { TileSections } from './TileSections.js';
import { Skeleton } from './Skeleton.js';
import { ScrollIndicator } from './ScrollIndicator.js';
import { SkylineSeparator } from './SkylineSeparator.js';
import { ErrorBoundary } from 'react-error-boundary';
import { MapErrorFallback } from '../ErrorFallback.js';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { getAllCities } from '../../config/index.js';
import { CitySwitcher } from './CitySwitcher.js';
import { SetupMenu } from './SetupMenu.js';
import { MAP_HERO_ID } from '../../hooks/useShowMapLayers.js';

const CityMap = lazy(() =>
  import('../map/CityMap.js').then((m) => ({ default: m.CityMap })),
);

export function CommandLayout() {
  const { id: cityId } = useCityConfig();
  const cities = getAllCities();
  const isDesktop = useIsDesktop();
  const isPhone = !isDesktop;

  const dashboardRef = useRef<HTMLDivElement>(null);
  // The map column, with the warnings above the map, so the two move together.
  const mapColumnRef = useRef<HTMLDivElement>(null);
  useScrollParallax(mapColumnRef, 0.3);

  return (
    <>
      {/* Phones: warnings and the news ticker sit under the sticky top bar,
          above the map, so they are on the first screen. */}
      {isPhone && (
        <>
          <div className="p-4 empty:hidden">
            <NinaBanner />
          </div>
          <NewsMarquee reserveSpace />
        </>
      )}

      {/* Upper zone: hero map — one *visible* screen tall, not 100vh (see @utility h-hero).
          Phones get a shorter band so the first tiles show under it; vh is safe
          there because nothing is anchored to the bottom of the screen. The
          300px floor matches CityMap's min-height, which the hero would clip. */}
      <div id={MAP_HERO_ID} className="relative flex h-hero max-sm:h-[max(40vh,300px)] overflow-hidden">
        <Sidebar />
        <div ref={mapColumnRef} className="flex-1 min-w-0 flex flex-col">
          {/* From tablet width up, warnings open the map column, under the
              fixed news ticker (mt-12 clears its 2.25rem, outside the scrolling
              area), so they are on the first screen; the map takes the rest of
              the hero. They take at most 55% of the hero with that clearance
              and scroll beyond it, so several or long ones stay readable and
              the map keeps the rest, clear of the skyline and scroll indicator
              at its foot. */}
          {!isPhone && (
            <div className="hero-warnings mt-12 mb-3 px-4 max-h-[calc(55%_-_3rem)] overflow-y-auto shrink-0 empty:hidden">
              <NinaBanner />
            </div>
          )}
          <div className="flex-1 min-h-0 relative">
            {/* From sm to lg, where there is no sidebar, the city switcher and
                the setup menu sit on the map's top corner, so they are on the
                first screen while the top bar is off screen (Sidebar has them
                from lg up). Below the ticker, or at the map's edge when
                warnings push the map down (globals.css); under the layer
                drawer when that is open. With one city the menu alone keeps
                clear of the drawer's edge strip (its button's 2.25rem), which
                takes presses there. */}
            <div className="hero-corner absolute top-12 start-3 z-30 hidden sm:flex lg:hidden items-center gap-2">
              <CitySwitcher
                cities={cities}
                placement="map"
                hideWhenAlone
                className="relative p-0.5 rounded-lg border border-border bg-surface-1/90 backdrop-blur-sm shadow-lg"
              />
              <SetupMenu placement="map" className={cities.length < 2 ? 'ms-7' : ''} />
            </div>
            <ErrorBoundary FallbackComponent={MapErrorFallback}>
              <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><Skeleton lines={4} /></div>}>
                <CityMap />
              </Suspense>
            </ErrorBoundary>
            <MobileLayerDrawer />
          </div>
        </div>
        {/* Skyline + scroll indicator overlaid at bottom of hero, from tablet
            width up. Phones see the tiles below the shorter map already, and
            the skyline would only cover part of that small map, so they get
            neither. */}
        {!isPhone && (
          <div className="absolute bottom-0 inset-x-0 z-10 pointer-events-none">
            <ScrollIndicator targetRef={dashboardRef} />
            <SkylineSeparator cityId={cityId} />
          </div>
        )}
      </div>

      {/* Lower zone: the tile sections, from tablet width up with 1rem above them. */}
      <div ref={dashboardRef} className={`bg-surface-0 ${isPhone ? '' : 'pt-4'}`}>
        <TileSections />
      </div>
    </>
  );
}
