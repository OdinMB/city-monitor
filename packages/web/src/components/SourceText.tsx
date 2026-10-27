import type { ReactNode } from 'react';

/**
 * German text from a feed or an official source (a headline, a transit
 * message, a station or place name) in a UI that may run right to left. It is
 * isolated from the text around it and runs in the direction of its first
 * letter, so an Arabic page doesn't move its brackets, full stop or words
 * ("[Synthetisch] Straßenfest …" with the bracket at the far end).
 *
 * Inline by default (a `<bdi>`). Where an element clamps or truncates the text
 * (`truncate`, `line-clamp-*`), render it as that element (`as`, with the
 * classes in `className`): the cut and the "…" then land at the text's end
 * rather than eating its first letters. Such an element aligns with its own
 * text, and its logical margins and paddings follow the text's direction, not
 * the page's, so put those on a wrapper (i18n.md → Right-to-left).
 *
 * No `lang` by default; pass one only where the source states the text's
 * language (a DWD warning headline is German as issued, `lang="de"`), so a
 * screen reader reads it in that language.
 *
 * HTML counterpart for map popups: `sourceText()` in `map/popups.ts`.
 */
export function SourceText({
  as: Tag = 'bdi',
  className,
  lang,
  children,
}: {
  as?: 'bdi' | 'span' | 'p' | 'div';
  className?: string;
  lang?: string;
  children: ReactNode;
}) {
  return (
    <Tag dir="auto" lang={lang} className={className}>
      {children}
    </Tag>
  );
}
