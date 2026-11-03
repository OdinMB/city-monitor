import { describe, it, expect, afterEach } from 'vitest';
import i18n from 'i18next';
import { citizenReportPopupHtml } from './citizen-reports';

function parse(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

const REPORT = {
  category: 'Leuchte ausgefallen', status: 'closed', statusLabel: 'Erledigt/Beauftragt', requestedAt: '2026-11-02T01:00:27+01:00',
  updatedAt: '', url: 'https://machmuenchenbesser.de/requests/94579-2026',
};

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('citizenReportPopupHtml', () => {
  it('shows category, status with the portal\'s own word, date, the portal link and its name', () => {
    const el = parse(citizenReportPopupHtml(REPORT, false, 'Mach München besser'));
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Leuchte ausgefallen');
    expect(text).toContain('Closed · Erledigt/Beauftragt');
    expect(text).toContain('Reported: ');
    expect(text).not.toContain('Updated');
    expect(text).toContain('Mach München besser');
    expect(el.querySelector('a')!.getAttribute('href')).toBe('https://machmuenchenbesser.de/requests/94579-2026');
  });

  it('escapes portal text and links nothing but https', () => {
    const el = parse(citizenReportPopupHtml(
      { ...REPORT, category: '<img src=x onerror=alert(1)>', statusLabel: '<script>x</script>', url: 'javascript:alert(1)' },
      true, 'Portal',
    ));
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.querySelector('a')).toBeNull();
  });

  it('falls back to open for a status it does not know', () => {
    const text = parse(citizenReportPopupHtml({ ...REPORT, status: 'weird', statusLabel: '' }, false, '')).textContent!;
    expect(text).toContain('Open');
  });
});
