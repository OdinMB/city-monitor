import { createContext, type ReactNode } from 'react';

/**
 * What a tile's place in its section gives the tile, whichever component
 * renders it: its position for the reveal stagger, and setup mode's controls.
 */
export interface TileSlot {
  revealIndex: number;
  controls?: ReactNode;
}

export const TileSlotContext = createContext<TileSlot | null>(null);
