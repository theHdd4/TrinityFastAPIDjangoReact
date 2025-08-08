import * as React from 'react';

interface LayoutConfig {
  layout: 'vertical' | 'horizontal' | 'grid';
  containerClass: string;
  rows: number;
}

/**
 * Determines a responsive chart layout based on chart count and container width.
 * Returns Tailwind grid classes and a compact flag used for chart sizing.
 */
export function useResponsiveChartLayout(
  chartCount: number,
  containerRef: React.RefObject<HTMLElement>
) {
  const [layoutConfig, setLayoutConfig] = React.useState<LayoutConfig>({
    layout: 'vertical',
    containerClass: 'grid-cols-1',
    rows: Math.max(1, chartCount)
  });
  const [isCompact, setIsCompact] = React.useState(false);

  React.useEffect(() => {
    function calculateLayout() {
      const width = containerRef.current?.offsetWidth ?? window.innerWidth;
      let columns = 1;
      if (width >= 1280) {
        columns = 3;
      } else if (width >= 768) {
        columns = 2;
      }

      const rows = Math.max(1, Math.ceil(chartCount / columns));
      const containerClass = columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3';
      const layout = columns === 1 ? 'vertical' : columns === 2 && chartCount <= 2 ? 'horizontal' : 'grid';

      setLayoutConfig({ layout, containerClass, rows });
      setIsCompact(width < 768);
    }

    calculateLayout();
    window.addEventListener('resize', calculateLayout);
    return () => window.removeEventListener('resize', calculateLayout);
  }, [chartCount, containerRef]);

  return { layoutConfig, isCompact };
}

export default useResponsiveChartLayout;
