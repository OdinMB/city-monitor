import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from './App.js';
import { APPROVED_AI_COPY } from './test-fixtures/approved-ai-copy.js';

function LocationProbe() {
  return <output data-testid="pathname">{useLocation().pathname}</output>;
}

describe('App', () => {
  it('shows the city picker at /, with a link to every active city', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );
    const links = await screen.findAllByRole('link', { name: /^(Berlin|Hamburg)/ });
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/berlin', '/hamburg']);
    expect(screen.getByTestId('pathname').textContent).toBe('/');
  });

  it('renders Berlin dashboard at /berlin', async () => {
    render(
      <MemoryRouter initialEntries={['/berlin']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText('BERLIN').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('News').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Briefing')).toBeDefined();
  });

  it('labels the Briefing tile as AI-generated next to its heading on first load', async () => {
    render(
      <MemoryRouter initialEntries={['/berlin']}>
        <App />
      </MemoryRouter>,
    );
    const heading = (await screen.findByText('Briefing')).closest('h2')!;
    const tag = within(heading).getByRole('img', {
      name: APPROVED_AI_COPY.en.generated,
      description: APPROVED_AI_COPY.en.tooltip,
    });
    expect(tag.textContent).toBe(APPROVED_AI_COPY.en.generated);
    // One tag only: the separate "AI" badge is gone.
    expect(within(heading).queryByText('AI')).toBeNull();
  });

  it('renders the Hamburg dashboard at /hamburg', async () => {
    render(
      <MemoryRouter initialEntries={['/hamburg']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText('HAMBURG').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Briefing')).toBeDefined();
    expect(screen.queryByText('BERLIN')).toBeNull();
  });

  it('sends /koeln to the city picker (Köln not active)', async () => {
    render(
      <MemoryRouter initialEntries={['/koeln']}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe('/'));
    expect(screen.getByRole('link', { name: /^Berlin/ }).getAttribute('href')).toBe('/berlin');
    expect(screen.queryByRole('link', { name: /^Köln/ })).toBeNull();
  });

  it('sends an unknown city to the city picker', async () => {
    render(
      <MemoryRouter initialEntries={['/unknown-city']}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe('/'));
    expect(screen.getByRole('link', { name: /^Hamburg/ }).getAttribute('href')).toBe('/hamburg');
  });

  it('renders theme toggle on dashboard', async () => {
    render(
      <MemoryRouter initialEntries={['/berlin']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /switch to (dark|light) mode/i })).toBeDefined();
    });
  });

  it('renders footer on dashboard', async () => {
    render(
      <MemoryRouter initialEntries={['/berlin']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Source Code')).toBeDefined();
      expect(screen.getByText('AGPL-3.0')).toBeDefined();
    });
  });
});
