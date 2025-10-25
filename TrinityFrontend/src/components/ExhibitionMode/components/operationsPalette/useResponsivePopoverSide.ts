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

export const usePanelAlignedPopoverOffset = (
  triggerRef: RefObject<HTMLElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  open: boolean,
): number => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateOffset = () => {
      const trigger = triggerRef.current;
      const container = containerRef.current;

      if (!trigger || !container) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const triggerCenter = triggerRect.left + triggerRect.width / 2;
      const containerCenter = containerRect.left + containerRect.width / 2;

      const nextOffset = containerCenter - triggerCenter;

      setOffset(current => (Math.abs(current - nextOffset) < 0.5 ? current : nextOffset));
    };

    updateOffset();

    window.addEventListener('resize', updateOffset);
    window.addEventListener('scroll', updateOffset, true);

    return () => {
      window.removeEventListener('resize', updateOffset);
      window.removeEventListener('scroll', updateOffset, true);
    };
  }, [containerRef, open, triggerRef]);

  return offset;
};
