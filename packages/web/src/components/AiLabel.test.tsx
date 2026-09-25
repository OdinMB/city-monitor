import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import i18n from 'i18next';
import { AiLabel } from './AiLabel';
import { AI_COPY_LANGS, APPROVED_AI_COPY } from '../test-fixtures/approved-ai-copy';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('AiLabel', () => {
  it.each(AI_COPY_LANGS)('shows the approved badge and text as real text, with one accessible name (%s)', async (lang) => {
    const copy = APPROVED_AI_COPY[lang];
    await i18n.changeLanguage(lang);
    render(<AiLabel />);

    const label = screen.getByRole('img', { name: copy.generated });
    expect(within(label).getByText(copy.badge)).toBeTruthy();
    expect(within(label).getByText(copy.generated)).toBeTruthy();
    expect(label.querySelector('img, svg')).toBeNull();
    expect(label.getAttribute('lang')).toBe(lang);
  });

  it('runs right-to-left in Arabic and isolates the Latin "AI" badge', async () => {
    await i18n.changeLanguage('ar');
    render(<AiLabel />);
    const label = screen.getByRole('img', { name: APPROVED_AI_COPY.ar.generated });
    expect(label.getAttribute('dir')).toBe('rtl');
    expect(within(label).getByText('AI').tagName).toBe('BDI');
  });

  it('runs left-to-right in a left-to-right language', () => {
    render(<AiLabel />);
    expect(screen.getByRole('img', { name: APPROVED_AI_COPY.en.generated }).getAttribute('dir')).toBe('ltr');
  });
});
