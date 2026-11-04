import { describe, it, expect } from 'vitest';
import { toTeaser } from './teaser.js';

describe('toTeaser', () => {
  it('strips HTML tags and collapses whitespace', () => {
    expect(toTeaser('<p>Das Bauzentrum <em><a href="https://x">lädt</a></em> ein.<br />\nMehr unter muenchen.de.</p>', 300))
      .toBe('Das Bauzentrum lädt ein. Mehr unter muenchen.de.');
  });

  it('decodes common HTML entities', () => {
    expect(toTeaser('Bau&nbsp;&amp;&nbsp;Verkehr &quot;neu&quot; &#228;&#x20AC;', 300)).toBe('Bau & Verkehr "neu" ä€');
  });

  it('leaves a short text as it is', () => {
    expect(toTeaser('Kurzer Text.', 300)).toBe('Kurzer Text.');
  });

  it('cuts a long text at a word boundary and marks the cut', () => {
    const teaser = toTeaser('Eins zwei drei vier fünf sechs', 16);
    expect(teaser).toBe('Eins zwei drei…');
    expect(teaser!.length).toBeLessThanOrEqual(16);
  });

  it('cuts mid-word when the text has no space to cut at', () => {
    expect(toTeaser('Donaudampfschifffahrt', 10)).toBe('Donaudamp…');
  });

  it('returns undefined for missing or empty text', () => {
    expect(toTeaser(undefined, 300)).toBeUndefined();
    expect(toTeaser('<p> </p>', 300)).toBeUndefined();
  });
});
