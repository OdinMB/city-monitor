import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeaderControls } from './HeaderControls.js';
import { Footer } from './Footer.js';

export function PageShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col bg-surface-0 text-gray-900 dark:text-gray-100">
      <header className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-surface-1">
        <Link
          to="/"
          className="text-lg font-bold hover:opacity-80 transition-opacity"
        >
          {t('app.title')}
        </Link>
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
