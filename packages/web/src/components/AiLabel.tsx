import { useTranslation } from 'react-i18next';

/**
 * Visible label for AI-generated content (EU AI Act Art. 50(4)), sized for a
 * Tile's `titleBadge` slot: one tag reading "AI-generated" in the UI language,
 * as real text, with "Not reviewed by an editor, may contain errors." as its
 * tooltip. Mounted on the Briefing tile (`CommandLayout`); the copy is the
 * owner-approved wording in the `aiLabel.*` keys (see
 * .context/ai-transparency.md).
 *
 * The tooltip is the native `title`, so it shows on mouse hover only, not on
 * touch or keyboard focus. The image role makes the tag one object for screen
 * readers: the visible text is its accessible name and the tooltip its
 * accessible description. `lang` and `dir` follow the UI language, so the tag
 * reads right-to-left in Arabic wherever it is placed.
 */
export function AiLabel() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const text = t('aiLabel.generated');

  return (
    <span
      role="img"
      aria-label={text}
      title={t('aiLabel.tooltip')}
      lang={lang}
      dir={i18n.dir(lang)}
      className="shrink-0 cursor-help rounded px-1 py-0.5 text-xs leading-none font-semibold bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
    >
      {text}
    </span>
  );
}
