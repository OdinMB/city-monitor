/**
 * The swipe step: a touch drag from one point to another with one finger or
 * two. Playwright's own touch input only taps (`tap`, `touchscreen.tap`), so
 * the drag goes to Chromium the way that tap does: as trusted touch input
 * through the DevTools protocol (Input.dispatchTouchEvent), on a CDP session
 * of the page. Chromium takes several touch points at once, so two fingers
 * work. Nothing here makes a request.
 */

/** Positions after the first, evenly spaced, the end included. */
export const SWIPE_MOVES = 10;
/** How far the second finger rests from the first, at right angles to the swipe (CSS px). */
export const SECOND_FINGER_GAP = 40;
/** How long a swipe takes by default, from the first touch to lifting off (ms). */
export const DEFAULT_SWIPE_MS = 300;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The protocol's touch events for a swipe from `from` to `to` ([x, y] in CSS
 * pixels of the viewport): a touchStart, `moves` touchMoves ending on `to`
 * and a touchEnd. A second finger keeps `gap` px beside the first, at right
 * angles to the swipe, and moves with it.
 */
export function swipeEvents({ from, to, fingers = 1, moves = SWIPE_MOVES, gap = SECOND_FINGER_GAP }) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) throw new Error('a swipe needs two different points');
  if (fingers !== 1 && fingers !== 2) throw new Error('a swipe uses one finger or two');
  const beside = fingers === 2 ? [(-dy / length) * gap, (dx / length) * gap] : null;
  const pointsAt = (t) => {
    const x = from[0] + dx * t;
    const y = from[1] + dy * t;
    const first = { x: round2(x), y: round2(y), id: 0 };
    return beside ? [first, { x: round2(x + beside[0]), y: round2(y + beside[1]), id: 1 }] : [first];
  };
  return [
    { type: 'touchStart', touchPoints: pointsAt(0) },
    ...Array.from({ length: moves }, (_, i) => ({ type: 'touchMove', touchPoints: pointsAt((i + 1) / moves) })),
    { type: 'touchEnd', touchPoints: [] },
  ];
}

/** The touch points of `events` outside a viewport of `size`, as "finger N at (x, y)"; [] when every one is inside. */
export function pointsOutside(events, { width, height }) {
  const outside = [];
  for (const { touchPoints } of events) {
    for (const { x, y, id } of touchPoints) {
      if (x < 0 || y < 0 || x >= width || y >= height) outside.push(`finger ${id + 1} at (${x}, ${y})`);
    }
  }
  return [...new Set(outside)];
}

/**
 * Runs one swipe step on a Playwright page. `step.from` and `step.to` are
 * [x, y] in CSS pixels: of the viewport, or, with a selector or text, from
 * the top-left corner of that element, which is scrolled into view first.
 * `step.fingers` is 1 (default) or 2, `step.ms` the time it takes. Needs a
 * touch viewport; `locate(page, step)` finds the element.
 */
export async function runSwipe(page, step, { touch, timeout, locate }) {
  if (!touch) throw new Error('swipe needs a touch viewport (a width under 768)');
  let origin = [0, 0];
  if (step.selector !== undefined || step.text !== undefined) {
    const element = locate(page, step);
    await element.scrollIntoViewIfNeeded({ timeout });
    const box = await element.boundingBox({ timeout });
    if (!box) throw new Error('the element to swipe on is not visible');
    origin = [box.x, box.y];
  }
  const at = ([x, y]) => [origin[0] + x, origin[1] + y];
  const events = swipeEvents({ from: at(step.from), to: at(step.to), fingers: step.fingers ?? 1 });
  const size = page.viewportSize();
  const outside = size ? pointsOutside(events, size) : [];
  if (outside.length > 0) throw new Error(`swipe: ${outside[0]} is outside the viewport`);

  const pauseMs = (step.ms ?? DEFAULT_SWIPE_MS) / (events.length - 1);
  const cdp = await page.context().newCDPSession(page);
  let down = false;
  try {
    for (const [index, event] of events.entries()) {
      if (index > 0 && pauseMs > 0) await page.waitForTimeout(pauseMs);
      await cdp.send('Input.dispatchTouchEvent', event);
      down = event.type !== 'touchEnd';
    }
  } finally {
    // A swipe cut short lifts its fingers, so the next step starts with none down
    if (down) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {});
    await cdp.detach().catch(() => {});
  }
}
