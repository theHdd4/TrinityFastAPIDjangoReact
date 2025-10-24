import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ColorTrayOption {
  id: string;
  value?: string;
  label?: string;
  ariaLabel?: string;
  swatchClassName?: string;
  swatchStyle?: React.CSSProperties;
  preview?: React.ReactNode;
  disabled?: boolean;
}

export interface ColorTrayProps {
  options: readonly ColorTrayOption[];
  selectedId?: string | null;
  onSelect?: (option: ColorTrayOption) => void;
  columns?: number;
  className?: string;
  optionClassName?: string;
  showLabels?: boolean;
  disabled?: boolean;
  swatchSize?: 'sm' | 'md' | 'lg';
}

const swatchSizeMap: Record<NonNullable<ColorTrayProps['swatchSize']>, string> = {
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-2xl',
};

export const ColorTray: React.FC<ColorTrayProps> = ({
  options,
  selectedId,
  onSelect,
  columns,
  className,
  optionClassName,
  showLabels = true,
  disabled = false,
  swatchSize = 'md',
}) => {
  const gridTemplate = columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined;
  const resolvedSelectedId = selectedId?.toLowerCase() ?? null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        className={cn('grid gap-2', columns ? 'auto-rows-fr' : 'grid-cols-6')}
        style={gridTemplate}
      >
        {options.map(option => {
          const optionId = option.id.toLowerCase();
          const isSelected = resolvedSelectedId === optionId;
          const isDisabled = disabled || option.disabled;
          const ariaLabel = option.ariaLabel ?? option.label ?? option.value ?? option.id;

          return (
            <button
              key={option.id}
              type="button"
              aria-label={ariaLabel}
              onClick={() => {
                if (!isDisabled) {
                  onSelect?.(option);
                }
              }}
              className={cn(
                'group relative flex min-h-[4.5rem] flex-col items-center justify-start gap-1 rounded-2xl border border-border/60 bg-background/95 p-2 text-[11px] font-medium text-muted-foreground transition-colors',
                'hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                isSelected && 'border-primary text-foreground shadow-sm ring-2 ring-primary/30',
                isDisabled && 'cursor-not-allowed opacity-60 hover:border-border/60 hover:text-muted-foreground',
                optionClassName,
              )}
              disabled={isDisabled}
            >
              <span
                className={cn(
                  'relative flex items-center justify-center border border-border/40 bg-background shadow-inner transition-all',
                  swatchSizeMap[swatchSize],
                  option.swatchClassName,
                )}
                style={option.swatchStyle}
              >
                {option.preview ?? null}
                {isSelected && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/20">
                    <Check className="h-4 w-4 text-white" />
                  </span>
                )}
              </span>
              {showLabels && option.label ? <span className="text-center leading-tight">{option.label}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ColorTray;
