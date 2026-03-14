import { useEffect, type RefObject } from 'react';

/**
 * Applies a parallax translateY to the referenced element as the user scrolls.
 * Desktop only. Respects prefers-reduced-motion.
 * @param ref - Element to apply parallax to
 * @param factor - Scroll multiplier (0.3 = 30% of scroll speed)
 */
export function useScrollParallax(ref: RefObject<HTMLElement | null>, factor = 0.3) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip on mobile
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return;

    // Skip if user prefers reduced motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let ticking = false;

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (el) {
            el.style.transform = `translateY(${window.scrollY * factor}px)`;
          }
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ref, factor]);
}
