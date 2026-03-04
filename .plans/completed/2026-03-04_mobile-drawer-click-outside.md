# Mobile Drawer: Click Outside to Close

## Problem
The `MobileLayerDrawer` outer container uses `absolute inset-y-0 left-0`, which sizes it only as wide as the panel + tab handle. The backdrop (with `absolute inset-0`) fills that parent, but doesn't cover the rest of the viewport. Result: tapping outside the drawer (on the map, dashboard) doesn't close it.

## Fix
Change the outer container from `absolute inset-y-0 left-0` to `absolute inset-0`. Since it already has `pointer-events-none`, it won't interfere with map/dashboard interactions when the drawer is closed. When open, the backdrop (`pointer-events-auto`) will now cover the full viewport and catch taps outside the panel.

**One-line change in `packages/web/src/components/sidebar/MobileLayerDrawer.tsx`, line 63.**
