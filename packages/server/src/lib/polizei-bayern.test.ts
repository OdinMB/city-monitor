import { describe, it, expect } from 'vitest';
import { isSearch, parseBayernPubDate, parseBulletin, BULLETIN_TEASER_CHARS } from './polizei-bayern.js';

const BULLETIN_URL = 'https://polizei.bayern.de/aktuelles/pressemitteilungen/100001/index.html';

// Shaped like a polizei.bayern.de bulletin page (invented reports).
const bulletinHtml = `<html><body>
<nav><h3>Infos &amp; Funktionen</h3></nav>
<section><div><div>
        <h3><strong>101.&nbsp;&nbsp; Fahrraddiebstahl &ndash; Schwabing</strong></h3>

<p>Am Dienstag, 03.11.2026, stellte ein 34-J&auml;hriger sein Fahrrad in der Leopoldstra&szlig;e ab.</p>
<p>Eine sofort eingeleitete Fahndung verlief ohne Erfolg.</p>

        <h3><strong>102.&nbsp;&nbsp; Verkehrsunfall mit Verletzten &ndash; Neuhausen-Nymphenburg</strong></h3>
<p>Ein Radfahrer wurde leicht verletzt.</p>

        <h3><strong>103.&nbsp;&nbsp; Mehrere Wohnungseinbr&uuml;che &ndash; Stadtgebiet M&uuml;nchen</strong></h3>
<p>In mehreren Stadtteilen wurde eingebrochen.</p>

        <h3><strong>104.&nbsp;&nbsp; Vermisste 15-J&auml;hrige &ndash; Pasing</strong></h3>
<p>Die Polizei bittet um Hinweise.</p>

        <h3><strong>105.&nbsp;&nbsp; &Ouml;ffentlichkeitsfahndung nach Raub &ndash; Altstadt</strong></h3>
<p>Wer kennt den Mann?</p>
      </div></div></div>
</section>
<footer><p>Impressum</p></footer>
</body></html>`;

describe('parseBulletin', () => {
  const reports = parseBulletin(bulletinHtml, { url: BULLETIN_URL, publishedAt: '2026-11-04T10:41:00.000Z' });

  it('splits a bulletin into its numbered reports and leaves out searches', () => {
    expect(reports.map((r) => r.title)).toEqual([
      'Fahrraddiebstahl – Schwabing',
      'Verkehrsunfall mit Verletzten – Neuhausen-Nymphenburg',
      'Mehrere Wohnungseinbrüche – Stadtgebiet München',
    ]);
  });

  it('takes the place after the last spaced dash as the district, but not the whole city', () => {
    expect(reports.map((r) => r.district)).toEqual(['Schwabing', 'Neuhausen-Nymphenburg', undefined]);
  });

  it('keeps a report whose text, not its headline, mentions a search', () => {
    expect(reports[0].description).toBe(
      'Am Dienstag, 03.11.2026, stellte ein 34-Jähriger sein Fahrrad in der Leopoldstraße ab. Eine sofort eingeleitete Fahndung verlief ohne Erfolg.',
    );
  });

  it('stops the last report at the end of the content section', () => {
    const html = '<section><h3>8. Brand – Au</h3><p>Ein Keller brannte.</p></div></section><footer><p>Impressum</p></footer>';
    const [report] = parseBulletin(html, { url: BULLETIN_URL, publishedAt: '2026-11-04T10:41:00.000Z' });
    expect(report.description).toBe('Ein Keller brannte.');
  });

  it('links each report to its bulletin, dated as the bulletin, with distinct ids', () => {
    expect(new Set(reports.map((r) => r.url))).toEqual(new Set([BULLETIN_URL]));
    expect(reports.every((r) => r.publishedAt === '2026-11-04T10:41:00.000Z')).toBe(true);
    expect(new Set(reports.map((r) => r.id)).size).toBe(reports.length);
  });

  it('cuts long report texts to a teaser', () => {
    const long = `<section><h3>7. Lange Meldung – Au</h3><p>${'Wort '.repeat(200)}</p></section>`;
    const [report] = parseBulletin(long, { url: BULLETIN_URL, publishedAt: '2026-11-04T10:41:00.000Z' });
    expect(report.description.length).toBeLessThanOrEqual(BULLETIN_TEASER_CHARS);
    expect(report.description.endsWith('…')).toBe(true);
  });

  it('returns nothing for a page without numbered reports', () => {
    expect(parseBulletin('<h3>Infos</h3><p>Text</p>', { url: BULLETIN_URL, publishedAt: '2026-11-04T10:41:00.000Z' })).toEqual([]);
  });
});

describe('isSearch', () => {
  it('flags search links and headlines', () => {
    expect(isSearch('https://polizei.bayern.de/fahndung/personen/vermisste/1/index.html')).toBe(true);
    expect(isSearch('Vermisstenfahndung – Giesing')).toBe(true);
    expect(isSearch('Abgängiger Senior – Moosach')).toBe(true);
    expect(isSearch('Fahrraddiebstahl – Schwabing')).toBe(false);
  });
});

describe('parseBayernPubDate', () => {
  it('reads a zoneless date as München time, in winter and summer', () => {
    expect(parseBayernPubDate('Wed, 4 Nov 2026 15:53:00')).toBe('2026-11-04T14:53:00.000Z');
    expect(parseBayernPubDate('Mon, 6 Jul 2026 09:05:00')).toBe('2026-07-06T07:05:00.000Z');
  });

  it('keeps a date that names its zone', () => {
    expect(parseBayernPubDate('Wed, 04 Nov 2026 15:53:00 GMT')).toBe('2026-11-04T15:53:00.000Z');
  });
});
