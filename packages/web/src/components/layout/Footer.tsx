/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="px-4 py-3 text-xs text-gray-400 border-t border-gray-200 dark:border-gray-800 flex gap-4 flex-wrap">
      <a
        href="https://github.com/OdinMB/city-monitor"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline"
      >
        {t('footer.sourceCode')}
      </a>
      <a
        href="https://github.com/ellie-xyb/worldmonitor"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline"
      >
        {t('footer.basedOn')}
      </a>
      <span>{t('footer.license')}</span>
    </footer>
  );
}
