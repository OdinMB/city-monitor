import { create } from 'zustand';

// Remembered only once someone flips the switch: 'off', or 'on' again.
const STORAGE_KEY = 'keyboard-shortcuts';

// With site storage blocked every access throws: the shortcuts then start on,
// and switching them off lasts for the current page view.
function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function storeEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage blocked: nothing to remember the setting in.
  }
}

interface ShortcutSettingsState {
  /**
   * Whether the single-key shortcuts (digits, D, ?) act. They can be switched
   * off in the Keyboard Shortcuts dialog (WCAG 2.1.4), for speech input and
   * anyone else whom stray single keys get in the way of.
   */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /** Whether the Keyboard Shortcuts dialog is open; shared so the layer list can open it too. */
  hintsOpen: boolean;
  setHintsOpen: (open: boolean) => void;
}

export const useShortcutSettings = create<ShortcutSettingsState>((set) => ({
  enabled: readEnabled(),
  setEnabled: (enabled) => {
    storeEnabled(enabled);
    set({ enabled });
  },
  hintsOpen: false,
  setHintsOpen: (hintsOpen) => set({ hintsOpen }),
}));
