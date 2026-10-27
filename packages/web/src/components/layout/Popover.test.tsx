import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Popover } from './Popover.js';

// jsdom has no PointerEvent, so fireEvent.pointerDown would drop pointerType
// and a touch tap would look like a mouse click.
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? '';
  }
}

function Chip({ hover = false }: { hover?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        hover={hover}
        label="Weather"
        renderTrigger={(ref, props) => (
          <button ref={ref as React.Ref<HTMLButtonElement>} {...props} aria-label="Weather: 13°">
            13°
          </button>
        )}
      >
        <p>Forecast details</p>
      </Popover>
      <p>Elsewhere on the page</p>
    </>
  );
}

const chip = () => screen.getByRole('button', { name: 'Weather: 13°' });
const dialog = () => screen.queryByRole('dialog', { name: 'Weather' });
const pause = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

/** What a browser fires for one tap of a finger. */
function tap(el: Element) {
  fireEvent.pointerEnter(el, { pointerType: 'touch' });
  fireEvent.pointerDown(el, { pointerType: 'touch' });
  fireEvent.pointerUp(el, { pointerType: 'touch' });
  fireEvent.mouseEnter(el);
  fireEvent.mouseMove(el);
  fireEvent.mouseDown(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el, { detail: 1 });
}

/** Enter or Space on a focused button: the browser turns it into a click with no pointer. */
function pressKey(el: HTMLElement, key: 'Enter' | ' ') {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
  fireEvent.click(el, { detail: 0 });
}

describe('Popover', () => {
  const originalPointerEvent = window.PointerEvent;
  beforeAll(() => {
    window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
  });
  afterAll(() => {
    window.PointerEvent = originalPointerEvent;
  });

  it('tells assistive technology the chip opens a dialog, and whether it is open', async () => {
    render(<Chip />);
    expect(chip().getAttribute('aria-haspopup')).toBe('dialog');
    expect(chip().getAttribute('aria-expanded')).toBe('false');
    expect(chip().hasAttribute('aria-controls')).toBe(false);

    fireEvent.click(chip());
    const popover = await screen.findByRole('dialog', { name: 'Weather' });
    expect(popover.textContent).toContain('Forecast details');
    expect(chip().getAttribute('aria-expanded')).toBe('true');
    expect(chip().getAttribute('aria-controls')).toBe(popover.id);
  });

  it('toggles on a click: the first opens it, the second closes it', async () => {
    render(<Chip />);
    fireEvent.click(chip());
    await screen.findByRole('dialog', { name: 'Weather' });

    fireEvent.click(chip());
    await waitFor(() => expect(dialog()).toBeNull());
    expect(chip().getAttribute('aria-expanded')).toBe('false');
  });

  it.each([true, false])('toggles on a touch tap and moves focus into it (hover preview %s)', async (hover) => {
    render(<Chip hover={hover} />);
    tap(chip());
    const popover = await screen.findByRole('dialog', { name: 'Weather' });
    await waitFor(() => expect(document.activeElement).toBe(popover));

    // Longer than the hover delays: the tap's own mouse events must not close it again.
    await pause(400);
    expect(dialog()).not.toBeNull();

    tap(chip());
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it.each([['Enter', 'Enter'], ['Space', ' ']] as const)(
    'opens from the keyboard with %s, and Escape closes it and puts focus back on the chip',
    async (_name, key) => {
      render(<Chip hover />);
      chip().focus();
      pressKey(chip(), key);

      const popover = await screen.findByRole('dialog', { name: 'Weather' });
      await waitFor(() => expect(document.activeElement).toBe(popover));
      expect(chip().getAttribute('aria-expanded')).toBe('true');

      fireEvent.keyDown(popover, { key: 'Escape' });
      await waitFor(() => expect(dialog()).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(chip()));
      expect(chip().getAttribute('aria-expanded')).toBe('false');
    },
  );

  it('closes on a press outside it', async () => {
    render(<Chip hover />);
    tap(chip());
    await screen.findByRole('dialog', { name: 'Weather' });

    const outside = screen.getByText('Elsewhere on the page');
    fireEvent.pointerDown(outside, { pointerType: 'touch' });
    fireEvent.mouseDown(outside);
    fireEvent.click(outside);
    await waitFor(() => expect(dialog()).toBeNull());
    expect(chip().getAttribute('aria-expanded')).toBe('false');
  });

  it('stays open when the press lands inside it', async () => {
    render(<Chip />);
    fireEvent.click(chip());
    const popover = await screen.findByRole('dialog', { name: 'Weather' });

    const inside = screen.getByText('Forecast details');
    fireEvent.pointerDown(inside, { pointerType: 'touch' });
    fireEvent.mouseDown(inside);
    fireEvent.click(inside);
    await pause(50);
    expect(dialog()).toBe(popover);
  });

  describe('data-popover-pinned (keeps the sliding top bar on screen)', () => {
    const pinned = () => chip().hasAttribute('data-popover-pinned');

    it.each([
      ['a click', (el: HTMLElement) => fireEvent.click(el, { detail: 1 })],
      ['a tap', tap],
      ['Enter', (el: HTMLElement) => pressKey(el, 'Enter')],
    ])('is set while %s holds it open, and cleared when it closes', async (_how, press) => {
      render(<Chip hover />);
      expect(pinned()).toBe(false);
      press(chip());
      await screen.findByRole('dialog', { name: 'Weather' });
      expect(pinned()).toBe(true);

      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await waitFor(() => expect(dialog()).toBeNull());
      expect(pinned()).toBe(false);
    });

    it('is not set by a hover preview, only once a click holds the preview open', async () => {
      render(<Chip hover />);
      fireEvent.mouseEnter(chip());
      await screen.findByRole('dialog', { name: 'Weather' });
      expect(chip().getAttribute('aria-expanded')).toBe('true');
      expect(pinned()).toBe(false);

      fireEvent.click(chip(), { detail: 1 });
      expect(pinned()).toBe(true);
    });
  });

  describe('with a mouse, when hover is on', () => {
    it('previews on hover without taking focus, and closes when the mouse leaves', async () => {
      render(<Chip hover />);
      fireEvent.mouseEnter(chip());
      const popover = await screen.findByRole('dialog', { name: 'Weather' });
      await pause(50);
      expect(document.activeElement).not.toBe(popover);

      fireEvent.mouseLeave(chip());
      await waitFor(() => expect(dialog()).toBeNull());
    });

    it('keeps a previewed popover open on a click, and then through the mouse leaving', async () => {
      render(<Chip hover />);
      fireEvent.mouseEnter(chip());
      await screen.findByRole('dialog', { name: 'Weather' });

      fireEvent.click(chip(), { detail: 1 });
      fireEvent.mouseLeave(chip());
      await pause(400);
      expect(dialog()).not.toBeNull();

      fireEvent.click(chip(), { detail: 1 });
      await waitFor(() => expect(dialog()).toBeNull());
    });
  });

  it('does not open on hover when hover is off', async () => {
    render(<Chip />);
    fireEvent.mouseEnter(chip());
    await pause(400);
    expect(dialog()).toBeNull();
  });
});
