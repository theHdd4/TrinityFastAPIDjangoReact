import React, { useEffect, useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  FileText,
  Flame,
  History,
  Italic,
  List,
  ListOrdered,
  Minus,
  Move,
  Plus,
  Search,
  Sparkles,
  Strikethrough,
  Trash2,
  Underline,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { TextAlignOption } from './types';
import {
  FONT_CATEGORY_LOOKUP,
  FONT_FILTER_CHIPS,
  FONT_MENU_SECTIONS,
  FONT_OPTIONS,
  TEXT_STYLE_PRESETS,
  type FontFilterChipId,
  type FontMenuSection,
} from './constants';
import { ensureFontLoaded, resolveFontFamily } from './fontLoading';
import {
  ColorTray,
  DEFAULT_SOLID_COLOR_OPTIONS,
  DEFAULT_GRADIENT_COLOR_OPTIONS,
  type ColorTrayOption,
  type ColorTraySection,
} from '@/templates/color-tray';
import type { TextStylePreset } from './types';

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

const FONT_SECTION_ICONS: Record<FontMenuSection['id'], LucideIcon> = {
  document: FileText,
  recommended: Sparkles,
  recent: History,
  popular: Flame,
};

const FONT_SECTION_OPTION_SUBTITLE: Record<FontMenuSection['id'], string> = {
  document: 'Document font',
  recommended: 'Recommended',
  recent: 'Recently used',
  popular: 'Popular',
};

interface TextBoxToolbarProps {
  fontFamily: string;
  onFontFamilyChange: (font: string) => void;
  fontSize: number;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  onApplyTextStyle: (preset: TextStylePreset) => void;
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
  onApplyTextStyle,
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
  const [activeFilter, setActiveFilter] = useState<FontFilterChipId | null>(null);
  const [activeTab, setActiveTab] = useState<'font' | 'styles'>('font');
  const [searchTerm, setSearchTerm] = useState('');
  const cssFontFamily = useMemo(() => resolveFontFamily(fontFamily), [fontFamily]);
  const activeTextStyleId = useMemo(() => {
    const presetMatch = TEXT_STYLE_PRESETS.find(preset => {
      if (preset.fontSize !== fontSize) {
        return false;
      }
      if (typeof preset.bold === 'boolean' && preset.bold !== bold) {
        return false;
      }
      if (typeof preset.italic === 'boolean' && preset.italic !== italic) {
        return false;
      }
      if (typeof preset.underline === 'boolean' && preset.underline !== underline) {
        return false;
      }
      if (typeof preset.strikethrough === 'boolean' && preset.strikethrough !== strikethrough) {
        return false;
      }
      return true;
    });

    return presetMatch?.id ?? null;
  }, [bold, fontSize, italic, strikethrough, underline]);

  useEffect(() => {
    FONT_OPTIONS.forEach(ensureFontLoaded);
  }, []);

  useEffect(() => {
    ensureFontLoaded(fontFamily);
  }, [fontFamily]);

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
  const tabButtonClasses = (tab: 'font' | 'styles') =>
    cn(
      'rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors',
      activeTab === tab
        ? 'bg-foreground text-background shadow-sm'
        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
    );

  const normalizedColorId =
    typeof color === 'string' && color.startsWith('#')
      ? `solid-${color.slice(1).toLowerCase()}`
      : color?.toLowerCase?.() ?? '';

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (activeTab !== 'font') {
      return [];
    }

    return FONT_MENU_SECTIONS.map(section => {
      const filterId = activeFilter;
      const filteredFonts = section.fonts.filter(font => {
        const matchesFilter =
          filterId === null || (FONT_CATEGORY_LOOKUP[font] ?? []).includes(filterId);
        const matchesSearch =
          normalizedSearch.length === 0 || font.toLowerCase().includes(normalizedSearch);
        return matchesFilter && matchesSearch;
      });

      const shouldAppendSelectedFont =
        normalizedSearch.length === 0 &&
        section.fonts.includes(fontFamily) &&
        !filteredFonts.includes(fontFamily);

      const nextFonts = shouldAppendSelectedFont
        ? [...filteredFonts, fontFamily]
        : filteredFonts;

      return {
        ...section,
        fonts: Array.from(new Set(nextFonts)),
      } satisfies FontMenuSection;
    }).filter(section => section.fonts.length > 0);
  }, [activeFilter, activeTab, fontFamily, normalizedSearch]);

  useEffect(() => {
    if (activeTab !== 'font') {
      return;
    }

    filteredSections.forEach(section => {
      section.fonts.forEach(ensureFontLoaded);
    });
  }, [activeTab, filteredSections]);

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
            className="relative h-8 min-w-[132px] justify-between rounded-full border border-border/50 px-3 text-[11px] font-medium text-foreground hover:bg-muted/40"
            onMouseDown={handleToolbarMouseDown}
          >
            <span className="truncate" style={{ fontFamily: cssFontFamily }}>
              {fontFamily}
            </span>
            <ChevronDown className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          className="z-[4000] w-[272px] rounded-2xl border border-border/60 bg-background/95 p-0 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.55)] backdrop-blur-xl"
          data-text-toolbar-root
        >
          <div className="flex flex-col">
            <div className="border-b border-border/70 px-4 pb-4 pt-5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={tabButtonClasses('font')}
                  onMouseDown={handleToolbarMouseDown}
                  onClick={() => setActiveTab('font')}
                >
                  Font
                </button>
                <button
                  type="button"
                  className={tabButtonClasses('styles')}
                  onMouseDown={handleToolbarMouseDown}
                  onClick={() => {
                    setActiveTab('styles');
                    setSearchTerm('');
                  }}
                >
                  Text styles
                </button>
              </div>
              {activeTab === 'font' ? (
                <>
                  <div className="relative mt-4">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={'Try "Calligraphy" or "Open Sans"'}
                      className="h-9 w-full rounded-full border border-border/70 bg-muted/40 pl-9 pr-4 text-xs font-medium text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-0"
                      value={searchTerm}
                      onChange={event => setSearchTerm(event.target.value)}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {FONT_FILTER_CHIPS.map(chip => {
                      const isActive = activeFilter === chip.id;

                      return (
                        <button
                          key={chip.id}
                          type="button"
                          className={cn(
                            'rounded-full border border-border/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors',
                            isActive
                              ? 'border-transparent bg-emerald-500 text-white shadow-sm'
                              : 'bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                          )}
                          onMouseDown={handleToolbarMouseDown}
                          onClick={() =>
                            setActiveFilter(previous => (previous === chip.id ? null : chip.id))
                          }
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  Choose a preset to update the size while keeping {fontFamily} applied.
                </p>
              )}
            </div>

            {activeTab === 'font' ? (
              filteredSections.length > 0 ? (
                <div className="max-h-80 space-y-5 overflow-y-auto px-4 py-4">
                  {filteredSections.map(section => {
                    const Icon = FONT_SECTION_ICONS[section.id];
                    return (
                      <div key={section.id} className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
                          {section.label}
                        </div>
                        <div className="space-y-1.5">
                          {section.fonts.map(option => {
                            const isActive = fontFamily === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                className={cn(
                                  'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors',
                                  isActive
                                    ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/40'
                                    : 'bg-transparent text-foreground hover:bg-muted/40',
                                )}
                                onClick={() => onFontFamilyChange(option)}
                                onMouseDown={handleToolbarMouseDown}
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-background text-xs font-semibold uppercase text-muted-foreground"
                                    style={{ fontFamily: resolveFontFamily(option) }}
                                  >
                                    Aa
                                  </div>
                                  <div className="flex min-w-0 flex-col leading-tight">
                                    <span
                                      className="truncate text-sm font-semibold"
                                      style={{ fontFamily: resolveFontFamily(option) }}
                                    >
                                      {option}
                                    </span>
                                    <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground/80">
                                      {FONT_SECTION_OPTION_SUBTITLE[section.id]}
                                    </span>
                                  </div>
                                </div>
                                {isActive ? <Check className="h-4 w-4 text-emerald-500" /> : null}
                              </button>
                            );
                          })}
                        </div>
                        {section.id === 'recent' ? (
                          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">Brand Kit</p>
                                <p className="text-xs text-muted-foreground">Add your brand fonts in Brand Kit</p>
                              </div>
                              <button
                                type="button"
                                className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-500 transition-colors hover:text-emerald-600"
                                onMouseDown={handleToolbarMouseDown}
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {searchTerm.trim().length > 0
                    ? 'No fonts match your search.'
                    : 'No fonts available for this filter yet.'}
                </div>
              )
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto px-4 py-4">
                {TEXT_STYLE_PRESETS.map(preset => {
                  const isActive = activeTextStyleId === preset.id;
                  const previewSize = Math.min(preset.previewSize ?? preset.fontSize, 30);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors',
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/40'
                          : 'bg-transparent text-foreground hover:bg-muted/40',
                      )}
                      onClick={() => onApplyTextStyle(preset)}
                      onMouseDown={handleToolbarMouseDown}
                    >
                      <div className="flex flex-col">
                        <span
                          className="font-semibold leading-tight"
                          style={{
                            fontFamily: cssFontFamily,
                            fontSize: `${previewSize}px`,
                            fontWeight: preset.bold ? 600 : 500,
                          }}
                        >
                          {preset.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{fontFamily}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                          {preset.suffix}
                        </span>
                        {isActive ? <Check className="h-4 w-4 text-emerald-500" /> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
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
              swatchSize="sm"
              optionClassName="min-h-[3.25rem]"
              defaultSectionId="solids"
              showCustomColorSection
            />
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
