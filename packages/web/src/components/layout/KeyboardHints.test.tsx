import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeyboardHints } from './KeyboardHints.js';

// --- Tests ---

describe('KeyboardHints', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
