import { DataLayerToggles } from './DataLayerToggles.js';

/**
 * Scrolls its own content: the hero clips overflow, so a toggle list taller than
 * the hero would otherwise be unreachable at any scroll position.
 */
export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-[260px] shrink-0 overflow-y-auto scrollbar-thin border-r border-[var(--border)]/50 bg-[var(--surface-1)]/90 backdrop-blur-sm p-4 pt-14 gap-6">
      <DataLayerToggles />
    </aside>
  );
}
