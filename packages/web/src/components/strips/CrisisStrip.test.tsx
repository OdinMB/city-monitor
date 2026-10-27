import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import i18n from 'i18next';
import { CrisisStrip } from './CrisisStrip.js';

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

/** Phone links with the text of their left-to-right isolate, if any. */
function phoneLinks(root: HTMLElement = document.body): Array<{ href: string; ltr: string | null }> {
  return within(root).getAllByRole('link')
    .filter((a) => a.getAttribute('href')?.startsWith('tel:'))
    .map((a) => ({ href: a.getAttribute('href')!, ltr: a.querySelector('bdi[dir="ltr"]')?.textContent ?? null }));
}

const telHref = (phone: string) => `tel:${phone.replace(/[\s-]/g, '')}`;

/** The list item that shows this service name. */
function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li');
  expect(row, `no row for ${name}`).not.toBeNull();
  return row!;
}

const openLocalTab = (label = 'Local') => fireEvent.click(screen.getByRole('tab', { name: label }));

/** Name, hours (none where the services' own pages disagree) and number, as of the check on 2026-10-27. */
const EMERGENCY: Array<[name: string, phone: string]> = [
  ['Fire & ambulance', '112'],
  ['Police', '110'],
];

const CITYWIDE: Array<[name: string, phone: string, hours: string | null]> = [
  ['Crisis Helpline', '0800 111 0 111', '24/7'],
  ['Berlin Crisis Service', '030 390 63-00', null],
  ['Domestic Violence Hotline', '030 611 03 00', null],
  ['Violence Against Women Helpline', '116 016', '24/7'],
  ['Child Emergency Service', '030 61 00 61', '24/7'],
  ['Youth Emergency Service', '030 61 00 62', '24/7'],
  ['Children/Youth Helpline', '116 111', 'Mon–Sat 2–8pm'],
  ['Drug Emergency Service', '030 192 37', '24/7'],
  ['Anti-Violence (LGBTQ+)', '030 216 33 36', 'daily 5–7pm'],
  ['LGBTQ+ Counseling', '030 446 688-111', null],
];

/** The Berliner Krisendienst's regional site for each district. */
const DISTRICT_NUMBERS: Record<string, string> = {
  'Mitte': '030 390 63-10',
  'Friedrichshain-Kreuzberg': '030 390 63-10',
  'Charlottenburg-Wilmersdorf': '030 390 63-20',
  'Spandau': '030 390 63-30',
  'Pankow': '030 390 63-40',
  'Reinickendorf': '030 390 63-50',
  'Steglitz-Zehlendorf': '030 390 63-60',
  'Tempelhof-Schöneberg': '030 390 63-60',
  'Lichtenberg': '030 390 63-70',
  'Marzahn-Hellersdorf': '030 390 63-70',
  'Treptow-Köpenick': '030 390 63-80',
  'Neukölln': '030 390 63-90',
};

// A path passed in, not a literal: Vite rewrites `new URL('<literal>', import.meta.url)` into an asset URL.
const readGeo = (rel: string): GeoJSON.FeatureCollection =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));

/** The district names of the map's Berlin boundaries. */
const BERLIN_DISTRICTS: string[] = readGeo('../../data/districts/berlin-bezirke.geojson')
  .features.map((f) => String(f.properties!.name));

/** District → the number shown in its row on the Local tab. */
function shownDistrictNumbers(): Record<string, string> {
  const list = screen.getByRole('list', { name: 'Regional sites' });
  return Object.fromEntries(within(list).getAllByRole('listitem').flatMap((li) => {
    const tel = within(li).getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('tel:'));
    expect(tel).toHaveLength(1);
    const phone = tel[0]!.textContent!;
    expect(tel[0]!.getAttribute('href')).toBe(telHref(phone));
    const districts = li.textContent!.replace(phone, '').split(', ');
    return districts.map((d) => [d, phone]);
  }));
}

