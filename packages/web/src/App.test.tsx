import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App.js';
import { APPROVED_AI_COPY } from './test-fixtures/approved-ai-copy.js';

describe('App', () => {
  it('redirects / to /berlin', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText('BERLIN').length).toBeGreaterThanOrEqual(1);
    });
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

  it('redirects /hamburg to /berlin (Hamburg disabled)', async () => {
    render(
      <MemoryRouter initialEntries={['/hamburg']}>
        <App />
      </MemoryRouter>,
    );
    // Hamburg is not active, so it redirects to / → /berlin
    await waitFor(() => {
      expect(screen.getAllByText('BERLIN').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('redirects unknown city to /berlin', async () => {
    render(
      <MemoryRouter initialEntries={['/unknown-city']}>
        <App />
      </MemoryRouter>,
    );
    // Should redirect unknown city → / → /berlin
    await waitFor(() => {
      expect(screen.getAllByText('BERLIN').length).toBeGreaterThanOrEqual(1);
    });
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
