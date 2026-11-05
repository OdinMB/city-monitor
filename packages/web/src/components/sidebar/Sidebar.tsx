import { useCallback, useRef } from 'react';
import { getAllCities } from '../../config/index.js';
import { useShowMapLayers } from '../../hooks/useShowMapLayers.js';
import { CitySwitcher } from '../layout/CitySwitcher.js';
import { SetupMenu } from '../layout/SetupMenu.js';
import { DataLayerToggles } from './DataLayerToggles.js';

/**
 * Scrolls its own content: the hero clips overflow, so a toggle list taller than
 * the hero would otherwise be unreachable at any scroll position.
 *
 * Opens with the city switcher when several cities are active, and the setup
 * menu: from sm up the top bar, which has both, is off screen until the page
 * scrolls. Setup mode's "Change map layers" moves focus to its first layer
 * (useShowMapLayers).
 */
export function Sidebar() {
  const aside = useRef<HTMLElement>(null);
  const focusLayers = useCallback(() => {
    aside.current?.querySelector<HTMLElement>('[data-layer-switches] button')?.focus();
  }, []);
  useShowMapLayers(true, focusLayers);

  return (
    <aside ref={aside} className="hidden lg:flex flex-col w-[260px] shrink-0 overflow-y-auto scrollbar-thin border-e border-[var(--border)]/50 bg-[var(--surface-1)]/90 backdrop-blur-sm p-4 pt-14 gap-6">
      <div className="flex items-center gap-2 -mx-1">
        <CitySwitcher cities={getAllCities()} placement="sidebar" hideWhenAlone className="relative min-w-0" />
        <SetupMenu placement="sidebar" className="ms-auto" />
      </div>
      <DataLayerToggles />
    </aside>
  );
}
