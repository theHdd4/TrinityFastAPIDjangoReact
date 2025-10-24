import React from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Minus,
  Move,
  Plus,
  Sparkles,
  Strikethrough,
  Trash2,
  Underline,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { TextAlignOption } from './types';
import { FONT_OPTIONS } from './constants';
import {
  ColorTray,
  DEFAULT_SOLID_COLOR_OPTIONS,
  DEFAULT_GRADIENT_COLOR_OPTIONS,
  type ColorTrayOption,
  type ColorTraySection,
} from '@/templates/color-tray';

const TEXT_GRADIENT_OPTIONS: readonly ColorTrayOption[] = DEFAULT_GRADIENT_COLOR_OPTIONS.map(option => ({
  ...option,
  disabled: true,
})) as readonly ColorTrayOption[];

const TEXT_COLOR_SECTIONS: readonly ColorTraySection[] = [
  {
    id: 'solids',
    label: 'Solid colors',
    options: DEFAULT_SOLID_COLOR_OPTIONS,
  },
  {
    id: 'gradients',
    label: 'Gradients',
    options: TEXT_GRADIENT_OPTIONS,
  },
];

interface TextBoxToolbarProps {
  fontFamily: string;
  onFontFamilyChange: (font: string) => void;
  fontSize: number;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleUnderline: () => void;
  onToggleStrikethrough: () => void;
  align: TextAlignOption;
  onAlign: (align: TextAlignOption) => void;
  onBulletedList?: () => void;
  onNumberedList?: () => void;
  color: string;
  onColorChange: (color: string) => void;
  onRequestEffects?: () => void;
  onRequestAnimate?: () => void;
  onRequestPosition?: () => void;
  onDelete?: () => void;
}

export const TextBoxToolbar: React.FC<TextBoxToolbarProps> = ({
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onIncreaseFontSize,
  onDecreaseFontSize,
  bold,
  italic,
  underline,
  strikethrough,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onToggleStrikethrough,
  align,
  onAlign,
  onBulletedList,
  onNumberedList,
  color,
  onColorChange,
  onRequestEffects,
  onRequestAnimate,
  onRequestPosition,
  onDelete,
}) => {
  const handleToolbarMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  const iconButtonClasses = (active?: boolean) =>
    cn(
      'h-8 w-8 shrink-0 rounded-full border border-transparent text-foreground transition-colors',
      active
        ? 'bg-emerald-500 text-white shadow-sm'
        : 'bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground',
    );

  const controlChipClasses = 'h-8 shrink-0 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40';

  const normalizedColorId =
    typeof color === 'string' && color.startsWith('#')
      ? `solid-${color.slice(1).toLowerCase()}`
      : color?.toLowerCase?.() ?? '';

  return (
    <div
      className="relative flex w-full max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-background/95 px-2.5 py-2.5 text-sm shadow-[0_24px_48px_-22px_rgba(124,58,237,0.45)] backdrop-blur-lg"
      data-text-toolbar-root
    >

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="relative h-8 min-w-[112px] justify-between rounded-full border border-border/50 px-3 text-[11px] font-medium text-foreground hover:bg-muted/40"
            onMouseDown={handleToolbarMouseDown}
          >
            <span className="truncate" style={{ fontFamily }}>
              {fontFamily}
            </span>
            <span className="ml-2 text-[10px] text-muted-foreground">▼</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          className="z-[4000] w-52 max-h-64 overflow-y-auto rounded-xl border border-border/70 bg-background/95 p-2 shadow-2xl"
          data-text-toolbar-root
        >
          <div className="space-y-1">
            {FONT_OPTIONS.map(option => (
              <Button
                key={option}
                variant="ghost"
                size="sm"
                className="w-full justify-start rounded-lg px-3 text-sm text-foreground hover:bg-muted/50"
                onClick={() => onFontFamilyChange(option)}
                style={{ fontFamily: option }}
                type="button"
                onMouseDown={handleToolbarMouseDown}
              >
                {option}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onClick={onDecreaseFontSize}
        type="button"
        onMouseDown={handleToolbarMouseDown}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <span className="w-8 shrink-0 text-center text-sm font-semibold text-foreground">{fontSize}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onClick={onIncreaseFontSize}
        type="button"
        onMouseDown={handleToolbarMouseDown}
      >
        <Plus className="h-4 w-4" />
      </Button>

      <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(bold)}
          onClick={onToggleBold}
          type="button"
          onMouseDown={handleToolbarMouseDown}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(italic)}
          onClick={onToggleItalic}
          type="button"
          onMouseDown={handleToolbarMouseDown}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(underline)}
          onClick={onToggleUnderline}
          type="button"
          onMouseDown={handleToolbarMouseDown}
        >
          <Underline className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(strikethrough)}
          onClick={onToggleStrikethrough}
          type="button"
          onMouseDown={handleToolbarMouseDown}
        >
          <Strikethrough className="h-4 w-4" />
        </Button>
      </div>

      <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(align === 'left')}
          onClick={() => onAlign('left')}
          type="button"
          onMouseDown={handleToolbarMouseDown}
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(align === 'center')}
          onClick={() => onAlign('center')}
          type="button"
          onMouseDown={handleToolbarMouseDown}
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(align === 'right')}
          onClick={() => onAlign('right')}
          type="button"
          onMouseDown={handleToolbarMouseDown}
        >
          <AlignRight className="h-4 w-4" />
        </Button>
      </div>

      <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        onClick={() => onBulletedList?.()}
        type="button"
        onMouseDown={handleToolbarMouseDown}
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        onClick={() => onNumberedList?.()}
        type="button"
        onMouseDown={handleToolbarMouseDown}
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/50 p-0"
            onMouseDown={handleToolbarMouseDown}
          >
            <span
              className="h-5 w-5 rounded-full border border-white/70 shadow-inner"
              style={{ backgroundColor: color }}
            />
            <span className="sr-only">Text color</span>
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
              sections={TEXT_COLOR_SECTIONS}
              selectedId={normalizedColorId}
              onSelect={option => {
                const value = option.value ?? option.id;
                if (typeof value === 'string' && value.startsWith('#')) {
                  onColorChange(value);
                  return;
                }
                if (option.id.startsWith('solid-')) {
                  onColorChange(`#${option.id.slice(6)}`);
                }
              }}
              showLabels={false}
              swatchSize="sm"
              optionClassName="min-h-[3.25rem]"
              defaultSectionId="solids"
            />
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color || '#111827'}
                onChange={event => onColorChange(event.target.value)}
                className="h-10 w-full cursor-pointer rounded-xl border border-border"
              />
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Custom</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <span className="h-6 w-px rounded-full bg-border/60" />

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onRequestEffects}
          className={controlChipClasses}
          onMouseDown={handleToolbarMouseDown}
        >
          Effects
        </Button>
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
          <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />
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

export default TextBoxToolbar;
