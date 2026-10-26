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

describe('SourcesPage air quality credit', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  // Source entries are English in every UI language (only the AI section is
  // localized), so the credit must render unchanged whichever language is set.
  it.each(['en', 'de', 'tr', 'ar'])('credits CAMS next to Open-Meteo air quality (%s)', async (lang) => {
    await i18n.changeLanguage(lang);
    renderPage();

    const openMeteo = screen.getByRole('link', { name: 'Open-Meteo Air Quality' });
    const cams = screen.getByRole('link', { name: 'Copernicus Atmosphere Monitoring Service (CAMS)' });
    expect(cams.getAttribute('href')).toBe('https://atmosphere.copernicus.eu/');

    // The CAMS card directly follows the Open-Meteo air quality card.
    expect(openMeteo.parentElement!.nextElementSibling).toBe(cams.parentElement);

    const year = new Date().getFullYear();
    expect(
      within(cams.parentElement!).getByText(
        new RegExp(`Contains modified Copernicus Atmosphere Monitoring Service information ${year}\\.`),
      ),
    ).toBeTruthy();
    expect(
      within(cams.parentElement!).getByText(/Neither the European Commission nor ECMWF is responsible/),
    ).toBeTruthy();
  });
});

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
