import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ImprintPage } from './ImprintPage.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

describe('ImprintPage', () => {
  it('serves the profile photo from the site itself', () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <ImprintPage />
        </MemoryRouter>
      </HelmetProvider>,
    );

    const photo = screen.getByRole('img', { name: 'Odin Mühlenbein' });
    const src = photo.getAttribute('src') ?? '';
    // A same-origin path is covered by the CSP's img-src 'self'; an external
    // host would be blocked unless render.yaml allows it.
    expect(src).toMatch(/^\/[^/]/);
    expect(existsSync(join(PUBLIC_DIR, src)), src).toBe(true);
    expect(photo.getAttribute('width')).toBe('72');
    expect(photo.getAttribute('height')).toBe('72');
  });
});
