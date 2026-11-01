import { getAllCities } from '../../config/index.js';
import { CitySwitcher } from '../layout/CitySwitcher.js';
import { DataLayerToggles } from './DataLayerToggles.js';

/**
 * Scrolls its own content: the hero clips overflow, so a toggle list taller than
 * the hero would otherwise be unreachable at any scroll position.
 *
 * Opens with the city switcher when several cities are active: from sm up the
 * top bar, which has one too, is off screen until the page scrolls.
 */
export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-[260px] shrink-0 overflow-y-auto scrollbar-thin border-e border-[var(--border)]/50 bg-[var(--surface-1)]/90 backdrop-blur-sm p-4 pt-14 gap-6">
      <CitySwitcher cities={getAllCities()} placement="sidebar" hideWhenAlone className="relative self-start -mx-1" />
      <DataLayerToggles />
    </aside>
  );
}
