import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkylineSeparator } from './SkylineSeparator';

describe('SkylineSeparator', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<SkylineSeparator cityId="berlin" />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the city in its phone and its wider-screen svg', () => {
    const { container } = render(<SkylineSeparator cityId="koeln" />);

    const svgs = [...container.querySelectorAll('svg')];
    expect(svgs).toHaveLength(2);
    expect(svgs[0]!.innerHTML).toBe(svgs[1]!.innerHTML);
    expect(svgs[0]!.querySelector('path')).not.toBeNull();
  });
});
