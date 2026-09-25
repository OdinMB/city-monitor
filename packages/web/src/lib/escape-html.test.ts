import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escape-html';

function parse(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('escapeHtml', () => {
  it('turns markup into text instead of elements', () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const el = parse(`<div>${escapeHtml(payload)}</div>`);
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.textContent).toBe(payload);
  });

  it('keeps a value inside its attribute quotes', () => {
    const href = 'https://example.org/" onmouseover="alert(1)';
    const title = "it's' onclick='alert(1)";
    const a = parse(`<a href="${escapeHtml(href)}" title='${escapeHtml(title)}'>x</a>`).querySelector('a')!;
    expect(a.getAttribute('onmouseover')).toBeNull();
    expect(a.getAttribute('onclick')).toBeNull();
    expect(a.getAttribute('href')).toBe(href);
    expect(a.getAttribute('title')).toBe(title);
  });

  it('escapes ampersands, so text that looks like an entity stays literal', () => {
    expect(parse(escapeHtml('Tom &amp; Jerry')).textContent).toBe('Tom &amp; Jerry');
  });

  it('renders null and undefined as empty and stringifies other values', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(false)).toBe('false');
  });
});
