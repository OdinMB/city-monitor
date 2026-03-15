import { DataLayerToggles } from './DataLayerToggles.js';

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-[260px] shrink-0 border-r border-[var(--border)]/50 bg-[var(--surface-1)]/90 backdrop-blur-sm p-4 pt-14 gap-6">
      <DataLayerToggles />
    </aside>
  );
}
