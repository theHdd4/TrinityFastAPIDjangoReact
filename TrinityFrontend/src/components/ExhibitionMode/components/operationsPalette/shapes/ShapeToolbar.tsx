import React from 'react';
import { ChevronsDown, ChevronsUp, CircleDashed, Move, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { type ShapeStrokeStyle } from './constants';
import {
  ColorTray,
  DEFAULT_SOLID_COLOR_OPTIONS,
  DEFAULT_GRADIENT_COLOR_OPTIONS,
  type ColorTrayOption,
  type ColorTraySection,
} from '@/templates/color-tray';

interface ShapeToolbarProps {
  label: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle: ShapeStrokeStyle;
  opacity: number;
  supportsFill: boolean;
  onFillChange?: (color: string) => void;
  onStrokeChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onStrokeStyleChange: (style: ShapeStrokeStyle) => void;
  onOpacityChange: (opacity: number) => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onRequestAnimate?: () => void;
  onRequestPosition?: () => void;
  onDelete?: () => void;
}

const controlChipClasses =
  'h-8 shrink-0 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40';

const Separator = () => <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />;

const clampStrokeWidth = (value: number) => Math.min(Math.max(value, 0), 60);

const clampOpacity = (value: number) => Math.min(Math.max(value, 0), 1);

const SHAPE_GRADIENT_OPTIONS: readonly ColorTrayOption[] = DEFAULT_GRADIENT_COLOR_OPTIONS.map(option => ({
  ...option,
  disabled: true,
})) as readonly ColorTrayOption[];

const SHAPE_FILL_SECTIONS: readonly ColorTraySection[] = [
  {
    id: 'solids',
    label: 'Solid colors',
    options: DEFAULT_SOLID_COLOR_OPTIONS,
  },
  {
    id: 'gradients',
    label: 'Gradients',
    options: SHAPE_GRADIENT_OPTIONS,
  },
];

const TRANSPARENT_OUTLINE_OPTION: ColorTrayOption = {
  id: 'transparent',
  value: 'transparent',
  ariaLabel: 'Remove outline',
  preview: (
    <div className="flex h-full w-full items-center justify-center rounded-[inherit] bg-background">
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
        <circle cx="10" cy="10" r="7.5" stroke="#cbd5f5" strokeWidth="1.4" fill="none" />
        <line x1="5" y1="15" x2="15" y2="5" stroke="#cbd5f5" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  ),
  groupId: 'utility',
  groupLabel: 'Utility',
  groupOrder: -2,
  toneOrder: 0,
};

const OUTLINE_SOLID_OPTIONS = [
  TRANSPARENT_OUTLINE_OPTION,
  ...DEFAULT_SOLID_COLOR_OPTIONS,
] as readonly ColorTrayOption[];

const OUTLINE_COLOR_SECTIONS: readonly ColorTraySection[] = [
  {
    id: 'solids',
    label: 'Solid colors',
    options: OUTLINE_SOLID_OPTIONS,
  },
  {
    id: 'gradients',
    label: 'Gradients',
    options: SHAPE_GRADIENT_OPTIONS,
  },
];

type OutlineStyleOptionId = 'none' | ShapeStrokeStyle;

const OUTLINE_STYLE_OPTIONS: readonly {
  id: OutlineStyleOptionId;
  label: string;
  style?: ShapeStrokeStyle;
}[] = [
  { id: 'none', label: 'No outline' },
  { id: 'solid', label: 'Solid', style: 'solid' },
  { id: 'dashed', label: 'Dashed', style: 'dashed' },
  { id: 'dash-dot', label: 'Dash dot', style: 'dash-dot' },
  { id: 'dotted', label: 'Dotted', style: 'dotted' },
];

const ShapeToolbar: React.FC<ShapeToolbarProps> = ({
  label,
  fill,
  stroke,
  strokeWidth,
  strokeStyle,
  opacity,
  supportsFill,
  onFillChange,
  onStrokeChange,
  onStrokeWidthChange,
  onStrokeStyleChange,
  onOpacityChange,
  onBringToFront,
  onSendToBack,
  onRequestAnimate,
  onRequestPosition,
  onDelete,
}) => {
  const defaultStrokeWidth = supportsFill ? 2 : 6;

  const normalizedFillId =
    typeof fill === 'string' && fill.startsWith('#')
      ? `solid-${fill.slice(1).toLowerCase()}`
      : fill?.toLowerCase?.() ?? '';

  const normalizedOutlineId = (() => {
    if (typeof stroke === 'string' && stroke.startsWith('#')) {
      return `solid-${stroke.slice(1).toLowerCase()}`;
    }
    return stroke?.toLowerCase?.() ?? '';
  })();

  const handleToolbarMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  const handleOpacityInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value) / 100;
    onOpacityChange(clampOpacity(Number.isFinite(value) ? value : opacity));
  };

  const handleOutlineColorSelect = (color: string) => {
    onStrokeChange(color);
    if (strokeWidth <= 0) {
      onStrokeWidthChange(defaultStrokeWidth);
    }
  };

  const handleNoOutline = () => {
    onStrokeChange('transparent');
    onStrokeWidthChange(0);
    onStrokeStyleChange('solid');
  };

  const handleResetOutline = () => {
    onStrokeChange('#111827');
    onStrokeWidthChange(defaultStrokeWidth);
    onStrokeStyleChange('solid');
  };

  const handleStrokeWidthSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = clampStrokeWidth(Number(event.target.value));
    onStrokeWidthChange(next);
  };

  const handleOutlineStyleSelect = (option: OutlineStyleOptionId) => {
    if (option === 'none') {
      handleNoOutline();
      return;
    }

    const nextStyle = option as ShapeStrokeStyle;
    if (stroke === 'transparent') {
      const fallbackColor = supportsFill ? fill : '#111827';
      onStrokeChange(fallbackColor);
    }

    if (strokeWidth <= 0) {
      onStrokeWidthChange(defaultStrokeWidth);
    }

    onStrokeStyleChange(nextStyle);
  };

  const isOutlineDisabled = stroke === 'transparent' || strokeWidth <= 0;
  const displayedStrokeWidth = Math.round(strokeWidth);
  const outlineIndicatorColor = isOutlineDisabled ? '#94a3b8' : stroke;
  const activeStrokeStyle = strokeStyle ?? 'solid';

  const fillButton = (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          disabled={!supportsFill || !onFillChange}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/50 p-0',
            !supportsFill && 'opacity-60',
          )}
          onMouseDown={handleToolbarMouseDown}
        >
          <span className="sr-only">Shape fill color</span>
          <span className="h-5 w-5 rounded-full border border-white/70 shadow-inner" style={{ backgroundColor: fill }} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="z-[4000] w-60 rounded-2xl border border-border/70 bg-background/95 p-3 shadow-2xl"
        data-text-toolbar-root
      >
        <div className="flex flex-col gap-3">
          <ColorTray
            sections={SHAPE_FILL_SECTIONS}
            selectedId={normalizedFillId}
            onSelect={option => {
              if (!supportsFill || !onFillChange) {
                return;
              }

              const value = option.value ?? option.id;
              if (typeof value === 'string' && value.startsWith('#')) {
                onFillChange(value);
                return;
              }
              if (option.id.startsWith('solid-')) {
                onFillChange(`#${option.id.slice(6)}`);
              }
            }}
            swatchSize="sm"
            optionClassName="min-h-[3.25rem]"
            disabled={!supportsFill || !onFillChange}
            defaultSectionId="solids"
          />
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={fill || '#111827'}
              disabled={!supportsFill || !onFillChange}
              onChange={event => onFillChange?.(event.target.value)}
              className="h-10 w-full cursor-pointer rounded-xl border border-border"
            />
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Custom</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  const outlineButton = (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 p-0 text-foreground hover:bg-muted/40"
          onMouseDown={handleToolbarMouseDown}
        >
          <span className="sr-only">Outline options</span>
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-background">
            {isOutlineDisabled ? (
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
                <circle cx="10" cy="10" r="7.5" stroke="#cbd5f5" strokeWidth="1.5" fill="none" />
                <line x1="5" y1="15" x2="15" y2="5" stroke="#cbd5f5" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <CircleDashed className="h-4 w-4" strokeWidth={2} />
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="z-[4000] w-72 rounded-2xl border border-border/70 bg-background/95 p-3 shadow-2xl"
        data-text-toolbar-root
      >
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Outline</p>
        <div className="mt-2 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {OUTLINE_STYLE_OPTIONS.map(option => {
              const isActive = option.id === 'none'
                ? isOutlineDisabled
                : !isOutlineDisabled && activeStrokeStyle === option.style;

              return (
                <button
                  key={option.id}
                  type="button"
                  onMouseDown={handleToolbarMouseDown}
                  onClick={() => handleOutlineStyleSelect(option.id)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background transition-colors hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    isActive && 'border-primary bg-primary/10 text-primary shadow-sm',
                  )}
                  aria-label={option.label}
                >
                  {option.id === 'none' ? (
                    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
                      <circle cx="10" cy="10" r="7.5" stroke="#cbd5f5" strokeWidth="1.4" fill="none" />
                      <line x1="5" y1="15" x2="15" y2="5" stroke="#cbd5f5" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 32 18" className="h-5 w-6" aria-hidden>
                      <line
                        x1="4"
                        y1="9"
                        x2="28"
                        y2="9"
                        stroke={outlineIndicatorColor}
                        strokeWidth={2.6}
                        strokeLinecap="round"
                        strokeDasharray={
                          option.style === 'dashed'
                            ? '8 6'
                            : option.style === 'dash-dot'
                            ? '10 6 3 6'
                            : option.style === 'dotted'
                            ? '2 6'
                            : undefined
                        }
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground">Color</span>
            <ColorTray
              sections={OUTLINE_COLOR_SECTIONS}
              selectedId={isOutlineDisabled ? 'transparent' : normalizedOutlineId}
              onSelect={option => {
                const value = option.value ?? option.id;
                if (value === 'transparent') {
                  handleNoOutline();
                  return;
                }
                if (typeof value === 'string' && value.startsWith('#')) {
                  handleOutlineColorSelect(value);
                  return;
                }
                if (option.id.startsWith('solid-')) {
                  handleOutlineColorSelect(`#${option.id.slice(6)}`);
                }
              }}
              swatchSize="sm"
              optionClassName="min-h-[3.25rem]"
              defaultSectionId="solids"
            />
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={stroke === 'transparent' ? '#111827' : stroke}
                onChange={event => handleOutlineColorSelect(event.target.value)}
                onMouseDown={handleToolbarMouseDown}
                className="h-10 w-full cursor-pointer rounded-xl border border-border"
              />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="h-8 rounded-full px-3 text-[11px] font-medium"
                onMouseDown={handleToolbarMouseDown}
                onClick={handleResetOutline}
              >
                Reset
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="font-semibold">Stroke weight</span>
              <span>{displayedStrokeWidth} px</span>
            </div>
            <input
              type="range"
              min={0}
              max={60}
              value={displayedStrokeWidth}
              onChange={handleStrokeWidthSliderChange}
              onMouseDown={handleToolbarMouseDown}
              className="h-1.5 w-full cursor-pointer accent-primary"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div
      className="relative flex w-full max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-background/95 px-2.5 py-2.5 text-sm shadow-[0_24px_48px_-22px_rgba(124,58,237,0.45)] backdrop-blur-lg"
      data-text-toolbar-root
    >
      <span className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[12px] font-medium text-muted-foreground">
        {label}
      </span>

      <Separator />

      {fillButton}

      <Separator />

      {outlineButton}

      <Separator />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="h-8 rounded-full border border-border/60 px-3 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40"
            onMouseDown={handleToolbarMouseDown}
          >
            Opacity {Math.round(opacity * 100)}%
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="center"
          className="z-[4000] w-56 rounded-xl border border-border/70 bg-background/95 p-4 shadow-2xl"
          data-text-toolbar-root
        >
          <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground">
            <span>Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(opacity * 100)}
              onChange={handleOpacityInputChange}
              className="h-2 w-full cursor-pointer accent-primary"
            />
          </label>
        </PopoverContent>
      </Popover>

      <Separator />

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={onBringToFront}
          onMouseDown={handleToolbarMouseDown}
        >
          <ChevronsUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={onSendToBack}
          onMouseDown={handleToolbarMouseDown}
        >
          <ChevronsDown className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onRequestAnimate}
          className={cn(controlChipClasses, 'gap-1 text-purple-500 hover:text-purple-400')}
          onMouseDown={handleToolbarMouseDown}
        >
          <Sparkles className="h-4 w-4" />
          Animate
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onRequestPosition}
          className={cn(controlChipClasses, 'gap-1')}
          onMouseDown={handleToolbarMouseDown}
        >
          <Move className="h-4 w-4" />
          Position
        </Button>
      </div>

      {onDelete && (
        <>
          <Separator />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={onDelete}
            className="h-8 w-8 shrink-0 rounded-full text-destructive hover:bg-destructive/10"
            onMouseDown={handleToolbarMouseDown}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
};

export default ShapeToolbar;
