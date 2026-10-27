import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import i18n from 'i18next';
import { useShortcutSettings } from '../../hooks/useShortcutSettings.js';
import { KeyboardHints } from './KeyboardHints.js';

const initialShortcuts = useShortcutSettings.getState();

// --- Tests ---

describe('KeyboardHints', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useShortcutSettings.setState(initialShortcuts, true);
  });

  afterEach(async () => {
    // Unmount first, so the language switch re-renders nothing outside act().
    cleanup();
    await i18n.changeLanguage('en');
  });

  // --- Switching single-key shortcuts off (WCAG 2.1.4) ---

  it('has a switch for the single-key shortcuts, on by default', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    const toggle = screen.getByRole('switch', { name: 'Single-key shortcuts' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    // The state is in the switch, so its name stays the label alone.
    expect(toggle.textContent).toContain('On');
    expect(toggle.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(toggle.getAttribute('aria-describedby')!)!.textContent).toBe(i18n.t('shortcuts.singleKeyHint'));
  });

  it('turns the single-key shortcuts off and on again', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    const toggle = screen.getByRole('switch', { name: 'Single-key shortcuts' });
    fireEvent.click(toggle);
    expect(useShortcutSettings.getState().enabled).toBe(false);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.textContent).toContain('Off');
    fireEvent.click(toggle);
    expect(useShortcutSettings.getState().enabled).toBe(true);
  });

  it.each(['de', 'tr', 'ar'])('names the switch and its states in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<KeyboardHints open={true} onClose={onClose} />);
    const en = i18n.getFixedT('en');
    for (const key of ['shortcuts.singleKey', 'shortcuts.singleKeyHint', 'shortcuts.on', 'shortcuts.off']) {
      expect(i18n.t(key), key).not.toBe(en(key));
    }
    expect(screen.getByRole('switch', { name: i18n.t('shortcuts.singleKey') })).toBeTruthy();
  });

  // --- Focus ---

  it('moves focus into the dialog when it opens and back to where it was when it closes', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { rerender } = render(<KeyboardHints open={true} onClose={onClose} />);
    expect(document.activeElement).toBe(screen.getByRole('switch'));

    rerender(<KeyboardHints open={false} onClose={onClose} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('keeps Tab inside the dialog', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    const toggle = screen.getByRole('switch');
    const close = screen.getByRole('button', { name: 'Close' });

    close.focus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(toggle);

    fireEvent.keyDown(toggle, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);
  });

  it('keeps focus and Tab inside after a click on the dialog text', () => {
    // A click on plain text focuses the panel rather than the page behind,
    // and Tab from there goes to the first control, Shift+Tab to the last.
    render(<KeyboardHints open={true} onClose={onClose} />);
    const panel = screen.getByRole('dialog').firstElementChild as HTMLElement;
    const toggle = screen.getByRole('switch');
    const close = screen.getByRole('button', { name: 'Close' });

    panel.focus();
    expect(document.activeElement).toBe(panel);
    fireEvent.keyDown(panel, { key: 'Tab' });
    expect(document.activeElement).toBe(toggle);

    panel.focus();
    fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);
  });

  // --- Visibility ---

  it('renders nothing when open is false', () => {
    const { container } = render(<KeyboardHints open={false} onClose={onClose} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog when open is true', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  // --- Accessibility ---

  it('has aria-modal attribute', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
  });

  it('has an aria-label', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBeTruthy();
  });

  // --- Content ---

  it('displays the title translation key', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    // The test-setup initializes i18n with real English translations,
    // so we look for the translated text. If the key is missing it renders the key itself.
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toBeTruthy();
  });

  it('renders shortcut keys', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    const kbds = screen.getByRole('dialog').querySelectorAll('kbd');
    // 5 shortcuts: ?, D, 1-9, 0, Esc
    expect(kbds.length).toBe(5);
  });

  it('displays kbd elements with expected shortcut keys', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    const kbdTexts = Array.from(screen.getByRole('dialog').querySelectorAll('kbd')).map(
      (el) => el.textContent,
    );
    expect(kbdTexts).toContain('?');
    expect(kbdTexts).toContain('D');
    expect(kbdTexts).toContain('1-9');
    expect(kbdTexts).toContain('0');
    expect(kbdTexts).toContain('Esc');
  });

  // --- Close button ---

  it('calls onClose when close button is clicked', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // --- Backdrop click (click outside) ---

  it('calls onClose when the backdrop overlay is clicked', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    const overlay = screen.getByRole('dialog');
    // Simulate mousedown directly on the overlay (not a child)
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when clicking inside the dialog content', () => {
    render(<KeyboardHints open={true} onClose={onClose} />);
    const heading = screen.getByRole('dialog').querySelector('h2')!;
    fireEvent.mouseDown(heading);
    expect(onClose).not.toHaveBeenCalled();
  });

  // --- No listener when closed ---

  it('does not attach mousedown listener when closed', () => {
    const spy = vi.spyOn(document, 'addEventListener');
    render(<KeyboardHints open={false} onClose={onClose} />);
    const mousedownCalls = spy.mock.calls.filter(([event]) => event === 'mousedown');
    expect(mousedownCalls.length).toBe(0);
    spy.mockRestore();
  });
});
