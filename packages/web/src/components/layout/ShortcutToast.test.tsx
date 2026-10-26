import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ShortcutToast } from './ShortcutToast.js';

const STORAGE_KEY = 'hasSeenKeyboardHints';

/** Stub matchMedia so that only the given queries match. */
function stubMatchMedia(matching: string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('ShortcutToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows the hint after a short delay on a device with a hover-capable pointer', () => {
    stubMatchMedia([]);
    render(<ShortcutToast />);
    expect(screen.queryByRole('button')).toBeNull();

    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByRole('button', { name: /keyboard shortcuts/i })).toBeTruthy();
  });

  it('hides the hint and records it as seen after the auto-dismiss delay', () => {
    stubMatchMedia([]);
    render(<ShortcutToast />);

    act(() => { vi.advanceTimersByTime(6500); });
    expect(screen.queryByRole('button')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('never renders on a touch-only device and leaves the seen flag unset', () => {
    stubMatchMedia(['(any-hover: none)']);
    const { container } = render(<ShortcutToast />);

    act(() => { vi.advanceTimersByTime(1500); });
    expect(container.innerHTML).toBe('');

    act(() => { vi.advanceTimersByTime(5000); });
    expect(container.innerHTML).toBe('');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not show again once the hint has been seen', () => {
    stubMatchMedia([]);
    localStorage.setItem(STORAGE_KEY, '1');
    const { container } = render(<ShortcutToast />);

    act(() => { vi.advanceTimersByTime(6500); });
    expect(container.innerHTML).toBe('');
  });
});
