import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { ChartConfig, ChartDataRow } from './types';
import { getColorSchemeColors, isEditableChartType } from './utils';

interface SlideChartProps {
  data: ChartDataRow[];
  config: ChartConfig;
  className?: string;
}

const normaliseData = (rows: ChartDataRow[]): ChartDataRow[] => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  return rows.map(row => ({
    label: typeof row.label === 'string' ? row.label : String(row.label ?? ''),
    value: Number.isFinite(row.value) ? row.value : Number(row.value) || 0,
  }));
};

const SlideChart: React.FC<SlideChartProps> = ({ data, config, className }) => {
  const chartData = useMemo(() => normaliseData(data), [data]);
  const colors = useMemo(() => getColorSchemeColors(config.colorScheme), [config.colorScheme]);
  const horizontalAlignment = config.horizontalAlignment ?? 'center';
  const justifyClass =
    horizontalAlignment === 'left'
      ? 'justify-start'
      : horizontalAlignment === 'right'
        ? 'justify-end'
        : 'justify-center';
  const alignItemsClass =
    horizontalAlignment === 'left'
      ? 'items-start'
      : horizontalAlignment === 'right'
        ? 'items-end'
        : 'items-center';
  const textAlignClass =
    horizontalAlignment === 'left'
      ? 'text-left'
      : horizontalAlignment === 'right'
        ? 'text-right'
        : 'text-center';
  const legendPosition = config.legendPosition ?? 'bottom';
  const legendVisible = isEditableChartType(config.type) && chartData.length > 0;
  const legendOrientation = legendPosition === 'left' || legendPosition === 'right' ? 'vertical' : 'horizontal';

  const renderLegend = (extraClass?: string) => {
    if (!legendVisible) {
      return null;
    }

    return (
      <div
        className={cn(
          'shrink-0',
          legendOrientation === 'vertical'
            ? 'flex flex-col gap-2 items-start'
            : 'flex flex-wrap gap-3 justify-center',
          extraClass,
        )}
      >
        {chartData.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/60 border border-border/30 shadow-sm"
          >
            <span
              className="inline-block h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            <span className="text-sm font-medium text-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    );
  };

  if (config.type === 'blank') {
    return (
      <div className={cn('h-full w-full flex items-center justify-center text-muted-foreground', className)}>
        <div className="text-center">
          <p className="text-sm font-medium">Blank diagram</p>
          <p className="text-xs">Add your custom content here</p>
        </div>
      </div>
    );
  }

  if (config.type === 'calendar') {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return (
      <div className={cn('h-full w-full p-6', textAlignClass, className)}>
        <div className="grid grid-cols-7 gap-1 h-full">
          {labels.map((label, idx) => (
            <div key={label} className="text-center">
              <div className="text-xs font-semibold mb-1">{label}</div>
              {[...Array(4)].map((_, cellIndex) => (
                <div
                  key={`${label}-${cellIndex}`}
                  className="h-12 rounded border border-border/50 mb-1"
                  style={{ background: idx < 5 ? `${colors[0]}20` : `${colors[1 % colors.length]}20` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (config.type === 'gantt') {
    return (
      <div className={cn('h-full w-full p-6', textAlignClass, className)}>
        <div className="space-y-3">
          {chartData.map((item, index) => (
            <div key={item.label} className="flex items-center gap-3">
              {config.showLabels && <span className="text-xs w-12 text-muted-foreground">{item.label}</span>}
              <div className="flex-1 h-8 bg-muted/30 rounded relative overflow-hidden">
                <div
                  className="absolute h-full rounded"
                  style={{
                    left: `${(index * 12) % 40}%`,
                    width: `${Math.max(10, Math.min(100, item.value))}%`,
                    background: colors[index % colors.length],
                  }}
                />
              </div>
              {config.showValues && <span className="text-xs font-semibold">{item.value}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!isEditableChartType(config.type)) {
    return (
      <div className={cn('h-full w-full flex items-center justify-center text-muted-foreground', className)}>
        Unsupported chart type
      </div>
    );
  }

  let chartContent: React.ReactNode;

  if (config.type === 'pie' || config.type === 'donut') {
    const total = chartData.reduce((sum, item) => sum + item.value, 0);
    let currentAngle = -90;

    chartContent = (
      <div className={cn('flex-1 h-full flex items-center p-4', justifyClass, textAlignClass)}>
        <div className="flex flex-col items-center gap-6">
          <svg width="220" height="220" viewBox="0 0 220 220" className="animate-fade-in">
            {chartData.map((item, index) => {
              const percentage = total === 0 ? 0 : (item.value / total) * 360;
              const startAngle = currentAngle;
              const endAngle = currentAngle + percentage;
              currentAngle = endAngle;

              const radius = 90;
              const innerRadius = config.type === 'donut' ? 50 : 0;

              const toPoint = (angle: number, r: number) => {
                return [
                  110 + r * Math.cos((angle * Math.PI) / 180),
                  110 + r * Math.sin((angle * Math.PI) / 180),
                ] as const;
              };

              const [x1, y1] = toPoint(startAngle, radius);
              const [x2, y2] = toPoint(endAngle, radius);
              const [x3, y3] = toPoint(endAngle, innerRadius);
              const [x4, y4] = toPoint(startAngle, innerRadius);

              const largeArc = percentage > 180 ? 1 : 0;

              const pathData = config.type === 'donut'
                ? `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`
                : `M 110 110 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

              return (
                <path
                  key={item.label}
                  d={pathData}
                  fill={colors[index % colors.length]}
                  className="transition-all duration-300 hover:opacity-80"
                />
              );
            })}
          </svg>
          {config.showLabels && (
            <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
              {chartData.map((item, index) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ background: colors[index % colors.length] }}
                  />
                  {item.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  } else if (config.type === 'line') {
    const maxValue = Math.max(...chartData.map(item => item.value), 0);
    const points = chartData
      .map((item, index) => {
        const x = chartData.length <= 1 ? 180 : (index / (chartData.length - 1)) * 360;
        const y = 220 - (maxValue === 0 ? 0 : (item.value / maxValue) * 180);
        return `${x},${y}`;
      })
      .join(' ');

    chartContent = (
      <div className={cn('flex-1 h-full flex items-center justify-center overflow-hidden p-6', justifyClass, textAlignClass)}>
        <svg className="h-full w-full max-w-full" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid meet">
          <polyline
            points={points}
            fill="none"
            stroke={colors[0]}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {chartData.map((item, index) => {
            const x = chartData.length <= 1 ? 180 : (index / (chartData.length - 1)) * 360;
            const y = 220 - (maxValue === 0 ? 0 : (item.value / maxValue) * 180);
            return (
              <g key={item.label}>
                <circle cx={x} cy={y} r={5} fill={colors[index % colors.length]} />
                {config.showValues && (
                  <text x={x} y={y - 12} textAnchor="middle" fontSize={12} fontWeight="bold">
                    {item.value}
                  </text>
                )}
                {config.showLabels && (
                  <text x={x} y={228} textAnchor="middle" fontSize={12}>
                    {item.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  } else {
    const maxValue = Math.max(...chartData.map(item => Math.abs(item.value)), 0);
    const isBar = config.type === 'bar';

    chartContent = (
      <div
        className={cn(
          'flex-1 h-full flex p-6 gap-4',
          isBar
            ? ['flex-col justify-center gap-3', alignItemsClass]
            : ['items-end justify-center', justifyClass],
          textAlignClass,
        )}
      >
        {chartData.map((item, index) => {
          const ratio = maxValue === 0 ? 0 : Math.max(0, Math.abs(item.value)) / maxValue;
          const percentage = ratio * 100;

          if (isBar) {
            return (
              <div
                key={item.label}
                className="flex w-full items-center gap-3 animate-fade-in"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                {config.showLabels && (
                  <span className="text-xs text-muted-foreground font-medium min-w-[64px] text-right">
                    {item.label}
                  </span>
                )}
                <div className="flex-1 h-10 rounded-lg bg-muted/40">
                  <div
                    className="h-full rounded-lg transition-all duration-300 hover:opacity-80"
                    style={{
                      width: `${percentage}%`,
                      minWidth: Math.abs(item.value) > 0 ? '4px' : '0',
                      background: colors[index % colors.length],
                    }}
                  />
                </div>
                {config.showValues && (
                  <span className="text-xs font-semibold text-foreground min-w-[36px] text-right">{item.value}</span>
                )}
              </div>
            );
          }

          return (
            <div
              key={item.label}
              className="h-full flex-1 flex flex-col justify-end items-center gap-2 animate-fade-in"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              <div
                className="w-full rounded-t-lg transition-all hover:opacity-80 hover:scale-105 animate-scale-in"
                style={{
                  height: `${percentage}%`,
                  minHeight: Math.abs(item.value) > 0 ? '4px' : '0',
                  background: colors[index % colors.length],
                  animationDelay: `${index * 150}ms`,
                }}
              />
              {config.showLabels && <span className="text-xs text-muted-foreground">{item.label}</span>}
              {config.showValues && <span className="text-xs font-semibold">{item.value}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  const outerClass = cn('h-full w-full', className);

  if (!legendVisible) {
    return <div className={cn(outerClass, 'flex')}>{chartContent}</div>;
  }

  if (legendPosition === 'top') {
    return (
      <div className={cn(outerClass, 'flex flex-col')}>
        {renderLegend('mb-4')}
        {chartContent}
      </div>
    );
  }

  if (legendPosition === 'bottom') {
    return (
      <div className={cn(outerClass, 'flex flex-col')}>
        {chartContent}
        {renderLegend('mt-4')}
      </div>
    );
  }

  if (legendPosition === 'left') {
    return (
      <div className={cn(outerClass, 'flex flex-row')}>
        {renderLegend('mr-4')}
        {chartContent}
      </div>
    );
  }

  return (
    <div className={cn(outerClass, 'flex flex-row-reverse')}>
      {renderLegend('ml-4')}
      {chartContent}
    </div>
  );
};

export default SlideChart;
export type { SlideChartProps };
