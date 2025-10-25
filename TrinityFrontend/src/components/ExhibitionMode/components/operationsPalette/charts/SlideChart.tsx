import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { COLOR_SCHEMES } from './constants';
import type { ChartConfig, ChartDataRow } from './types';

interface SlideChartProps {
  data: ChartDataRow[];
  config: ChartConfig;
  className?: string;
}

export const SlideChart: React.FC<SlideChartProps> = ({ data, config, className }) => {
  const palette = useMemo(
    () => COLOR_SCHEMES.find(scheme => scheme.id === config.colorScheme) ?? COLOR_SCHEMES[0],
    [config.colorScheme],
  );

  const dataset = data.length > 0 ? data : [{ label: 'Sample', value: 1 }];

  const renderPie = (variant: 'pie' | 'donut') => {
    const total = dataset.reduce((sum, item) => sum + item.value, 0);
    const safeTotal = total === 0 ? 1 : total;
    let angle = -90;

    return (
      <svg viewBox="0 0 200 200" width="200" height="200" className="-rotate-90">
        {dataset.map((item, index) => {
          const proportion = (item.value / safeTotal) * 360;
          const start = angle;
          angle += proportion;
          const end = angle;
          const largeArc = proportion > 180 ? 1 : 0;
          const outerRadius = 90;
          const innerRadius = variant === 'donut' ? 50 : 0;

          const startX = 100 + outerRadius * Math.cos((start * Math.PI) / 180);
          const startY = 100 + outerRadius * Math.sin((start * Math.PI) / 180);
          const endX = 100 + outerRadius * Math.cos((end * Math.PI) / 180);
          const endY = 100 + outerRadius * Math.sin((end * Math.PI) / 180);

          const innerStartX = 100 + innerRadius * Math.cos((start * Math.PI) / 180);
          const innerStartY = 100 + innerRadius * Math.sin((start * Math.PI) / 180);
          const innerEndX = 100 + innerRadius * Math.cos((end * Math.PI) / 180);
          const innerEndY = 100 + innerRadius * Math.sin((end * Math.PI) / 180);

          const path =
            variant === 'donut'
              ? `M ${startX} ${startY} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endX} ${endY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX} ${innerStartY} Z`
              : `M 100 100 L ${startX} ${startY} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endX} ${endY} Z`;

          return (
            <path
              key={item.label + index}
              d={path}
              fill={palette.colors[index % palette.colors.length]}
              className="transition-transform duration-300 hover:scale-105"
              style={{ transformOrigin: '50% 50%' }}
            />
          );
        })}
      </svg>
    );
  };

  const renderBarOrColumn = (variant: 'bar' | 'column') => {
    const maxValue = Math.max(...dataset.map(item => item.value), 1);
    const isBar = variant === 'bar';

    return (
      <div
        className={cn(
          'flex h-full w-full gap-4 p-6',
          isBar ? 'flex-col justify-center' : 'items-end justify-center',
        )}
      >
        {dataset.map((item, index) => {
          const size = (item.value / maxValue) * 100;
          return (
            <div
              key={item.label + index}
              className={cn(
                'flex text-xs font-medium text-muted-foreground',
                isBar ? 'flex-row items-center gap-3' : 'flex-col items-center gap-2',
              )}
            >
              <div
                className="rounded-xl"
                style={{
                  backgroundColor: palette.colors[index % palette.colors.length],
                  width: isBar ? `${size}%` : '32px',
                  height: isBar ? '18px' : `${size}%`,
                }}
              />
              {config.showLabels && <span>{item.label}</span>}
              {config.showValues && <span className="font-semibold text-foreground">{item.value}</span>}
            </div>
          );
        })}
      </div>
    );
  };

  const renderLine = () => {
    const maxValue = Math.max(...dataset.map(item => item.value), 1);

    return (
      <svg viewBox="0 0 320 220" width="320" height="220" className="p-4">
        <polyline
          points={dataset
            .map((item, index) => {
              const x = (index / Math.max(dataset.length - 1, 1)) * 320;
              const y = 200 - (item.value / maxValue) * 180;
              return `${x},${y}`;
            })
            .join(' ')}
          fill="none"
          stroke={palette.colors[0]}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {dataset.map((item, index) => {
          const x = (index / Math.max(dataset.length - 1, 1)) * 320;
          const y = 200 - (item.value / maxValue) * 180;
          return (
            <g key={item.label + index}>
              <circle cx={x} cy={y} r={5} fill={palette.colors[index % palette.colors.length]} />
              {config.showValues && (
                <text x={x} y={y - 12} textAnchor="middle" className="fill-foreground text-xs font-semibold">
                  {item.value}
                </text>
              )}
              {config.showLabels && (
                <text x={x} y={210} textAnchor="middle" className="fill-muted-foreground text-xs">
                  {item.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-3xl border border-border/40 bg-background/90', className)}>
      <div className="flex h-full w-full items-center justify-center">
        {config.type === 'pie' || config.type === 'donut'
          ? renderPie(config.type)
          : config.type === 'line'
            ? renderLine()
            : renderBarOrColumn(config.type)}
      </div>
    </div>
  );
};

SlideChart.displayName = 'SlideChart';

export default SlideChart;
