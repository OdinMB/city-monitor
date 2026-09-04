import { describe, it, expect } from 'vitest';
import { safeUrl } from './safe-url';

describe('safeUrl', () => {
  it('passes through http and https addresses unchanged', () => {
    expect(safeUrl('https://www.berlin.de/news/1')).toBe('https://www.berlin.de/news/1');
    expect(safeUrl('http://example.org/a?b=c#d')).toBe('http://example.org/a?b=c#d');
  });

  it('rejects script-bearing schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('JavaScript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeUrl('vbscript:msgbox(1)')).toBeUndefined();
  });

  it('rejects schemes obfuscated with whitespace or control characters', () => {
    // The URL parser strips these exactly as a navigating browser does, so the
    // scheme is still recognised.
    expect(safeUrl('  javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('java\nscript:alert(1)')).toBeUndefined();
    expect(safeUrl('java\tscript:alert(1)')).toBeUndefined();
  });

  it('rejects other non-web schemes that could leave the browser', () => {
    expect(safeUrl('file:///etc/passwd')).toBeUndefined();
    expect(safeUrl('mailto:someone@example.org')).toBeUndefined();
  });

  it('returns undefined for empty and missing values', () => {
    expect(safeUrl('')).toBeUndefined();
    expect(safeUrl(null)).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
  });

  it('allows relative paths, which cannot carry a scheme', () => {
    expect(safeUrl('/berlin')).toBe('/berlin');
    expect(safeUrl('sources')).toBe('sources');
  });
});
