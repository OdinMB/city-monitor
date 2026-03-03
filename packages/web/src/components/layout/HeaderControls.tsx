/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme.js';

const LANGUAGES = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
  { code: 'tr', label: 'TR' },
  { code: 'ar', label: 'AR' },
] as const;

/**
 * Language switcher + theme toggle for the header.
 * Renders inline on desktop (lg+) and inside a hamburger menu on mobile.
 */
export function HeaderControls() {
  const { theme, toggle } = useTheme();
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const sunIcon = (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" /><path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" /><path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );

  const moonIcon = (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );

  const themeIcon = theme === 'light' ? moonIcon : sunIcon;

  const languageButtons = (className: string, onSelect?: () => void) =>
    LANGUAGES.map((lang) => (
      <button
        key={lang.code}
        onClick={() => {
          i18n.changeLanguage(lang.code);
          onSelect?.();
        }}
        className={`${className} ${
          i18n.language === lang.code
            ? 'bg-gray-200 dark:bg-gray-700 font-semibold'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
        aria-label={`${t('topbar.language')}: ${lang.label}`}
      >
        {lang.label}
      </button>
    ));

  return (
    <>
      {/* Desktop: inline language + theme */}
      <div className="hidden lg:flex items-stretch gap-2">
        <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden">
          {languageButtons('px-2 py-1 text-xs')}
        </div>
        <button
          onClick={toggle}
          className="px-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer flex items-center"
          aria-label={theme === 'light' ? t('topbar.theme.switchDark') : t('topbar.theme.switchLight')}
        >
          {themeIcon}
        </button>
      </div>

      {/* Mobile: hamburger menu */}
      <div className="lg:hidden relative" ref={menuRef}>
        <button
          ref={menuButtonRef}
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {menuOpen && (
          <div role="menu" className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 z-50 min-w-[140px]">
            <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden mb-2">
              {languageButtons('flex-1 px-2 py-1.5 text-xs', () => setMenuOpen(false))}
            </div>
            <button
              onClick={() => {
                toggle();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-left cursor-pointer"
            >
              {themeIcon}
              {theme === 'light' ? t('topbar.theme.dark') : t('topbar.theme.light')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
