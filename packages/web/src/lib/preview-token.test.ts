import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { capturePreviewToken, previewHeaders, previewToken, resetPreviewTokenForTests } from './preview-token.js';

function at(url: string) {
  const u = new URL(url, 'https://citymonitor.app');
  const replaceState = vi.fn();
  return {
    location: { search: u.search, pathname: u.pathname, hash: u.hash } as Location,
    history: { state: null, replaceState } as unknown as History,
    replaceState,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  resetPreviewTokenForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('preview token', () => {
  it('sends no header without a token', () => {
    const { location, history } = at('/hamburg');
    capturePreviewToken(location, history);
    expect(previewHeaders()).toEqual({});
  });

  it('keeps the token from the address for the tab and takes it out of the address bar', () => {
    const { location, history, replaceState } = at('/hamburg?lang=de&preview=abc123#events');
    capturePreviewToken(location, history);
    expect(sessionStorage.getItem('hht-preview')).toBe('abc123');
    expect(previewHeaders()).toEqual({ 'X-Preview-Token': 'abc123' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/hamburg?lang=de#events');
  });

  it('ends the preview with an empty value', () => {
    sessionStorage.setItem('hht-preview', 'abc123');
    const { location, history } = at('/hamburg?preview=');
    capturePreviewToken(location, history);
    expect(previewToken()).toBeNull();
    expect(previewHeaders()).toEqual({});
  });

  it('works for the page load when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    const { location, history } = at('/hamburg?preview=abc123');
    expect(() => capturePreviewToken(location, history)).not.toThrow();
    expect(previewHeaders()).toEqual({ 'X-Preview-Token': 'abc123' });
  });
});
