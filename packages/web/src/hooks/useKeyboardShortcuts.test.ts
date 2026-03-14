import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts.js';

// --- Mocks ---

const mockToggleTheme = vi.fn();
vi.mock('./useTheme.js', () => ({
  useTheme: () => ({ theme: 'light', toggle: mockToggleTheme }),
}));

const mockToggleLayer = vi.fn();
const mockSetActiveLayers = vi.fn();
vi.mock('./useCommandCenter.js', () => ({
  useCommandCenter: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      toggleLayer: mockToggleLayer,
      setActiveLayers: mockSetActiveLayers,
    }),
}));

// --- Helpers ---

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...opts });
  document.dispatchEvent(event);
}

// --- Tests ---

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset activeElement to body so isInputFocused returns false
    (document.activeElement as HTMLElement)?.blur?.();
  });

  it('returns hintsOpen as false initially', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    expect(result.current.hintsOpen).toBe(false);
  });

  it('returns openHints and closeHints callbacks', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    expect(typeof result.current.openHints).toBe('function');
    expect(typeof result.current.closeHints).toBe('function');
  });

  // --- D key: toggle dark mode ---

  it('toggles dark mode when D is pressed', () => {
    renderHook(() => useKeyboardShortcuts());
    act(() => fireKey('d'));
    expect(mockToggleTheme).toHaveBeenCalledOnce();
  });

  it('toggles dark mode when uppercase D is pressed', () => {
    renderHook(() => useKeyboardShortcuts());
    act(() => fireKey('D'));
    expect(mockToggleTheme).toHaveBeenCalledOnce();
  });

  // --- Number keys: toggle layers ---

  it('toggles layer for keys 1-9', () => {
    const layerOrder = [
      'warnings', 'news', 'traffic', 'weather', 'air-quality',
      'noise', 'water', 'emergencies', 'social',
    ];
    renderHook(() => useKeyboardShortcuts());

    for (let i = 1; i <= 9; i++) {
      act(() => fireKey(String(i)));
      expect(mockToggleLayer).toHaveBeenCalledWith(layerOrder[i - 1]);
    }
    expect(mockToggleLayer).toHaveBeenCalledTimes(9);
  });

  // --- 0 key: clear all layers ---

  it('clears all layers when 0 is pressed', () => {
    renderHook(() => useKeyboardShortcuts());
    act(() => fireKey('0'));
    expect(mockSetActiveLayers).toHaveBeenCalledOnce();
    const arg = mockSetActiveLayers.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Set);
    expect(arg.size).toBe(0);
  });

  // --- ? key: toggle hints ---

  it('opens hints when ? is pressed', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    expect(result.current.hintsOpen).toBe(false);
    act(() => fireKey('?'));
    expect(result.current.hintsOpen).toBe(true);
  });

  it('closes hints when ? is pressed again', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    act(() => fireKey('?'));
    expect(result.current.hintsOpen).toBe(true);
    act(() => fireKey('?'));
    expect(result.current.hintsOpen).toBe(false);
  });

  // --- Escape key ---

  it('closes hints when Escape is pressed and hints are open', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    act(() => fireKey('?')); // open hints
    expect(result.current.hintsOpen).toBe(true);
    act(() => fireKey('Escape'));
    expect(result.current.hintsOpen).toBe(false);
  });

  it('does nothing when Escape is pressed and hints are closed', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    act(() => fireKey('Escape'));
    expect(result.current.hintsOpen).toBe(false);
    // No errors, no side effects
    expect(mockToggleTheme).not.toHaveBeenCalled();
    expect(mockToggleLayer).not.toHaveBeenCalled();
  });

  // --- openHints / closeHints callbacks ---

  it('openHints sets hintsOpen to true', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    act(() => result.current.openHints());
    expect(result.current.hintsOpen).toBe(true);
  });

  it('closeHints sets hintsOpen to false', () => {
    const { result } = renderHook(() => useKeyboardShortcuts());
    act(() => result.current.openHints());
    act(() => result.current.closeHints());
    expect(result.current.hintsOpen).toBe(false);
  });

  // --- Ignores input-focused events ---

  it('ignores key events when an input element is focused', () => {
    renderHook(() => useKeyboardShortcuts());
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => fireKey('d'));
    expect(mockToggleTheme).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('ignores key events when a textarea is focused', () => {
    renderHook(() => useKeyboardShortcuts());
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    act(() => fireKey('d'));
    expect(mockToggleTheme).not.toHaveBeenCalled();

    document.body.removeChild(textarea);
  });

  it('ignores key events when a select element is focused', () => {
    renderHook(() => useKeyboardShortcuts());
    const select = document.createElement('select');
    document.body.appendChild(select);
    select.focus();

    act(() => fireKey('d'));
    expect(mockToggleTheme).not.toHaveBeenCalled();

    document.body.removeChild(select);
  });

  it('ignores key events when a contenteditable element is focused', () => {
    renderHook(() => useKeyboardShortcuts());
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.tabIndex = 0;
    // jsdom doesn't implement isContentEditable, so we define it manually
    Object.defineProperty(div, 'isContentEditable', { value: true });
    document.body.appendChild(div);
    div.focus();

    act(() => fireKey('d'));
    expect(mockToggleTheme).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  // --- Ignores modifier keys ---

  it('ignores key events with ctrlKey', () => {
    renderHook(() => useKeyboardShortcuts());
    act(() => fireKey('d', { ctrlKey: true }));
    expect(mockToggleTheme).not.toHaveBeenCalled();
  });

  it('ignores key events with metaKey', () => {
    renderHook(() => useKeyboardShortcuts());
    act(() => fireKey('d', { metaKey: true }));
    expect(mockToggleTheme).not.toHaveBeenCalled();
  });

  it('ignores key events with altKey', () => {
    renderHook(() => useKeyboardShortcuts());
    act(() => fireKey('d', { altKey: true }));
    expect(mockToggleTheme).not.toHaveBeenCalled();
  });

  // --- Cleanup ---

  it('removes event listener on unmount', () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useKeyboardShortcuts());
    unmount();
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    spy.mockRestore();
  });
});
