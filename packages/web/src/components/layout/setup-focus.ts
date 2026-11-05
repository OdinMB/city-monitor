import type { TileId } from '../../lib/tile-setups.js';

/**
 * Where the setup controls hand focus: the setup menu's buttons (one per
 * placement on the page) and a tile's controls in setup mode.
 */

/** Where a setup menu button sits: the top bar (every width), the sidebar (`lg` up), the map's corner (`sm` to `lg`). */
export type SetupMenuPlacement = 'topbar' | 'sidebar' | 'map';

export const setupMenuButtonId = (placement: SetupMenuPlacement) => `setup-menu-${placement}`;

/**
 * Focus on the top bar's setup menu button, once the control that had it goes
 * (Done, the shared-setup notice). The bar is on screen at every width while
 * it holds keyboard focus (globals.css), and sticky on phones.
 */
export function focusSetupMenu(): void {
  document.getElementById(setupMenuButtonId('topbar'))?.focus({ preventScroll: true });
}

/**
 * Focus on the first of a tile's controls in setup mode that can take it (the
 * first or only tile of a section cannot move up). `TileControls` marks them
 * with `data-tile-controls`.
 */
export function focusTileControls(tile: TileId): void {
  document.querySelector(`[data-tile-controls="${tile}"]`)?.querySelector<HTMLElement>('button:not(:disabled), select')?.focus();
}
