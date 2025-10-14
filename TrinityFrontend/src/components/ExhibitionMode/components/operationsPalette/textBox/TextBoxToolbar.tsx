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
  Palette as PaletteIcon,
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
  const iconButtonClasses = (active?: boolean) =>
    cn(
      'h-8 w-8 rounded-full border border-transparent text-foreground transition-colors',
      active
        ? 'bg-emerald-500 text-white shadow-sm'
        : 'bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground',
    );

  const controlChipClasses = 'h-8 rounded-full px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40';

  return (
    <div className="relative flex items-center gap-2 rounded-full border border-border/70 bg-background/95 px-4 py-3 text-sm shadow-[0_24px_48px_-22px_rgba(124,58,237,0.45)] backdrop-blur-lg">
      <div className="pointer-events-none absolute inset-x-6 top-[6px] h-[3px] rounded-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-emerald-500 opacity-80" />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="relative h-8 min-w-[140px] justify-between rounded-full border border-border/50 px-3 text-xs font-medium text-foreground hover:bg-muted/40"
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
              >
                {option}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <span className="h-6 w-px rounded-full bg-border/60" />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onClick={onDecreaseFontSize}
        type="button"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <span className="w-10 text-center text-sm font-semibold text-foreground">{fontSize}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onClick={onIncreaseFontSize}
        type="button"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <span className="h-6 w-px rounded-full bg-border/60" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(bold)}
          onClick={onToggleBold}
          type="button"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(italic)}
          onClick={onToggleItalic}
          type="button"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(underline)}
          onClick={onToggleUnderline}
          type="button"
        >
          <Underline className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(strikethrough)}
          onClick={onToggleStrikethrough}
          type="button"
        >
          <Strikethrough className="h-4 w-4" />
        </Button>
      </div>

      <span className="h-6 w-px rounded-full bg-border/60" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(align === 'left')}
          onClick={() => onAlign('left')}
          type="button"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(align === 'center')}
          onClick={() => onAlign('center')}
          type="button"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClasses(align === 'right')}
          onClick={() => onAlign('right')}
          type="button"
        >
          <AlignRight className="h-4 w-4" />
        </Button>
      </div>

      <span className="h-6 w-px rounded-full bg-border/60" />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        onClick={() => onBulletedList?.()}
        type="button"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        onClick={() => onNumberedList?.()}
        type="button"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      <span className="h-6 w-px rounded-full bg-border/60" />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 p-0"
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
          className="z-[4000] w-48 rounded-xl border border-border/70 bg-background/95 p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2">
            <input
              type="color"
              value={color}
              onChange={event => onColorChange(event.target.value)}
              className="h-10 w-full cursor-pointer rounded-lg border border-border"
            />
            <PaletteIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        </PopoverContent>
      </Popover>

      <span className="h-6 w-px rounded-full bg-border/60" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onRequestEffects}
          className={controlChipClasses}
        >
          Effects
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onRequestAnimate}
          className={cn(controlChipClasses, 'gap-1 text-purple-500 hover:text-purple-400')}
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
        >
          <Move className="h-4 w-4" />
          Position
        </Button>
      </div>

      {onDelete && (
        <>
          <span className="h-6 w-px rounded-full bg-border/60" />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={onDelete}
            className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
};

export default TextBoxToolbar;
