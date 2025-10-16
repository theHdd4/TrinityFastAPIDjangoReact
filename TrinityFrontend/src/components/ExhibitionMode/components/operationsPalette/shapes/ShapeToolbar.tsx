import React from 'react';
import {
  Check,
  ChevronsDown,
  ChevronsUp,
  Minus,
  Move,
  Palette as PaletteIcon,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ShapeToolbarProps {
  label: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  supportsFill: boolean;
  onFillChange?: (color: string) => void;
  onStrokeChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
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

const OUTLINE_COLORS: readonly string[] = [
  '#111827',
  '#1f2937',
  '#4b5563',
  '#6b7280',
  '#0f172a',
  '#2563eb',
  '#1d4ed8',
  '#4338ca',
  '#7c3aed',
  '#9333ea',
  '#be123c',
  '#dc2626',
  '#f97316',
  '#facc15',
  '#10b981',
  '#14b8a6',
  '#0ea5e9',
  '#38bdf8',
  '#34d399',
  '#f472b6',
  '#fcd34d',
  '#ffffff',
  '#000000',
];

const OUTLINE_WIDTH_OPTIONS: readonly number[] = [1, 2, 3, 4, 6, 8, 12];

const ShapeToolbar: React.FC<ShapeToolbarProps> = ({
  label,
  fill,
  stroke,
  strokeWidth,
  opacity,
  supportsFill,
  onFillChange,
  onStrokeChange,
  onStrokeWidthChange,
  onOpacityChange,
  onBringToFront,
  onSendToBack,
  onRequestAnimate,
  onRequestPosition,
  onDelete,
}) => {
  const handleToolbarMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  const handleDecreaseStrokeWidth = () => {
    const next = clampStrokeWidth(strokeWidth - 1);
    onStrokeWidthChange(next);
  };

  const handleIncreaseStrokeWidth = () => {
    const next = clampStrokeWidth(strokeWidth + 1);
    onStrokeWidthChange(next);
  };

  const handleOpacityInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value) / 100;
    onOpacityChange(clampOpacity(Number.isFinite(value) ? value : opacity));
  };

  const handleOutlineColorSelect = (color: string) => {
    onStrokeChange(color);
  };

  const handleNoOutline = () => {
    onStrokeChange('transparent');
    onStrokeWidthChange(0);
  };

  const handleResetOutline = () => {
    onStrokeChange('#111827');
    onStrokeWidthChange(supportsFill ? 2 : 6);
  };

  const isOutlineDisabled = stroke === 'transparent' || strokeWidth <= 0;
  const displayedStrokeWidth = Math.round(strokeWidth);

  const outlinePreviewStyle = isOutlineDisabled
    ? {
        backgroundImage:
          'linear-gradient(45deg, rgba(148, 163, 184, 0.6) 25%, transparent 25%), linear-gradient(-45deg, rgba(148, 163, 184, 0.6) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.6) 75%), linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.6) 75%)',
        backgroundSize: '8px 8px',
        backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
      }
    : { backgroundColor: stroke };

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
        className="z-[4000] w-48 rounded-xl border border-border/70 bg-background/95 p-3 shadow-2xl"
        data-text-toolbar-root
      >
        <div className="flex items-center justify-between gap-2">
          <input
            type="color"
            value={fill || '#111827'}
            disabled={!supportsFill || !onFillChange}
            onChange={event => onFillChange?.(event.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-border"
          />
          <PaletteIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      </PopoverContent>
    </Popover>
  );

  const outlineButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 text-[11px] font-medium text-foreground hover:bg-muted/40"
          onMouseDown={handleToolbarMouseDown}
        >
          <span className="flex items-center gap-2">
            <span className="relative flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-background">
              <span className="absolute inset-[3px] rounded-full shadow-inner" style={outlinePreviewStyle} />
            </span>
            <span>Outline</span>
          </span>
          <span className="ml-1 text-[10px] text-muted-foreground">
            {isOutlineDisabled ? 'None' : `${displayedStrokeWidth} px`}
          </span>
          <span className="ml-1 text-[9px] text-muted-foreground">▼</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="z-[4000] w-60 rounded-xl border border-border/70 bg-background/95 p-2 shadow-2xl"
      >
        <DropdownMenuLabel className="px-2 text-[11px] font-semibold text-muted-foreground">Outline</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
            onMouseDown={handleToolbarMouseDown}
          >
            <PaletteIcon className="h-4 w-4 text-muted-foreground" />
            <span>Color</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64 rounded-xl border border-border/60 bg-background/95 p-3 shadow-xl">
            <div className="grid grid-cols-6 gap-2">
              {OUTLINE_COLORS.map(color => {
                const isActive = !isOutlineDisabled && stroke.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleOutlineColorSelect(color)}
                    onMouseDown={handleToolbarMouseDown}
                    className={cn(
                      'relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-border/60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      isActive && 'border-primary ring-2 ring-primary/60 ring-offset-1 ring-offset-background',
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={`Set outline color to ${color}`}
                  >
                    {isActive && <Check className="h-3 w-3 text-white" />}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleNoOutline}
                onMouseDown={handleToolbarMouseDown}
                className={cn(
                  'relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-border/60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  isOutlineDisabled && 'border-primary ring-2 ring-primary/60 ring-offset-1 ring-offset-background',
                )}
                aria-label="Remove outline"
              >
                <span className="absolute inset-[1px] rounded-full" style={outlinePreviewStyle} />
                {isOutlineDisabled && <Check className="relative z-10 h-3 w-3 text-white" />}
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="color"
                value={stroke === 'transparent' ? '#111827' : stroke}
                onChange={event => handleOutlineColorSelect(event.target.value)}
                className="h-10 w-full cursor-pointer rounded-lg border border-border"
              />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="h-8 rounded-full px-3 text-[11px] font-medium"
                onClick={handleResetOutline}
                onMouseDown={handleToolbarMouseDown}
              >
                Default
              </Button>
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
            onMouseDown={handleToolbarMouseDown}
          >
            <span>Weight</span>
            <span className="text-[11px] text-muted-foreground">{displayedStrokeWidth} px</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44 rounded-xl border border-border/60 bg-background/95 p-2 shadow-xl">
            <div className="flex flex-col gap-1">
              {OUTLINE_WIDTH_OPTIONS.map(option => {
                const isActive = Math.abs(strokeWidth - option) < 0.5;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onStrokeWidthChange(option)}
                    onMouseDown={handleToolbarMouseDown}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40',
                      isActive && 'bg-primary/10 text-primary',
                    )}
                  >
                    <span>{option} px</span>
                    {isActive && <Check className="h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={event => {
            event.preventDefault();
            handleNoOutline();
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
        >
          No outline
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={event => {
            event.preventDefault();
            handleResetOutline();
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
        >
          Reset outline
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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

      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="h-8 w-8 shrink-0 rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onClick={handleDecreaseStrokeWidth}
        onMouseDown={handleToolbarMouseDown}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <span className="w-12 shrink-0 text-center text-sm font-semibold text-foreground">{displayedStrokeWidth}</span>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="h-8 w-8 shrink-0 rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onClick={handleIncreaseStrokeWidth}
        onMouseDown={handleToolbarMouseDown}
      >
        <Plus className="h-4 w-4" />
      </Button>

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
