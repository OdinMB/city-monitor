import { describe, expect, it } from 'vitest';
import { nudgeIntoBox, popupMaxHeight, popupMaxWidth } from './popups.js';

describe('popupMaxHeight', () => {
  it('uses the room below a point near the top of the map', () => {
    // 600 px map, point at 50 px: 550 px below, less offset 10 + tip 10 + padding 24 + gap 8
    expect(popupMaxHeight(50, 600, 10)).toBe(498);
  });

  it('uses the room above a point near the bottom of the map', () => {
    expect(popupMaxHeight(550, 600, 10)).toBe(498);
  });

  it('never squeezes a popup below its minimum height', () => {
    expect(popupMaxHeight(40, 80, 16)).toBe(80);
  });
});

describe('popupMaxWidth', () => {
  it('keeps the requested width when the map is wide enough', () => {
    expect(popupMaxWidth('300px', 1200)).toBe('300px');
  });

  it('narrows a popup to the width of a phone-sized map', () => {
    expect(popupMaxWidth('300px', 280)).toBe('264px');
  });

  it('never narrows below its minimum width', () => {
    expect(popupMaxWidth('300px', 100)).toBe('160px');
  });
});

describe('nudgeIntoBox', () => {
  const map = { left: 0, top: 0, right: 400, bottom: 300 };

  it('leaves a popup that already fits alone', () => {
    expect(nudgeIntoBox({ left: 50, top: 50, right: 250, bottom: 150 }, map)).toEqual({ dx: 0, dy: 0 });
  });

  it('slides a popup back from the right and bottom edges', () => {
    expect(nudgeIntoBox({ left: 300, top: 200, right: 450, bottom: 320 }, map)).toEqual({ dx: -58, dy: -28 });
  });

  it('slides a popup back from the left and top edges', () => {
    expect(nudgeIntoBox({ left: -40, top: -10, right: 100, bottom: 90 }, map)).toEqual({ dx: 48, dy: 18 });
  });

  it('aligns a popup larger than the map with its start edge', () => {
    expect(nudgeIntoBox({ left: 20, top: 0, right: 500, bottom: 100 }, map).dx).toBe(-12);
  });
});
