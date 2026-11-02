import { describe, it, expect } from 'vitest';
import { hvvLineStyle } from './hvv-lines.js';

describe('hvvLineStyle', () => {
  it('gives U- and S-Bahn lines the colours of hvv\'s icons', () => {
    expect(hvvLineStyle('U1')).toEqual({ background: '#006AB3', color: '#FFFFFF' });
    expect(hvvLineStyle('U3')).toEqual({ background: '#FFDD00', color: '#000000' });
    expect(hvvLineStyle('s3')?.background).toBe('#622181');
    expect(hvvLineStyle('S11')).toEqual({ background: '#FFFFFF', color: '#1A962B', border: '#1A962B' });
  });

  it('tells AKN, ferries, night, Xpress and other buses apart', () => {
    expect(hvvLineStyle('A1')?.background).toBe('#F29400');
    expect(hvvLineStyle('62')?.background).toBe('#009DD1');
    expect(hvvLineStyle('66')?.background).toBe('#E2001A');
    expect(hvvLineStyle('688')?.background).toBe('#000000');
    expect(hvvLineStyle('X22')?.background).toBe('#1A9628');
    expect(hvvLineStyle('X11')?.background).toBe('#E2001A');
    expect(hvvLineStyle('5')?.background).toBe('#E2001A');
  });

  it('leaves regional trains and unknown names to the generic badge', () => {
    expect(hvvLineStyle('RE7')).toBeNull();
    expect(hvvLineStyle('RB61')).toBeNull();
    expect(hvvLineStyle('hvv')).toBeNull();
  });
});
