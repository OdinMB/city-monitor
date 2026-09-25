import { describe, it, expect } from 'vitest';
import type { PoliticalDistrict } from '../../../lib/api.js';
import { buildPoliticalPopupHtml } from './political';

const MALICIOUS = '<img src=x onerror="alert(1)">';

function parse(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('buildPoliticalPopupHtml', () => {
  it('renders representative data from the API as text, not markup', () => {
    const districts: PoliticalDistrict[] = [{
      id: '1',
      name: 'Mitte',
      level: 'bezirk',
      representatives: [{ name: MALICIOUS, party: MALICIOUS, role: MALICIOUS, constituency: MALICIOUS, profileUrl: 'https://www.abgeordnetenwatch.de/p/1' }],
    }];
    const el = parse(buildPoliticalPopupHtml('Mitte', districts));
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent!.split(MALICIOUS)).toHaveLength(5);
    expect(el.querySelector('a')!.getAttribute('href')).toBe('https://www.abgeordnetenwatch.de/p/1');
  });

  it('drops a javascript: profile link', () => {
    const districts: PoliticalDistrict[] = [{
      id: '1',
      name: 'Mitte',
      level: 'bezirk',
      representatives: [{ name: 'A. Person', party: 'SPD', role: 'MdB', profileUrl: 'javascript:alert(1)' }],
    }];
    expect(parse(buildPoliticalPopupHtml('Mitte', districts)).querySelector('a')).toBeNull();
  });

  it('escapes the district name when there is no data for it', () => {
    const el = parse(buildPoliticalPopupHtml(MALICIOUS, []));
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain(MALICIOUS);
  });
});
