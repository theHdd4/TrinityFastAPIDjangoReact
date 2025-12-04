import { useRef, useCallback } from 'react';

interface UseLongPressOptions {
  onLongPress: (e: TouchEvent) => void;
  delay?: number;
  onPress?: (e: React.TouchEvent) => void;
}

export const useLongPress = ({ onLongPress, delay = 2500, onPress }: UseLongPressOptions) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const isLongPressRef = useRef(false);

  const start = useCallback((e: React.TouchEvent) => {
    isLongPressRef.current = false;
    targetRef.current = e.currentTarget as HTMLElement;
    
    timeoutRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      // Convert React TouchEvent to native TouchEvent
      const nativeEvent = e.nativeEvent as TouchEvent;
      onLongPress(nativeEvent);
    }, delay);
  }, [onLongPress, delay]);

  const clear = useCallback((e?: React.TouchEvent) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // If it wasn't a long press and onPress is provided, call onPress
    if (!isLongPressRef.current && onPress && e) {
      onPress(e);
    }
    
    isLongPressRef.current = false;
  }, [onPress]);

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
    onTouchCancel: clear,
  };
};



