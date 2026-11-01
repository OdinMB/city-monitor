/**
 * The city's skyline silhouette between the hero map and the dashboard
 * tiles, fading out as the page scrolls. The drawings are in ../skylines/.
 */

import { useEffect, useState, useCallback } from 'react';
import { CitySkyline } from '../skylines/CitySkyline.js';

interface SkylineSeparatorProps {
  cityId: string;
}

export function SkylineSeparator({ cityId }: SkylineSeparatorProps) {
  const [opacity, setOpacity] = useState(1);

  const handleScroll = useCallback(() => {
    const vh = window.innerHeight;
    const start = 50;
    const end = vh * 0.4;
    const scrollY = window.scrollY;

    if (scrollY <= start) {
      setOpacity(1);
    } else if (scrollY >= end) {
      setOpacity(0);
    } else {
      setOpacity(1 - (scrollY - start) / (end - start));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div
      className="relative w-full overflow-hidden pointer-events-none"
      aria-hidden="true"
      style={{ opacity }}
    >
      {/* Gradient backdrop so the silhouette contrasts against the map above */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent dark:from-white/15 dark:to-transparent" />
      {/* Phones: the whole height, spire tips included */}
      <CitySkyline cityId={cityId} className="relative w-full h-16 sm:hidden" />
      {/* From tablet width up: cut at y 30, so the needles run off the top, and larger from lg */}
      <CitySkyline cityId={cityId} top={30} className="relative w-full hidden sm:block sm:h-12 lg:h-16" />
    </div>
  );
}
