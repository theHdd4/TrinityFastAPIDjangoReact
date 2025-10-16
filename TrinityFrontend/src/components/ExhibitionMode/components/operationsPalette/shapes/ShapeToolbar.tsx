import React from 'react';
import {
  ChevronsDown,
  ChevronsUp,
  Droplet,
  Minus,
  Move,
  Palette as PaletteIcon,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

  const strokeButton = (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/50 p-0"
          onMouseDown={handleToolbarMouseDown}
        >
          <span className="sr-only">Shape outline color</span>
          <span
            className="relative flex h-5 w-5 items-center justify-center rounded-full border border-white/70 shadow-inner"
            style={{ backgroundColor: stroke === 'transparent' ? 'rgba(255,255,255,0.7)' : stroke }}
          >
            <Droplet className="h-3 w-3 text-muted-foreground" />
          </span>
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
            value={stroke === 'transparent' ? '#111827' : stroke}
            onChange={event => onStrokeChange(event.target.value)}
            className="h-10 w-full cursor-pointer rounded-lg border border-border"
          />
          <Droplet className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="mt-3 flex justify-between text-[11px] text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="h-7 rounded-full px-3 text-[11px] font-medium"
            onClick={() => onStrokeChange('transparent')}
            onMouseDown={handleToolbarMouseDown}
          >
            Transparent
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="h-7 rounded-full px-3 text-[11px] font-medium"
            onClick={() => onStrokeChange('#111827')}
            onMouseDown={handleToolbarMouseDown}
          >
            Reset
          </Button>
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

      {strokeButton}

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
      <span className="w-12 shrink-0 text-center text-sm font-semibold text-foreground">{Math.round(strokeWidth)}</span>
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
