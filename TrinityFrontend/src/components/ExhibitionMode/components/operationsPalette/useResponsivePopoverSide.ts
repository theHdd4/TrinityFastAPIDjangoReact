import { useEffect, useState, type RefObject } from 'react';

const DEFAULT_ESTIMATED_HEIGHT = 420;

export const useResponsivePopoverSide = (
  triggerRef: RefObject<HTMLElement | null>,
  open: boolean,
  estimatedHeight = DEFAULT_ESTIMATED_HEIGHT,
): 'top' | 'bottom' => {
  const [side, setSide] = useState<'top' | 'bottom'>('bottom');

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateSide = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const spaceAbove = rect.top;
      const spaceBelow = viewportHeight - rect.bottom;

      const nextSide: 'top' | 'bottom' =
        spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';

      setSide(current => (current === nextSide ? current : nextSide));
    };

    updateSide();

    window.addEventListener('resize', updateSide);
    window.addEventListener('scroll', updateSide, true);

    return () => {
      window.removeEventListener('resize', updateSide);
      window.removeEventListener('scroll', updateSide, true);
    };
  }, [estimatedHeight, open, triggerRef]);

  return side;
};

export default useResponsivePopoverSide;
