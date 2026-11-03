import { afterEach, describe, expect, it } from 'vitest';
import i18n from 'i18next';
import type { CrimeAreaProps } from '../../../lib/api.js';
import { crimeAtlasPopupHtml, crimeClassOf } from './crime-atlas';

const CITY = {
  total: 12882.1, totalCount: 502743, assault: 1276.8, assaultCount: 49830, robbery: 123.6, robberyCount: 4823,
  burglary: 272.1, burglaryCount: 10618, bikeTheft: 579.9, bikeTheftCount: 22630, kiez: 3174.3, kiezCount: 123883,
};
const AREA: CrimeAreaProps = {
  areaId: '011001', name: 'Tiergarten Süd', district: 'Mitte',
  total: 31960.2, totalCount: 5198, assault: 2631.6, assaultCount: 428, robbery: 399.7, robberyCount: 65,
  burglary: 252.1, burglaryCount: 41, bikeTheft: 1887.6, bikeTheftCount: 307, kiez: 8583.4, kiezCount: 1396,
};

afterEach(async () => {
  await i18n.changeLanguage('en');
});

const text = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  // Without the direction isolates `ltr` adds around numbers
  return div.textContent!.replace(/[⁦-⁩‎‏]/g, '').replace(/\s+/g, ' ');
};

describe('crimeClassOf', () => {
  it('classes a rate by its multiple of the city rate', () => {
    expect(crimeClassOf(40, 100)!.key).toBe('muchLower');
    expect(crimeClassOf(50, 100)!.key).toBe('lower');
    expect(crimeClassOf(100, 100)!.key).toBe('average');
    expect(crimeClassOf(150, 100)!.key).toBe('higher');
    expect(crimeClassOf(200, 100)!.key).toBe('muchHigher');
    expect(crimeClassOf(null, 100)).toBeNull();
    expect(crimeClassOf(50, null)).toBeNull();
  });
});

describe('crimeAtlasPopupHtml', () => {
  it('shows the area, its Bezirk and year, each group against the city, and the chosen group\'s cases', async () => {
    await i18n.changeLanguage('en');
    const t = text(crimeAtlasPopupHtml(AREA, { year: 2025, city: CITY }, 'bikeTheft'));
    expect(t).toContain('Tiergarten Süd');
    expect(t).toContain('Mitte · Police crime statistics 2025');
    expect(t).toContain('All offences 31,960 12,882 2.5×');
    expect(t).toContain('Bicycle theft 1,888 580 3.3×');
    expect(t).toContain('Cases recorded: 307');
  });

  it('is German in German, with dashes where the atlas has no figure', async () => {
    await i18n.changeLanguage('de');
    const t = text(crimeAtlasPopupHtml({ ...AREA, robbery: null, robberyCount: null }, { year: 2025, city: CITY }, 'robbery'));
    expect(t).toContain('Polizeiliche Kriminalstatistik 2025');
    expect(t).toContain('Straftaten insgesamt 31.960 12.882 2,5×');
    expect(t).toContain('Raub – 124 –');
    expect(t).not.toContain('Erfasste Fälle');
  });

  it('escapes names from the source', () => {
    const html = crimeAtlasPopupHtml({ ...AREA, name: '<b>x</b>' }, { year: 2025, city: CITY }, 'total');
    expect(html).not.toContain('<b>x</b>');
  });
});
