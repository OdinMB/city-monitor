import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { CityProvider } from '../hooks/CityProvider.js';
import { SourcesPage } from './SourcesPage.js';
import { AI_COPY_LANGS, APPROVED_AI_COPY } from '../test-fixtures/approved-ai-copy.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <CityProvider cityId="berlin">
        <SourcesPage />
      </CityProvider>
    </MemoryRouter>,
  );
}

describe('SourcesPage AI section', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it.each(AI_COPY_LANGS)('describes the AI processing in the UI language (%s)', async (lang) => {
    const copy = APPROVED_AI_COPY[lang];
    await i18n.changeLanguage(lang);
    renderPage();

    const heading = screen.getByRole('heading', { level: 2, name: copy.sourcesTitle });
    const section = heading.closest('section')!;
    expect(within(section).getByRole('link', { name: 'OpenAI' })).toBeTruthy();
    expect(within(section).getByText(copy.sourcesDescription)).toBeTruthy();
  });
});
