import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SWIPE_MS, pointsOutside, runSwipe, SECOND_FINGER_GAP, SWIPE_MOVES, swipeEvents } from '../lib/swipe.mjs';

const points = (event) => event.touchPoints.map(({ x, y, id }) => [id, x, y]);

describe('swipeEvents', () => {
  it('one finger: down at the start, evenly along the way, up at the end', () => {
    const events = swipeEvents({ from: [300, 400], to: [100, 400] });
    assert.equal(events.length, SWIPE_MOVES + 2);
    assert.deepEqual(events.map((e) => e.type), ['touchStart', ...Array(SWIPE_MOVES).fill('touchMove'), 'touchEnd']);
    assert.deepEqual(points(events[0]), [[0, 300, 400]]);
    assert.deepEqual(points(events[1]), [[0, 280, 400]]);
    assert.deepEqual(points(events.at(-2)), [[0, 100, 400]], 'the last move ends on the point given');
    assert.deepEqual(events.at(-1), { type: 'touchEnd', touchPoints: [] });
  });

  it('two fingers: the second keeps the gap beside the first, at right angles to the swipe, and moves with it', () => {
    for (const [from, to] of [[[300, 400], [100, 400]], [[200, 600], [200, 200]], [[50, 50], [250, 250]]]) {
      const events = swipeEvents({ from, to, fingers: 2 });
      const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
      for (const event of events.slice(0, -1)) {
        const [[, x0, y0], [id1, x1, y1]] = points(event);
        assert.equal(id1, 1);
        assert.ok(Math.abs(Math.hypot(x1 - x0, y1 - y0) - SECOND_FINGER_GAP) < 0.05, `${event.type} gap`);
        assert.ok(Math.abs((x1 - x0) * dx + (y1 - y0) * dy) < 0.05 * Math.hypot(dx, dy), `${event.type} across the swipe`);
      }
      assert.deepEqual(points(events.at(-2))[0], [0, ...to]);
      assert.deepEqual(events.at(-1).touchPoints, []);
    }
  });

  it('refuses a swipe that goes nowhere and a finger count other than one or two', () => {
    assert.throws(() => swipeEvents({ from: [10, 10], to: [10, 10] }), /two different points/);
    for (const fingers of [0, 3, '2']) assert.throws(() => swipeEvents({ from: [0, 0], to: [10, 0], fingers }), /one finger or two/);
  });
});

describe('pointsOutside', () => {
  it('names each finger outside the viewport, once', () => {
    const size = { width: 390, height: 844 };
    assert.deepEqual(pointsOutside(swipeEvents({ from: [300, 400], to: [100, 400] }), size), []);
    assert.deepEqual(pointsOutside(swipeEvents({ from: [380, 400], to: [100, 400] }), size), []);
    assert.deepEqual(pointsOutside(swipeEvents({ from: [300, 400], to: [390, 400], moves: 1 }), size), ['finger 1 at (390, 400)']);
    // Swiping right, the second finger rests below the first
    assert.deepEqual(pointsOutside(swipeEvents({ from: [100, 820], to: [300, 820], fingers: 2, moves: 1 }), size), ['finger 2 at (100, 860)', 'finger 2 at (300, 860)']);
    assert.deepEqual(pointsOutside(swipeEvents({ from: [300, 20], to: [100, 20], fingers: 2, moves: 1 }), size), ['finger 2 at (300, -20)', 'finger 2 at (100, -20)']);
  });
});

/**
 * Enough of a Playwright page for runSwipe: a CDP session recording what it
 * is sent, an element with a bounding box, waits recorded instead of taken.
 */
function fakePage({ box = { x: 20, y: 300, width: 350, height: 120 }, viewport = { width: 390, height: 844 }, failOn } = {}) {
  const sent = [];
  const waits = [];
  const located = [];
  const session = {
    detached: false,
    async send(method, params) {
      if (failOn && params.type === failOn) throw new Error(`${failOn} failed`);
      sent.push([method, params]);
    },
    async detach() { this.detached = true; },
  };
  const element = {
    scrolled: false,
    async scrollIntoViewIfNeeded() { this.scrolled = true; },
    async boundingBox() { return box; },
  };
  const page = {
    viewportSize: () => viewport,
    waitForTimeout: async (ms) => { waits.push(ms); },
    context: () => ({ newCDPSession: async (p) => { assert.equal(p, page); return session; } }),
  };
  const locate = (p, step) => { located.push(step.selector ?? step.text); return element; };
  return { page, session, element, sent, waits, located, locate };
}

describe('runSwipe', () => {
  it('sends the touch events through the page\'s CDP session, paced over its duration, and detaches', async () => {
    const f = fakePage();
    await runSwipe(f.page, { action: 'swipe', from: [300, 400], to: [60, 400] }, { touch: true, timeout: 1000, locate: f.locate });
    assert.ok(f.sent.every(([method]) => method === 'Input.dispatchTouchEvent'));
    assert.deepEqual(f.sent.map(([, e]) => e), swipeEvents({ from: [300, 400], to: [60, 400] }));
    assert.equal(f.waits.length, SWIPE_MOVES + 1);
    assert.ok(Math.abs(f.waits.reduce((a, b) => a + b, 0) - DEFAULT_SWIPE_MS) < 1e-6);
    assert.equal(f.session.detached, true);
    assert.deepEqual(f.located, [], 'no element without a selector or text');
  });

  it('with a selector or text, counts from the element\'s top-left corner after scrolling it into view', async () => {
    const f = fakePage();
    await runSwipe(f.page, { action: 'swipe', text: 'Karte', from: [300, 60], to: [40, 60], fingers: 2, ms: 0 }, { touch: true, timeout: 1000, locate: f.locate });
    assert.deepEqual(f.located, ['Karte']);
    assert.equal(f.element.scrolled, true);
    assert.deepEqual(f.sent.map(([, e]) => e), swipeEvents({ from: [320, 360], to: [60, 360], fingers: 2 }));
    assert.deepEqual(f.waits, [], 'ms 0: no pauses');
  });

  it('needs a touch viewport, a visible element and points inside the viewport, and sends nothing otherwise', async () => {
    const opts = (f, touch = true) => ({ touch, timeout: 1000, locate: f.locate });
    let f = fakePage();
    await assert.rejects(runSwipe(f.page, { from: [300, 400], to: [60, 400] }, opts(f, false)), /touch viewport/);
    assert.deepEqual(f.sent, []);
    f = fakePage({ box: null });
    await assert.rejects(runSwipe(f.page, { selector: 'canvas', from: [10, 10], to: [60, 10] }, opts(f)), /not visible/);
    assert.deepEqual(f.sent, []);
    f = fakePage();
    await assert.rejects(runSwipe(f.page, { selector: 'canvas', from: [10, 10], to: [400, 10] }, opts(f)), /finger 1 at \(420, 310\) is outside the viewport/);
    assert.deepEqual(f.sent, []);
  });

  it('a swipe cut short lifts its fingers and still detaches', async () => {
    const f = fakePage({ failOn: 'touchMove' });
    await assert.rejects(runSwipe(f.page, { from: [300, 400], to: [60, 400], ms: 0 }, { touch: true, timeout: 1000, locate: f.locate }), /touchMove failed/);
    assert.deepEqual(f.sent.map(([, e]) => e.type), ['touchStart', 'touchCancel']);
    assert.deepEqual(f.sent.at(-1)[1].touchPoints, []);
    assert.equal(f.session.detached, true);
  });
});
