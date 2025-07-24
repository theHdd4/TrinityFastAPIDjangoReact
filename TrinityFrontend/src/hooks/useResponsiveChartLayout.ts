import { useState, useEffect, useRef, useCallback } from 'react';

export interface LayoutConfig {
  columns: number;
  rows: number;
  layout: 'horizontal' | 'mixed' | 'vertical';
  cardWidth: string;
  cardHeight: string;
  containerClass: string;
}

export interface ChartLayoutDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

export const useResponsiveChartLayout = (
  numberOfCharts: number,
  containerRef: React.RefObject<HTMLElement>
) => {
  const [dimensions, setDimensions] = useState<ChartLayoutDimensions>({
    width: 1200,
    height: 600,
    aspectRatio: 2
  });
  
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig>({
    columns: 3,
    rows: 1,
    layout: 'horizontal',
    cardWidth: '1fr',
    cardHeight: 'auto',
    containerClass: 'grid-cols-3'
  });

  const resizeObserver = useRef<ResizeObserver | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Calculate optimal layout based on container dimensions and number of charts
  const calculateLayout = useCallback((width: number, height: number, chartCount: number): LayoutConfig => {
    const aspectRatio = width / height;
    const availableWidth = width - 48; // Account for padding (24px each side)
    const availableHeight = height - 160; // Account for header (120px) + margins (40px)
    
    // Minimum card dimensions for readability
    const minCardWidth = 300;
    const minCardHeight = 200;
    
    if (chartCount === 1) {
      return {
        columns: 1,
        rows: 1,
        layout: 'horizontal',
        cardWidth: '1fr',
        cardHeight: `${Math.max(availableHeight, minCardHeight)}px`,
        containerClass: 'grid-cols-1'
      };
    }
    
    if (chartCount === 2) {
      // For 2 charts, prefer side-by-side and use full available height
      if (availableWidth >= minCardWidth * 2 + 24) { // 24px gap
        return {
          columns: 2,
          rows: 1,
          layout: 'horizontal',
          cardWidth: '1fr',
          cardHeight: `${Math.max(availableHeight, minCardHeight)}px`, // Use full height, no cap
          containerClass: 'grid-cols-2'
        };
      } else {
        // Stack vertically but give generous height to each
        const cardHeight = Math.max((availableHeight - 24) / 2, minCardHeight);
        return {
          columns: 1,
          rows: 2,
          layout: 'vertical',
          cardWidth: '1fr',
          cardHeight: `${cardHeight}px`,
          containerClass: 'grid-cols-1'
        };
      }
    }
    
    // Fallback for any other case (shouldn't happen with max 2 charts)
    return {
      columns: Math.min(chartCount, 2),
      rows: Math.ceil(chartCount / 2),
      layout: 'horizontal',
      cardWidth: '1fr',
      cardHeight: `${Math.max(availableHeight / Math.ceil(chartCount / 2), minCardHeight)}px`,
      containerClass: `grid-cols-${Math.min(chartCount, 2)}`
    };
  }, []);

  // Debounced resize handler
  const handleResize = useCallback((entries: ResizeObserverEntry[]) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        const newDimensions = {
          width,
          height,
          aspectRatio: width / height
        };
        
        setDimensions(newDimensions);
        setLayoutConfig(calculateLayout(width, height, numberOfCharts));
      }
    }, 150); // 150ms debounce
  }, [numberOfCharts, calculateLayout]);

  // Set up ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    resizeObserver.current = new ResizeObserver(handleResize);
    resizeObserver.current.observe(containerRef.current);

    // Initial calculation
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth && clientHeight) {
      setDimensions({
        width: clientWidth,
        height: clientHeight,
        aspectRatio: clientWidth / clientHeight
      });
      setLayoutConfig(calculateLayout(clientWidth, clientHeight, numberOfCharts));
    }

    return () => {
      if (resizeObserver.current) {
        resizeObserver.current.disconnect();
      }
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [containerRef, handleResize, numberOfCharts, calculateLayout]);

  // Update layout when number of charts changes
  useEffect(() => {
    const newLayout = calculateLayout(dimensions.width, dimensions.height, numberOfCharts);
    console.log(`[ChartLayout] Charts: ${numberOfCharts}, Dimensions: ${dimensions.width}x${dimensions.height}, Layout: ${newLayout.layout} (${newLayout.columns}x${newLayout.rows})`);
    setLayoutConfig(newLayout);
  }, [numberOfCharts, dimensions.width, dimensions.height, calculateLayout]);

  return {
    dimensions,
    layoutConfig,
    isCompact: dimensions.width < 768,
    isMedium: dimensions.width >= 768 && dimensions.width < 1200,
    isLarge: dimensions.width >= 1200
  };
};
