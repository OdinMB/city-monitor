import i18n from 'i18next';

/**
 * Arrow that points along the reading direction of a UI language: "→" in
 * left-to-right languages, "←" in right-to-left ones (Arabic). For marks that
 * mean "more / continue / until" after a link label or before an end date.
 * Arrows that show a physical direction or a data trend keep their glyph.
 */
export function forwardArrow(lng: string = i18n.language): string {
  return i18n.dir(lng) === 'rtl' ? '←' : '→';
}
