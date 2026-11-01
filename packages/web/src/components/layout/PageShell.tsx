import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeaderControls } from './HeaderControls.js';
import { Footer } from './Footer.js';

interface PageShellProps {
  children: ReactNode;
  /** Shown after the site name in the header: a city page's city switcher. */
  besideTitle?: ReactNode;
}

export function PageShell({ children, besideTitle }: PageShellProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col bg-surface-0 text-gray-900 dark:text-gray-100">
      <header className="flex items-center justify-between gap-2 px-4 py-1.5 border-b border-border bg-surface-1">
        {/* Wraps the switcher under the name on a narrow phone rather than
            pushing the menu button off screen. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <Link
            to="/"
            className="text-lg font-bold hover:opacity-80 transition-opacity"
          >
            {t('app.title')}
          </Link>
          {besideTitle}
        </div>
        <HeaderControls />
      </header>

      <main className="flex-1 px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}
