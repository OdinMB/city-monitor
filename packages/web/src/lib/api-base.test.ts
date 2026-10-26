import { describe, it, expect } from 'vitest';
import { apiOrigin, resolveApiBase } from './api-base.js';

describe('resolveApiBase', () => {
  it('falls back to the same-origin /api when unset or blank', () => {
    expect(resolveApiBase(undefined)).toBe('/api');
    expect(resolveApiBase('')).toBe('/api');
    expect(resolveApiBase('  ')).toBe('/api');
  });

  it('keeps a configured base and drops trailing slashes', () => {
    expect(resolveApiBase('https://api.citymonitor.app/api')).toBe('https://api.citymonitor.app/api');
    expect(resolveApiBase(' https://api.example.org/api// ')).toBe('https://api.example.org/api');
    expect(resolveApiBase('/api/')).toBe('/api');
  });
});

describe('apiOrigin', () => {
  it('gives the origin of an absolute base', () => {
    expect(apiOrigin('https://api.citymonitor.app/api')).toBe('https://api.citymonitor.app');
    expect(apiOrigin('http://localhost:3001/api')).toBe('http://localhost:3001');
  });

  it('gives null for a path on the page origin', () => {
    expect(apiOrigin('/api')).toBeNull();
  });
});
