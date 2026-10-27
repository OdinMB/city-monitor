import i18n from 'i18next';

/**
 * Text direction in an Arabic (right-to-left) page. Two kinds of text need
 * code there, each with one call:
 *
 * - **Source text**, German from a feed or an official source (a headline, a
 *   station, a place name): `<SourceText>` in React (`components/SourceText.tsx`),
 *   `sourceText()` in map popup HTML (`components/map/popups.ts`).
 * - **A value with a unit or a sign** ("-3°", "+1.9%", "16 km/h"): the
 *   functions in `lib/format-value.ts`, which return it already isolated
 *   (`isolate` below); `<Ltr>` and `ltr()` when markup sits inside the value.
 */

/** U+2068 FIRST STRONG ISOLATE: opens a run that takes the direction of its first letter. */
export const FSI = String.fromCodePoint(0x2068);

/** U+2069 POP DIRECTIONAL ISOLATE: closes the run. */
export const PDI = String.fromCodePoint(0x2069);

/** Any of the four isolate controls, U+2066 (left-to-right isolate) to U+2069 (PDI). */
export const ISOLATE_CONTROL = new RegExp(`[${String.fromCodePoint(0x2066)}-${PDI}]`);

/**
 * Text as one isolated run, the plain-text counterpart of `<bdi>`: the bidi
 * algorithm can no longer move a sign or a unit to the other end in a
 * right-to-left page ("3°-" for "-3°"). The run takes its direction from its
 * first letter: a number with a sign, a symbol or a Latin unit reads left to
 * right, a number with an Arabic word reads in Arabic order. It is invisible
 * and works wherever plain text goes: React text, attributes, popup HTML.
 */
export function isolate(text: string): string {
  return `${FSI}${text}${PDI}`;
}

/**
 * Arrow that points along the reading direction of a UI language: "→" in
 * left-to-right languages, "←" in right-to-left ones (Arabic). For marks that
 * mean "more / continue / until" after a link label or before an end date.
 * Arrows that show a physical direction or a data trend keep their glyph.
 */
export function forwardArrow(lng: string = i18n.language): string {
  return i18n.dir(lng) === 'rtl' ? '←' : '→';
}