describe('CrisisStrip emergency numbers', () => {
  it('shows 112 and 110 above the tabs, also while the tile is collapsed', () => {
    render(<CrisisStrip expanded={false} onExpand={() => {}} />);
    const list = screen.getByRole('list', { name: 'Emergency numbers' });
    for (const [name, phone] of EMERGENCY) {
      const row = rowOf(name);
      expect(list.contains(row)).toBe(true);
      expect(phoneLinks(row)).toEqual([{ href: telHref(phone), ltr: phone }]);
    }
    const tablist = screen.getByRole('tablist');
    expect(list.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('CrisisStrip city-wide services', () => {
  it('shows each service with its number and only the hours its own pages agree on', () => {
    render(<CrisisStrip expanded onExpand={() => {}} />);
    for (const [name, phone, hours] of CITYWIDE) {
      const row = rowOf(name);
      expect(row.textContent).toBe(`${name}↗${hours ?? ''}${phone}`);
      expect(phoneLinks(row)).toEqual([{ href: telHref(phone), ltr: phone }]);
    }
  });

  it('shows the first four services while collapsed and counts the rest', () => {
    render(<CrisisStrip expanded={false} onExpand={() => {}} />);
    for (const [name] of CITYWIDE.slice(0, 4)) expect(screen.getByText(name)).toBeTruthy();
    for (const [name] of CITYWIDE.slice(4)) expect(screen.queryByText(name)).toBeNull();
    expect(screen.getByRole('button', { name: '6 more' })).toBeTruthy();
  });

  it('links every entry to its official page, opened in a new tab', () => {
    render(<CrisisStrip expanded onExpand={() => {}} />);
    for (const [name] of [...EMERGENCY, ...CITYWIDE]) {
      const site = within(rowOf(name)).getByRole('link', { name: `Official website: ${name}` });
      expect(site.getAttribute('href')).toMatch(/^https:\/\/[a-z0-9.-]+\.de\//);
      expect(site.getAttribute('target')).toBe('_blank');
      expect(site.getAttribute('rel')).toContain('noopener');
    }
  });

  it('makes every number and website link a 24px target that keeps the row height (WCAG 2.5.8)', () => {
    // jsdom does no layout, so check the classes the size relies on.
    render(<CrisisStrip expanded onExpand={() => {}} />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.classList.contains('min-h-6'), link.outerHTML).toBe(true);
      expect(link.classList.contains('-my-1'), link.outerHTML).toBe(true);
      expect(link.classList.contains('text-link'), link.outerHTML).toBe(true);
    }
    for (const link of screen.getAllByRole('link', { name: /^Official website: / })) {
      expect(link.classList.contains('min-w-6'), link.outerHTML).toBe(true);
    }
  });
});

describe('CrisisStrip regional crisis service', () => {
  it('gives every Berlin district exactly the number of its regional site', () => {
    render(<CrisisStrip expanded onExpand={() => {}} />);
    openLocalTab();
    const shown = shownDistrictNumbers();
    expect(shown).toEqual(DISTRICT_NUMBERS);
    expect(Object.keys(shown).sort()).toEqual([...BERLIN_DISTRICTS].sort());
  });

  it('gives the regional sites\' hours and, for nights, points to the official page right below', () => {
    render(<CrisisStrip expanded onExpand={() => {}} />);
    openLocalTab();
    // The on-call number is not confirmed yet, so the note names none and
    // sends readers to the official page.
    const note = screen.getByText(/Regional sites: daily 4pm–midnight\. Nights, and daytime on weekends and holidays: the on-call service, see the official website below\./);
    const site = screen.getByRole('link', { name: 'Official website: Berliner Krisendienst' });
    expect(note.compareDocumentPosition(site) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(site.getAttribute('href')).toBe('https://www.berliner-krisendienst.de/ich-brauche-hilfe/');
    expect(site.getAttribute('target')).toBe('_blank');
    expect(site.getAttribute('rel')).toContain('noopener');
    expect(site.classList.contains('min-h-6')).toBe(true);
  });
});

describe('CrisisStrip points to the official page for the night service in every language', () => {
  it.each([
    ['de', 'der Bereitschaftsdienst, siehe die offizielle Website unten.', 'Offizielle Website: Berliner Krisendienst'],
    ['en', 'the on-call service, see the official website below.', 'Official website: Berliner Krisendienst'],
    ['tr', 'nöbetçi servis, aşağıdaki resmî web sitesine bakın.', 'Resmî web sitesi: Berliner Krisendienst'],
    ['ar', 'خدمة المناوبة، انظر الموقع الرسمي أدناه.', 'الموقع الرسمي: Berliner Krisendienst'],
  ])('%s', async (lang, pointer, link) => {
    await i18n.changeLanguage(lang);
    render(<CrisisStrip expanded onExpand={() => {}} />);
    fireEvent.click(screen.getAllByRole('tab')[1]!);
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('p')!.textContent!.endsWith(pointer)).toBe(true);
    expect(within(panel).getByRole('link', { name: link }).getAttribute('href'))
      .toBe('https://www.berliner-krisendienst.de/ich-brauche-hilfe/');
  });
});

describe('CrisisStrip says when the numbers were checked', () => {
  it.each([
    ['en', 'Numbers last checked: Oct 27, 2026'],
    ['de', 'Nummern zuletzt geprüft: 27. Okt. 2026'],
    ['tr', 'Numaralar en son kontrol edildi: 27 Eki 2026'],
    // Arabic digits and marks come from ICU, so the date is built the way the
    // other tiles build it; the month is named in Arabic (أكتوبر).
    ['ar', `آخر تحقق من الأرقام: ${new Date('2026-10-27T00:00:00Z').toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`],
  ])('%s', async (lang, footer) => {
    await i18n.changeLanguage(lang);
    const { container } = render(<CrisisStrip expanded onExpand={() => {}} />);
    expect(container.textContent).toContain(footer);
    if (lang === 'ar') expect(container.textContent).toContain('أكتوبر');
  });
});

describe('CrisisStrip translations', () => {
  it.each(['de', 'en', 'tr', 'ar'])('%s: every word on both tabs comes from the bundle', async (lang) => {
    await i18n.changeLanguage(lang);
    const { container } = render(<CrisisStrip expanded onExpand={() => {}} />);
    const words = () => [
      container.textContent!,
      ...[...container.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label')!),
    ];
    const citywide = words();
    fireEvent.click(screen.getAllByRole('tab')[1]!);
    for (const text of [...citywide, ...words()]) {
      expect(text).not.toMatch(/panel\.crisis|\{\{/);
    }
  });
});

describe('CrisisStrip phone numbers in Arabic (right-to-left)', () => {
  it('keeps every city-wide hotline and emergency number left-to-right', async () => {
    await i18n.changeLanguage('ar');
    render(<CrisisStrip expanded onExpand={() => {}} />);
    const links = phoneLinks();
    expect(links).toHaveLength(EMERGENCY.length + CITYWIDE.length);
    expect(links).toContainEqual({ href: 'tel:08001110111', ltr: '0800 111 0 111' });
    expect(links).toContainEqual({ href: 'tel:0303906300', ltr: '030 390 63-00' });
    expect(links).toContainEqual({ href: 'tel:112', ltr: '112' });
    for (const link of links) expect(link.ltr).not.toBeNull();
  });

  it('keeps the regional crisis service numbers left-to-right', async () => {
    await i18n.changeLanguage('ar');
    render(<CrisisStrip expanded onExpand={() => {}} />);
    openLocalTab('محلي');
    const links = phoneLinks(screen.getByRole('tabpanel'));
    expect(links).toHaveLength(9);
    expect(links.map((l) => l.ltr)).toContain('030 390 63-10');
    for (const link of links) expect(link.ltr).not.toBeNull();
  });

  it('names the hidden services in Arabic', async () => {
    await i18n.changeLanguage('ar');
    render(<CrisisStrip expanded={false} onExpand={() => {}} />);
    expect(screen.getByRole('button', { name: '6 أخرى' })).toBeTruthy();
  });
});
