import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Keyboard handler for ARIA tabs pattern (arrow keys + Home/End).
 * Moves focus between tab buttons using roving tabindex. In a right-to-left
 * UI language the tabs run from right to left, so ArrowLeft moves to the next
 * tab and ArrowRight to the previous one.
 */
export function useTabKeys(count: number, activeIndex: number, onSelect: (i: number) => void) {
  const { i18n } = useTranslation();
  const rtl = i18n.dir(i18n.language) === 'rtl';
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const setTabRef = useCallback((index: number) => (el: HTMLButtonElement | null) => {
    tabRefs.current[index] = el;
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const nextKey = rtl ? 'ArrowLeft' : 'ArrowRight';
    const prevKey = rtl ? 'ArrowRight' : 'ArrowLeft';
    let next = activeIndex;
    if (e.key === nextKey) next = (activeIndex + 1) % count;
    else if (e.key === prevKey) next = (activeIndex - 1 + count) % count;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else return;

    e.preventDefault();
    onSelect(next);
    tabRefs.current[next]?.focus();
  }, [count, activeIndex, onSelect, rtl]);

  return { setTabRef, onKeyDown };
}
