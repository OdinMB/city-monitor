import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SourceText } from './SourceText.js';

afterEach(cleanup);

describe('SourceText', () => {
  it('isolates the text and lets its first letter set its direction', () => {
    render(<p>Warnung: <SourceText>[Synthetisch] Amtliche WARNUNG vor STURMBÖEN.</SourceText></p>);
    const run = screen.getByText('[Synthetisch] Amtliche WARNUNG vor STURMBÖEN.');
    expect(run.tagName).toBe('BDI');
    expect(run.getAttribute('dir')).toBe('auto');
  });

  it('renders as the element that clamps the text, so the cut lands at its end', () => {
    render(<SourceText as="p" className="line-clamp-2">Gleisarbeiten zwischen Ostkreuz und Warschauer Straße.</SourceText>);
    const run = screen.getByText('Gleisarbeiten zwischen Ostkreuz und Warschauer Straße.');
    expect(run.tagName).toBe('P');
    expect(run.getAttribute('dir')).toBe('auto');
    expect(run.className).toBe('line-clamp-2');
  });
});
