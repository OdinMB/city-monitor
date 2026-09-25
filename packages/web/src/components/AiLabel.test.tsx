import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { AiLabel } from './AiLabel';

// Test-only strings. The real label copy is under owner review and is not in
// the translation files yet, so these tests check the plumbing, not the words.
const TEST_COPY = { aiLabel: { badge: 'T-BADGE', generated: 'T-GENERATED', accessibleName: 'T-NAME' } };

beforeAll(() => {
  i18n.addResourceBundle('en', 'translation', TEST_COPY, true, true);
  i18n.addResourceBundle('ar', 'translation', TEST_COPY, true, true);
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('AiLabel', () => {
  it('shows the badge and its second layer as real text, not an image', () => {
    const { container } = render(<AiLabel />);
    expect(container.textContent).toContain('T-BADGE');
    expect(container.textContent).toContain('T-GENERATED');
    expect(container.querySelector('img, svg')).toBeNull();
  });

  it('gives screen readers one accessible name for the whole label', () => {
    render(<AiLabel />);
    expect(screen.getByRole('img', { name: 'T-NAME' })).toBeTruthy();
  });

  it('follows the UI language and runs right-to-left in Arabic', async () => {
    await i18n.changeLanguage('ar');
    render(<AiLabel />);
    const label = screen.getByRole('img', { name: 'T-NAME' });
    expect(label.getAttribute('lang')).toBe('ar');
    expect(label.getAttribute('dir')).toBe('rtl');
  });

  it('runs left-to-right in a left-to-right language', () => {
    render(<AiLabel />);
    expect(screen.getByRole('img', { name: 'T-NAME' }).getAttribute('dir')).toBe('ltr');
  });
});
