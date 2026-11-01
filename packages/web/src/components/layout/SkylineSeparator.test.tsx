import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkylineSeparator } from './SkylineSeparator';

describe('SkylineSeparator', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<SkylineSeparator cityId="berlin" />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the whole height on phones and cuts it at y 30 from tablet width up, never stretched', () => {
    const { container } = render(<SkylineSeparator cityId="koeln" />);

    const svgs = [...container.querySelectorAll('svg')];
    expect(svgs.map((svg) => svg.getAttribute('viewBox')!.split(' ')[1])).toEqual(['0', '30']);
    for (const svg of svgs) expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMax slice');
  });
});
