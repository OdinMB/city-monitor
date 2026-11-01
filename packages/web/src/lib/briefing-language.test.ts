import { describe, it, expect } from 'vitest';
import { briefingLanguage } from './briefing-language.js';

describe('briefingLanguage', () => {
  it('is the interface language when the city writes its briefing in it', () => {
    expect(briefingLanguage(['de', 'en', 'tr', 'ar'], 'ar')).toBe('ar');
    expect(briefingLanguage(['de', 'en'], 'en')).toBe('en');
  });

  it('is the city\'s first language otherwise, as the API answers', () => {
    expect(briefingLanguage(['de', 'en'], 'tr')).toBe('de');
    expect(briefingLanguage(['de', 'en'], 'ar')).toBe('de');
  });

  it('reads a regional interface language as its language', () => {
    expect(briefingLanguage(['de', 'en'], 'en-GB')).toBe('en');
  });

  it('falls back to German for a city without languages', () => {
    expect(briefingLanguage([], 'tr')).toBe('de');
  });
});
