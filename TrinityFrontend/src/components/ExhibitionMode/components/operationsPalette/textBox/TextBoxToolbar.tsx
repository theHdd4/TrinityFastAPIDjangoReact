import React from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Palette as PaletteIcon,
  Sparkles,
  Move,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
  return (
    <div
      className={cn(
        'bg-background border border-border rounded-lg shadow-xl p-2 flex flex-wrap items-center gap-1 z-[2100] min-w-[320px]'
      )}
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs min-w-[96px] justify-between">
            <span className="truncate" style={{ fontFamily }}>
              {fontFamily}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2">
          <div className="space-y-1">
            {FONT_OPTIONS.map(option => (
              <Button
                key={option}
                variant="ghost"
                size="sm"
                className="w-full justify-start"
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

      <Separator orientation="vertical" className="h-6" />

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onDecreaseFontSize}
        type="button"
      >
        -
      </Button>
      <span className="text-sm font-medium w-10 text-center">{fontSize}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onIncreaseFontSize}
        type="button"
      >
        +
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button
        variant={bold ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onToggleBold}
        type="button"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        variant={italic ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onToggleItalic}
        type="button"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        variant={underline ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onToggleUnderline}
        type="button"
      >
        <Underline className="h-4 w-4" />
      </Button>
      <Button
        variant={strikethrough ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onToggleStrikethrough}
        type="button"
      >
        <Strikethrough className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button
        variant={align === 'left' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => onAlign('left')}
        type="button"
      >
        <AlignLeft className="h-4 w-4" />
      </Button>
      <Button
        variant={align === 'center' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => onAlign('center')}
        type="button"
      >
        <AlignCenter className="h-4 w-4" />
      </Button>
      <Button
        variant={align === 'right' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => onAlign('right')}
        type="button"
      >
        <AlignRight className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onBulletedList}
        type="button"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onNumberedList}
        type="button"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <PaletteIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <input
            type="color"
            value={color}
            onChange={event => onColorChange(event.target.value)}
            className="h-8 w-32 cursor-pointer rounded border border-border"
          />
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6" />

      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs"
        onClick={onRequestEffects}
        type="button"
      >
        Effects
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs gap-1"
        onClick={onRequestAnimate}
        type="button"
      >
        <Sparkles className="h-3 w-3 text-purple-500" />
        Animate
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs gap-1"
        onClick={onRequestPosition}
        type="button"
      >
        <Move className="h-3 w-3" />
        Position
      </Button>

      {onDelete && (
        <>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-destructive"
            onClick={onDelete}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
};

export default TextBoxToolbar;
