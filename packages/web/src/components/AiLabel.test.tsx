import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { AiLabel } from './AiLabel';
import { AI_COPY_LANGS, APPROVED_AI_COPY } from '../test-fixtures/approved-ai-copy';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('AiLabel', () => {
  it.each(AI_COPY_LANGS)('shows one tag with the approved text, accessible name and tooltip (%s)', async (lang) => {
    const copy = APPROVED_AI_COPY[lang];
    await i18n.changeLanguage(lang);
    render(<AiLabel />);

    // The tooltip reaches screen readers as the tag's accessible description.
    const tag = screen.getByRole('img', { name: copy.generated, description: copy.tooltip });
    expect(tag.textContent).toBe(copy.generated);
    expect(tag.getAttribute('title')).toBe(copy.tooltip);
    // One tag: no separate badge, icon or inner fragments.
    expect(tag.children).toHaveLength(0);
    expect(tag.getAttribute('lang')).toBe(lang);
  });

  it('runs right-to-left in Arabic', async () => {
    await i18n.changeLanguage('ar');
    render(<AiLabel />);
    const tag = screen.getByRole('img', { name: APPROVED_AI_COPY.ar.generated });
    expect(tag.getAttribute('dir')).toBe('rtl');
  });

  it('runs left-to-right in a left-to-right language', () => {
    render(<AiLabel />);
    expect(screen.getByRole('img', { name: APPROVED_AI_COPY.en.generated }).getAttribute('dir')).toBe('ltr');
  });
});
