/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App.js';

describe('App', () => {
  it('renders city picker at /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('City Monitor')).toBeDefined();
    expect(screen.getByRole('link', { name: /berlin/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /hamburg/i })).toBeDefined();
  });

  it('renders Berlin dashboard at /berlin', async () => {
    render(
      <MemoryRouter initialEntries={['/berlin']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Berlin')).toBeDefined();
    });
    expect(screen.getAllByText('News').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Briefing')).toBeDefined();
  });

  it('renders Hamburg dashboard at /hamburg', async () => {
    render(
      <MemoryRouter initialEntries={['/hamburg']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Hamburg')).toBeDefined();
    });
  });

  it('redirects unknown city to /', () => {
    render(
      <MemoryRouter initialEntries={['/unknown-city']}>
        <App />
      </MemoryRouter>,
    );
    // Should redirect to city picker
    expect(screen.getByRole('link', { name: /berlin/i })).toBeDefined();
  });

  it('renders theme toggle on dashboard', async () => {
    render(
      <MemoryRouter initialEntries={['/berlin']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /toggle theme/i })).toBeDefined();
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
