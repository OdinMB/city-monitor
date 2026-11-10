import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Footer } from './Footer';

afterEach(() => cleanup());

describe('Footer', () => {
  // Simple Analytics finds its badge by this exact link; a changed URL reads as
  // a missing badge and locks the analytics dashboard after a warning.
  it('carries the Simple Analytics badge link they detect', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /^Privacy-first analytics by/ });
    expect(link.getAttribute('href')).toBe(
      'https://www.simpleanalytics.com/?utm_source=citymonitor.app&utm_content=badge',
    );
    expect(link.getAttribute('referrerpolicy')).toBe('origin');
    expect(screen.getByRole('img', { name: 'Simple Analytics' })).toBeTruthy();
  });
});
