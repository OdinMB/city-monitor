import { useTranslation } from 'react-i18next';

/** Full-page fallback for the top-level error boundary. */
export function AppErrorFallback({ error }: { error: unknown; resetErrorBoundary: () => void }) {
  const { t } = useTranslation();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 text-gray-900 dark:text-gray-100 p-8">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">{t('error.title')}</h1>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          {t('error.reload')}
        </button>
        <details className="text-left text-sm text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer">{t('error.details')}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{message}</pre>
        </details>
      </div>
    </div>
  );
}

/** Compact inline error shown inside a dashboard tile when a data hook fails. */
export function StripErrorFallback({ domain, onRetry }: { domain: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-2">
      <span>{t('error.loadFailed', { domain })}</span>
      <button
        type="button"
        aria-label={t('error.retry')}
        onClick={onRetry}
        className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
      >
        {t('error.retry')}
      </button>
    </div>
  );
}

/** Fallback for the map error boundary. */
export function MapErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
      <span className="text-sm">{t('error.mapUnavailable')}</span>
      <button
        type="button"
        aria-label={t('error.retry')}
        onClick={resetErrorBoundary}
        className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
      >
        {t('error.retry')}
      </button>
    </div>
  );
}
