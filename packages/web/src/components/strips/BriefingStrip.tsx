import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useNewsSummary } from '../../hooks/useNewsSummary.js';
import { useFreshness } from '../../hooks/useFreshness.js';
import { staleAfter } from '../../lib/freshness.js';
import { formatRelativeTimeI18n } from '../../lib/format-time.js';
import { briefingLanguage } from '../../lib/briefing-language.js';
import { StripErrorFallback } from '../ErrorFallback.js';
import { Skeleton } from '../layout/Skeleton.js';
import { TileFooter } from '../layout/TileFooter.js';

/** `lang` set when the briefing is in another language than the page. */
function BriefingContent({ text, lang }: { text: string; lang?: string }) {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  // data-ai-generated: invisible machine-readable marker (see .context/ai-transparency.md).
  // It is not the visible label, which Art. 50(4) needs separately: that is the
  // AiLabel tag in the tile heading (CommandLayout).
  return (
    <div
      data-ai-generated="true"
      lang={lang}
      dir={lang ? (lang === 'ar' ? 'rtl' : 'ltr') : undefined}
      className="text-base lg:text-xl leading-relaxed text-gray-700 dark:text-gray-300 space-y-3"
    >
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

const FRESH_MAX_AGE = staleAfter('briefing');

export function BriefingStrip() {
  const { id: cityId, languages } = useCityConfig();
  const { i18n, t } = useTranslation();
  // A city writes its briefing in its own languages only (Hamburg: German and
  // English); in any other interface language it comes in the city's first.
  const lang = briefingLanguage(languages, i18n.language);
  const otherLanguage = lang !== i18n.language.split('-')[0];
  const { data: summary, fetchedAt, isLoading: summaryLoading, isError: summaryError, refetch: summaryRefetch } = useNewsSummary(cityId, lang);
  const { isStale, agoText } = useFreshness(fetchedAt, FRESH_MAX_AGE);

  if (summaryError) return <StripErrorFallback domain={t('panel.news.briefing')} onRetry={summaryRefetch} />;

  return (
    <>
      {summaryLoading ? (
        <Skeleton lines={2} />
      ) : summary?.briefing ? (
        <>
          {otherLanguage && (
            <p className="text-xs text-muted mb-2">
              {t('panel.news.briefingOnlyIn', { language: new Intl.DisplayNames([i18n.language], { type: 'language' }).of(lang) })}
            </p>
          )}
          <BriefingContent text={summary.briefing} lang={otherLanguage ? lang : undefined} />
          <TileFooter stale={isStale}>
            {summary.generatedAt && t('panel.news.generatedAgo', { time: formatRelativeTimeI18n(summary.generatedAt, t) })}
            {summary.generatedAt && agoText && ' · '}
            {agoText && t('stale.updated', { time: agoText })}
          </TileFooter>
        </>
      ) : (
        <p className="text-sm text-muted">{t('panel.news.empty')}</p>
      )}
    </>
  );
}
