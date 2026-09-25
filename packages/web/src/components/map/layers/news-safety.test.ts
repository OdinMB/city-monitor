import { describe, it, expect } from 'vitest';
import { newsPopupHtml, safetyPopupHtml } from './news-safety';

/** Markup a hostile feed item might carry in any text field. */
const MALICIOUS = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

function parse(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

/** The popup templates contain only divs, text and one link — anything else was injected. */
function expectNoInjectedMarkup(el: HTMLElement) {
  expect(el.querySelector('img, script, svg, iframe, object')).toBeNull();
  for (const node of el.querySelectorAll('*')) {
    for (const attr of node.attributes) {
      expect(attr.name.startsWith('on'), `${node.tagName} carries ${attr.name}`).toBe(false);
    }
  }
}

const NEWS = {
  title: 'Tram line M10 suspended',
  sourceName: 'rbb24',
  categoryLabel: 'Transit',
  url: 'https://www.rbb24.de/a/1',
  locationLabel: 'Warschauer Straße, Friedrichshain',
  importance: 0.87,
};

const SAFETY = {
  title: 'Einbruch in Wohnung',
  district: 'Mitte',
  url: 'https://www.berlin.de/polizei/1',
  locationLabel: 'Torstraße, Mitte',
};

describe('newsPopupHtml', () => {
  it('renders a malicious RSS title as text, not markup', () => {
    const el = parse(newsPopupHtml({ ...NEWS, title: MALICIOUS }));
    expectNoInjectedMarkup(el);
    expect(el.textContent).toContain(MALICIOUS);
  });

  it.each(['sourceName', 'categoryLabel', 'locationLabel'])('renders a malicious %s as text', (field) => {
    const el = parse(newsPopupHtml({ ...NEWS, [field]: MALICIOUS }));
    expectNoInjectedMarkup(el);
    expect(el.textContent).toContain(MALICIOUS);
  });

  it('drops a javascript: link but keeps the rest of the popup', () => {
    const el = parse(newsPopupHtml({ ...NEWS, url: 'javascript:alert(1)' }));
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toContain(NEWS.title);
  });

  it('keeps a web link intact without letting it break out of href', () => {
    const url = 'https://example.org/a?b=1&c=2" onmouseover="alert(1)';
    const el = parse(newsPopupHtml({ ...NEWS, url }));
    expectNoInjectedMarkup(el);
    expect(el.querySelector('a')!.getAttribute('href')).toBe(url);
  });

  it('shows the importance score as a percentage', () => {
    expect(parse(newsPopupHtml(NEWS)).textContent).toContain('87%');
  });
});

describe('safetyPopupHtml', () => {
  it.each(['title', 'district', 'locationLabel'])('renders a malicious %s as text, not markup', (field) => {
    const el = parse(safetyPopupHtml({ ...SAFETY, [field]: MALICIOUS }));
    expectNoInjectedMarkup(el);
    expect(el.textContent).toContain(MALICIOUS);
  });

  it('drops a javascript: link but keeps the report', () => {
    const el = parse(safetyPopupHtml({ ...SAFETY, url: 'javascript:alert(1)' }));
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toContain(SAFETY.title);
  });

  it('keeps a web link intact', () => {
    expect(parse(safetyPopupHtml(SAFETY)).querySelector('a')!.getAttribute('href')).toBe(SAFETY.url);
  });
});
