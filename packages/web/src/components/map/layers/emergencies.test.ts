import { describe, it, expect } from 'vitest';
import i18n from 'i18next';
import { hospitalPopupHtml } from './emergencies';

function parse(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

const ATLAS = {
  name: 'Klinikum <Nord>', address: 'Langenhorner Chaussee 560, 22419 Hamburg', tier: 'extended', url: 'https://example.org/klinik',
  beds: 820, children: true, strokeUnit: true, chestPainUnit: false, trauma: false, source: 'klinik-atlas', atlasDate: '2026-10-27',
};

describe('hospitalPopupHtml', () => {
  it('shows name, address, tier, units, beds, the website, directions and the Klinik-Atlas date', () => {
    const el = parse(hospitalPopupHtml(ATLAS, [10.02, 53.65]));
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Klinikum <Nord>');
    expect(el.innerHTML).not.toContain('<Nord>');
    expect(text).toContain('Langenhorner Chaussee 560');
    expect(text).toContain(i18n.t('mapPopup.hospital.tier.extended'));
    expect(text).toContain(i18n.t('mapPopup.hospital.unit.children'));
    expect(text).toContain(i18n.t('mapPopup.hospital.unit.strokeUnit'));
    expect(text).not.toContain(i18n.t('mapPopup.hospital.unit.trauma'));
    expect(text).toContain(i18n.t('mapPopup.hospital.beds', { n: 820 }));
    expect(text).toContain(`${i18n.t('mapPopup.hospital.sourceAtlas')} · 2026-10-27`);
    const hrefs = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs[0]).toBe('https://example.org/klinik');
    expect(hrefs).toHaveLength(2);
  });

  it('leaves out a website that is not a web address, beds it does not know and names the Hamburg list', () => {
    const el = parse(hospitalPopupHtml({ ...ATLAS, url: 'mailto:info@example.org', beds: null, source: 'hamburg-wfs', tier: 'limited' }, [10, 53.5]));
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain(i18n.t('mapPopup.hospital.tier.limited'));
    expect(text).toContain(i18n.t('mapPopup.hospital.sourceHamburg'));
    expect(text).not.toContain(i18n.t('mapPopup.hospital.website'));
    expect(text).not.toContain('beds');
    expect(el.querySelectorAll('a')).toHaveLength(1);
  });
});
