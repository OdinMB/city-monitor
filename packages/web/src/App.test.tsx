/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.js';

describe('App', () => {
  it('renders the city name', () => {
    render(<App />);
    expect(screen.getByText('Berlin')).toBeDefined();
  });

  it('renders placeholder panels', () => {
    render(<App />);
    expect(screen.getByText('News')).toBeDefined();
    expect(screen.getByText('Weather')).toBeDefined();
    expect(screen.getByText('Transit')).toBeDefined();
    expect(screen.getByText('Events')).toBeDefined();
    expect(screen.getByText('Map')).toBeDefined();
  });

  it('renders theme toggle button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeDefined();
  });

  it('renders footer with source code link', () => {
    render(<App />);
    expect(screen.getByText('Source Code')).toBeDefined();
    expect(screen.getByText('AGPL-3.0')).toBeDefined();
  });
});
