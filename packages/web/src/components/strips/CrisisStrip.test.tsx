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

/** Name, number and official page, as checked on 2026-10-27. */
const EMERGENCY: Array<[name: string, phone: string, url: string]> = [
  ['Fire & ambulance', '112', 'https://www.berliner-feuerwehr.de/'],
  ['Police', '110', 'https://www.berlin.de/polizei/'],
];

/** Name, number, hours (none where no single number has fixed hours) and official page, as checked on 2026-10-27. */
const CITYWIDE: Array<[name: string, phone: string, hours: string | null, url: string]> = [
  ['Crisis Helpline', '0800 111 0 111', '24/7', 'https://www.telefonseelsorge.de/telefon/'],
  ['Berlin Crisis Service', '030 390 63-10', null, 'https://www.berliner-krisendienst.de/ich-brauche-hilfe/'],
  ['Domestic Violence Hotline', '030 611 03 00', '24/7', 'https://www.big-hotline.de/'],
  ['Violence Against Women Helpline', '116 016', '24/7', 'https://www.hilfetelefon.de/'],
  ['Child Emergency Service', '030 61 00 61', '24/7', 'https://www.berlin.de/notdienst-kinderschutz/'],
  ['Youth Emergency Service', '030 61 00 62', '24/7', 'https://www.berlin.de/notdienst-kinderschutz/jugendnotdienst/'],
  ['Children/Youth Helpline', '116 111', 'Mon–Sat 2–8pm', 'https://www.nummergegenkummer.de/'],
  ['Drug Emergency Service', '030 192 37', '24/7', 'https://drogennotdienst.de/'],
  ['Anti-Violence (LGBTQ+)', '030 216 33 36', 'daily 5–7pm', 'https://maneo.de/en/home/'],
  ['LGBTQ+ Counseling', '030 446 688-111', 'Mon–Fri 9am–7pm', 'https://schwulenberatungberlin.de/kontakt/'],
];

/** The Local tab's note, with the on-call number, in every language. */
const LOCAL_NOTE: Array<[lang: string, note: string]> = [
  ['de', 'Berliner Krisendienst — Soforthilfe in seelischen Krisen: Rufen Sie unten die Nummer Ihrer Region an. Nachts (0–8 Uhr) sowie an Wochenenden und Feiertagen (8–16 Uhr) antwortet der Bereitschaftsdienst unter 030 390 63-10 oder der Nummer Ihrer Region. Mo–Fr 8–16 Uhr: Information und Vermittlung unter denselben Nummern.'],
  ['en', 'Berliner Krisendienst — immediate help in a mental-health crisis: call your region\'s number below. At night (midnight–8am) and on weekends and holidays (8am–4pm), the on-call service answers on 030 390 63-10 or your region\'s number. Mon–Fri 8am–4pm: information and referral on the same numbers.'],
  ['tr', 'Berliner Krisendienst — ruhsal krizlerde acil yardım: aşağıdan bölgenizin numarasını arayın. Geceleri (0–8) ve hafta sonları ile resmî tatillerde (8–16) nöbetçi servis 030 390 63-10 numarasından veya bölgenizin numarasından yanıt verir. Pzt–Cum 8–16: aynı numaralardan bilgi ve yönlendirme.'],
  ['ar', 'Berliner Krisendienst — مساعدة فورية في الأزمات النفسية: اتصل برقم منطقتك أدناه. ليلاً (0–8) وفي عطلات نهاية الأسبوع والأعياد (8–16) تجيب خدمة المناوبة على 030 390 63-10 أو على رقم منطقتك. إثنين–جمعة 8–16: معلومات وإحالة على الأرقام نفسها.'],
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
  it('shows each service with its number and the hours its official page gives', () => {
    render(<CrisisStrip expanded onExpand={() => {}} />);
    for (const [name, phone, hours] of CITYWIDE) {
      const row = rowOf(name);
      expect(row.textContent).toBe(`${name}↗${hours ?? ''}${phone}`);
      expect(phoneLinks(row)).toEqual([{ href: telHref(phone), ltr: phone }]);
    }
  });

  it('never shows 030 390 63-00, which the Krisendienst does not list', () => {
    const { container } = render(<CrisisStrip expanded onExpand={() => {}} />);
    const citywide = container.innerHTML;
    openLocalTab();
    for (const html of [citywide, container.innerHTML]) {
      expect(html).not.toContain('63-00');
      expect(html).not.toContain('0303906300');
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
    const entries = [...EMERGENCY.map(([name, , url]) => [name, url]), ...CITYWIDE.map(([name, , , url]) => [name, url])];
    expect(entries).toHaveLength(12);
    for (const [name, url] of entries) {
      const site = within(rowOf(name!)).getByRole('link', { name: `Official website: ${name}` });
      expect(site.getAttribute('href')).toBe(url);
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

  it('links the official page below the list', () => {
    render(<CrisisStrip expanded onExpand={() => {}} />);
    openLocalTab();
    const list = screen.getByRole('list', { name: 'Regional sites' });
    const site = screen.getByRole('link', { name: 'Official website: Berliner Krisendienst' });
    expect(list.compareDocumentPosition(site) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(site.getAttribute('href')).toBe('https://www.berliner-krisendienst.de/ich-brauche-hilfe/');
    expect(site.getAttribute('target')).toBe('_blank');
    expect(site.getAttribute('rel')).toContain('noopener');
    expect(site.classList.contains('min-h-6')).toBe(true);
  });
});

describe('CrisisStrip Local note: the on-call service and its hours, in every language', () => {
  it.each(LOCAL_NOTE)('%s', async (lang, expected) => {
    await i18n.changeLanguage(lang);
    render(<CrisisStrip expanded onExpand={() => {}} />);
    fireEvent.click(screen.getAllByRole('tab')[1]!);
    const note = screen.getByRole('tabpanel').querySelector('p')!;
    expect(note.textContent).toBe(expected);
    // The on-call number inside the sentence keeps its digit groups in order in Arabic.
    expect([...note.querySelectorAll('bdi[dir="ltr"]')].map((b) => b.textContent)).toEqual(['030 390 63-10']);
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
    expect(links).toContainEqual({ href: 'tel:0303906310', ltr: '030 390 63-10' });
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
