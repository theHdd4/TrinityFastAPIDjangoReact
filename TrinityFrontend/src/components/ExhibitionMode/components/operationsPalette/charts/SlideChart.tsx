import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { COLOR_SCHEMES, normalizeChartType } from './constants';
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
  const chartType = useMemo(() => normalizeChartType(config.type), [config.type]);
  const isDiagram = chartType === 'blank' || chartType === 'calendar' || chartType === 'gantt';

  const diagramSampleData = useMemo(
    () => [
      { label: 'Q1', value: 65 },
      { label: 'Q2', value: 78 },
      { label: 'Q3', value: 90 },
      { label: 'Q4', value: 72 },
    ],
    [],
  );

  const renderDiagram = () => {
    switch (chartType) {
      case 'blank':
        return (
          <div className="flex h-full w-full items-center justify-center bg-muted/10">
            <div className="rounded-2xl border border-dashed border-border/60 px-6 py-8 text-center">
              <p className="text-base font-semibold text-foreground">Blank diagram</p>
              <p className="mt-2 text-sm text-muted-foreground">Add your custom content here</p>
            </div>
          </div>
        );
      case 'calendar':
        return (
          <div className="flex h-full w-full items-center justify-center bg-card">
            <div className="grid h-full w-full max-w-[22rem] grid-cols-7 gap-1 p-4 text-xs">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, dayIndex) => (
                <div key={day} className="flex flex-col items-center gap-1">
                  <span className="text-[0.7rem] font-semibold text-muted-foreground">{day}</span>
                  {[...Array(4)].map((_, index) => (
                    <span
                      key={`${day}-${index}`}
                      className="flex h-10 w-full items-center justify-center rounded border border-border/40"
                      style={{ backgroundColor: `${palette.colors[(dayIndex + index) % palette.colors.length]}1f` }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      case 'gantt':
        return (
          <div className="flex h-full w-full items-center justify-center bg-card">
            <div className="flex w-full max-w-[24rem] flex-col gap-3 p-6">
              {diagramSampleData.map((item, index) => (
                <div key={item.label} className="flex items-center gap-3">
                  {config.showLabels !== false && (
                    <span className="w-12 text-xs font-medium text-muted-foreground">{item.label}</span>
                  )}
                  <div className="relative h-8 flex-1 rounded-full bg-muted/40">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full"
                      style={{
                        left: `${index * 10}%`,
                        width: `${Math.min(Math.max(item.value, 20), 100)}%`,
                        backgroundColor: palette.colors[index % palette.colors.length],
                      }}
                    />
                  </div>
                  {config.showValues && (
                    <span className="w-10 text-right text-xs font-semibold text-foreground">{item.value}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

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

  const renderBars = (variant: 'horizontalBar' | 'verticalBar') => {
    const maxValue = Math.max(...dataset.map(item => item.value), 1);
    const isHorizontal = variant === 'horizontalBar';

    const renderVerticalBar = (item: ChartDataRow, index: number) => {
      const ratio = maxValue === 0 ? 0 : item.value / maxValue;
      return (
        <div key={item.label + index} className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
          <div className="flex h-44 w-9 items-end overflow-hidden rounded-2xl bg-muted/20">
            <div
              className="w-full rounded-t-2xl transition-all duration-300"
              style={{
                backgroundColor: palette.colors[index % palette.colors.length],
                height: `${Math.max(ratio * 100, item.value > 0 ? 6 : 0)}%`,
              }}
            />
          </div>
          {config.showLabels && <span className="font-medium">{item.label}</span>}
          {config.showValues && <span className="font-semibold text-foreground">{item.value}</span>}
        </div>
      );
    };

    const renderHorizontalBar = (item: ChartDataRow, index: number) => {
      const ratio = maxValue === 0 ? 0 : item.value / maxValue;
      return (
        <div
          key={item.label + index}
          className="flex w-full flex-row items-center gap-3 text-xs font-medium text-muted-foreground"
        >
          {config.showLabels && <span className="w-16 shrink-0 text-right">{item.label}</span>}
          <div className="flex h-4 flex-1 items-center overflow-hidden rounded-2xl bg-muted/20">
            <div
              className="h-full rounded-r-2xl transition-all duration-300"
              style={{
                backgroundColor: palette.colors[index % palette.colors.length],
                width: `${Math.max(ratio * 100, item.value > 0 ? 6 : 0)}%`,
              }}
            />
          </div>
          {config.showValues && <span className="min-w-[2ch] text-right font-semibold text-foreground">{item.value}</span>}
        </div>
      );
    };

    return (
      <div
        className={cn(
          'flex h-full w-full gap-3 p-5',
          isHorizontal ? 'flex-col justify-center' : 'items-end justify-center',
        )}
      >
        {dataset.map((item, index) =>
          isHorizontal ? renderHorizontalBar(item, index) : renderVerticalBar(item, index),
        )}
      </div>
    );
  };

  const renderLineOrArea = (variant: 'line' | 'area') => {
    const maxValue = Math.max(...dataset.map(item => item.value), 1);

    return (
      <svg viewBox="0 0 240 220" width="240" height="220" className="p-4">
        {variant === 'area' && (
          <polygon
            points={`0,200 ${dataset
              .map((item, index) => {
                const x = (index / Math.max(dataset.length - 1, 1)) * 240;
                const y = 200 - (item.value / maxValue) * 170;
                return `${x},${y}`;
              })
              .join(' ')} 240,200`}
            fill={`${palette.colors[0]}33`}
            stroke="none"
          />
        )}
        <polyline
          points={dataset
            .map((item, index) => {
              const x = (index / Math.max(dataset.length - 1, 1)) * 240;
              const y = 200 - (item.value / maxValue) * 170;
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
          const x = (index / Math.max(dataset.length - 1, 1)) * 240;
          const y = 200 - (item.value / maxValue) * 170;
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
    <div className={cn('relative h-full w-full overflow-hidden rounded-3xl border border-border/40 bg-transparent', className)}>
      <div className="flex h-full w-full items-center justify-center">
        {isDiagram
          ? renderDiagram()
          : chartType === 'pie' || chartType === 'donut'
            ? renderPie(chartType)
            : chartType === 'line' || chartType === 'area'
              ? renderLineOrArea(chartType)
              : renderBars(chartType as 'horizontalBar' | 'verticalBar')}
      </div>
    </div>
  );
};

SlideChart.displayName = 'SlideChart';

export default SlideChart;
