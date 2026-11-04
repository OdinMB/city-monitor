import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useIsDesktop } from '../../hooks/useMediaQuery.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import { pickMapState } from '../../lib/map-state.js';
import { shareUrl } from '../../lib/setup-link.js';
import { sharedOf, type SetupView } from '../../lib/setup-state.js';

type ShareNotice = { kind: 'copied' } | { kind: 'failed'; url: string } | null;

/**
 * "Share this view": a link to the city's dashboard with the setup shown and
 * the map state in it. The share sheet on phones that have one, else the
 * clipboard with a short "Link copied"; where neither works, the link to copy
 * by hand.
 */
export function ShareSetupButton({ view, className }: { view: SetupView; className: string }) {
  const { t } = useTranslation();
  const city = useCityConfig();
  const isPhone = !useIsDesktop();
  const [notice, setNotice] = useState<ShareNotice>(null);

  useEffect(() => {
    if (notice?.kind !== 'copied') return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const share = async () => {
    const url = shareUrl(window.location.origin, city.id, sharedOf(view), pickMapState(useCommandCenter.getState()));
    if (isPhone && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t('setup.shareTitle', { city: city.name }), url });
        return;
      } catch (err) {
        // Closing the share sheet is no failure; anything else falls back to the clipboard.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ kind: 'copied' });
    } catch {
      setNotice({ kind: 'failed', url });
    }
  };

  return (
    <div>
      <button type="button" className={className} onClick={() => void share()}>
        {t('setup.share')}
      </button>
      <p role="status" className="px-2 text-xs text-muted">
        {notice?.kind === 'copied' && t('setup.copied')}
        {notice?.kind === 'failed' && (
          <label className="flex flex-wrap items-center gap-2 py-1">
            {t('setup.copyFailed')}
            <input
              type="text"
              readOnly
              value={notice.url}
              onFocus={(e) => e.target.select()}
              className="min-h-6 w-full rounded border border-border bg-surface-1 px-1 text-xs"
            />
          </label>
        )}
      </p>
    </div>
  );
}
