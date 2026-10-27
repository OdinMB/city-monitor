import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadStyle } from './base.js';

// loadStyle caches by URL for the page's lifetime, so each test asks for its own.
let n = 0;
const nextUrl = () => `https://styles.test/${++n}/style.json`;

const style = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background' },
    { id: 'road_label', type: 'symbol', source: 'carto', layout: {} },
  ],
};

describe('loadStyle', () => {
  let restoreFetch: (() => void) | undefined;

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

  /** Answer the next fetches in order; any further fetch fails the test. */
  function answer(...responses: Array<() => Promise<Response>>) {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('unexpected fetch');
    });
    for (const respond of responses) spy.mockImplementationOnce(respond);
    restoreFetch = () => spy.mockRestore();
    return spy;
  }

  it('returns the style with unwanted layers hidden, and fetches it once', async () => {
    const fetch = answer(async () => new Response(JSON.stringify(style)));
    const url = nextUrl();

    const loaded = await loadStyle(url);
    expect(loaded.layers.find((l) => l.id === 'background')?.layout).toBeUndefined();
    expect(loaded.layers.find((l) => l.id === 'road_label')?.layout).toEqual({ visibility: 'none' });

    expect(await loadStyle(url)).toBe(loaded);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects on an error response, and asks again next time', async () => {
    const fetch = answer(
      async () => new Response('Service Unavailable', { status: 503 }),
      async () => new Response(JSON.stringify(style)),
    );
    const url = nextUrl();

    await expect(loadStyle(url)).rejects.toThrow('503');
    await expect(loadStyle(url)).resolves.toMatchObject({ version: 8 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects on an error response whose body is JSON', async () => {
    answer(async () => new Response(JSON.stringify({ message: 'not found' }), { status: 404 }));
    await expect(loadStyle(nextUrl())).rejects.toThrow('404');
  });

  it('rejects when the request does not get through', async () => {
    answer(async () => { throw new TypeError('Failed to fetch'); });
    await expect(loadStyle(nextUrl())).rejects.toThrow('Failed to fetch');
  });

  it('rejects when the body is not JSON', async () => {
    answer(async () => new Response('<html>captive portal</html>'));
    await expect(loadStyle(nextUrl())).rejects.toThrow();
  });

  it('rejects when the JSON is not a style', async () => {
    answer(async () => new Response(JSON.stringify({ message: 'ok' })));
    await expect(loadStyle(nextUrl())).rejects.toThrow('no layers');
  });
});
