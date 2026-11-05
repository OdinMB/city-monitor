import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkylineSeparator } from './SkylineSeparator';

describe('SkylineSeparator', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<SkylineSeparator cityId="berlin" />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the city in one svg', () => {
    const { container } = render(<SkylineSeparator cityId="koeln" />);

    const svgs = [...container.querySelectorAll('svg')];
    expect(svgs).toHaveLength(1);
    expect(svgs[0]!.querySelector('path')).not.toBeNull();
  });
});
