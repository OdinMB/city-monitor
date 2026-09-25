/**
 * Escapes a value for interpolation into an HTML string, as text or as a
 * quoted attribute value.
 *
 * Map popups are built as HTML strings and handed to MapLibre's `setHTML`,
 * which parses them as markup. Their text comes from third parties: RSS
 * titles, police reports, OpenStreetMap tags, transit and traffic feeds, and
 * place labels the LLM infers. The deployed CSP allows inline script, so an
 * unescaped `<img onerror>` in any of them would run in the visitor's browser.
 * Every data-derived value in popup markup goes through here; link targets go
 * through `safeUrl()` first.
 */
const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]!);
}
