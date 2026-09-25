import { useTranslation } from 'react-i18next';

/**
 * Visible label for AI-generated content (EU AI Act Art. 50(4)), sized for a
 * Tile's `titleBadge` slot: an "AI" main element followed by a second layer
 * such as "AI-generated", both as real text.
 *
 * NOT MOUNTED YET. Its copy is under the owner's review, so the three keys
 * below exist in no translation file. Add them to de/en/tr/ar.json and pass
 * `<AiLabel />` as the briefing Tile's `titleBadge` once the wording is
 * approved (see .context/ai-transparency.md, open items).
 *
 * Screen readers get the accessible name as one phrase instead of the two
 * visible fragments. `lang` and `dir` follow the UI language, so the label
 * reads right-to-left in Arabic wherever it is placed.
 */
export function AiLabel() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <span
      role="img"
      aria-label={t('aiLabel.accessibleName')}
      lang={lang}
      dir={i18n.dir(lang)}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300"
    >
      <span className="rounded px-1 py-0.5 leading-none font-semibold bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">
        {t('aiLabel.badge')}
      </span>
      <span>{t('aiLabel.generated')}</span>
    </span>
  );
}
