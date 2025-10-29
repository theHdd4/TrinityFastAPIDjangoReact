import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Droplet,
  Eye,
  Grid3x3,
  Hash,
  Image as ImageIcon,
  Layers,
  Lock,
  MessageSquare,
  Monitor,
  Move,
  Palette,
  Smartphone,
  Tablet,
  Unlock,
  Zap,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  PresentationSettings,
  SlideNotesPosition,
  SlideNumberPosition,
  SlideshowTransition,
} from '@/components/ExhibitionMode/store/exhibitionStore';
import { DEFAULT_PRESENTATION_SETTINGS } from '@/components/ExhibitionMode/store/exhibitionStore';
import {
  ColorTray,
  DEFAULT_SOLID_COLOR_OPTIONS,
  DEFAULT_SOLID_SECTION,
  createSolidToken,
  isSolidToken,
  solidTokenToHex,
} from '@/templates/color-tray';
import type { ColorTrayOption, ColorTraySection } from '@/templates/color-tray';
import { cn } from '@/lib/utils';

const GRADIENT_DIRECTIONS = [
  { value: '0deg', label: 'Top to Bottom' },
  { value: '90deg', label: 'Left to Right' },
  { value: '180deg', label: 'Bottom to Top' },
  { value: '270deg', label: 'Right to Left' },
  { value: '45deg', label: 'Diagonal ↗' },
  { value: '135deg', label: 'Diagonal ↘' },
  { value: '225deg', label: 'Diagonal ↙' },
  { value: '315deg', label: 'Diagonal ↖' },
] as const;

const TRANSITION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'flip', label: 'Flip' },
  { value: 'cube', label: 'Cube' },
  { value: 'dissolve', label: 'Dissolve' },
] as const;

const NOTES_POSITIONS: SlideNotesPosition[] = ['bottom', 'right'];
const SLIDE_NUMBER_POSITIONS: SlideNumberPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

const SOLID_COLOR_SECTIONS: readonly ColorTraySection[] = [
  {
    id: DEFAULT_SOLID_SECTION.id,
    label: DEFAULT_SOLID_SECTION.label,
    options: DEFAULT_SOLID_COLOR_OPTIONS,
  },
];

const findOptionById = (
  sections: readonly ColorTraySection[],
  id: string | null,
): ColorTrayOption | undefined => {
  if (!id) {
    return undefined;
  }

  for (const section of sections) {
    const match = section.options.find(option => option.id === id);
    if (match) {
      return match;
    }
  }

  return undefined;
};

interface SettingsPanelProps {
  settings: PresentationSettings;
  onChange: (partial: Partial<PresentationSettings>) => void;
  onReset: () => void;
  onClose: () => void;
  onToggleNotes?: (visible: boolean) => void;
  onNotesPositionChange?: (position: SlideNotesPosition) => void;
  notesVisible?: boolean;
}

const sanitiseHex = (value: string): string => {
  const trimmed = value.replace(/\s+/g, '');
  if (!trimmed) {
    return '#';
  }

  const prefixed = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed.replace(/#/g, '');
  const cleaned = prefixed.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
  return `#${cleaned}`;
};

const normaliseHexLength = (hex: string): string => {
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const digits = hex.slice(1);
    return `#${digits
      .split('')
      .map(character => character.repeat(2))
      .join('')}`.toLowerCase();
  }

  return hex.toLowerCase();
};

const resolveHexColor = (value: string | undefined | null, fallback: string): string => {
  const candidate = value ?? fallback;
  const sanitised = sanitiseHex(candidate);

  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(sanitised)) {
    return normaliseHexLength(sanitised);
  }

  const fallbackSanitised = sanitiseHex(fallback);
  return normaliseHexLength(
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(fallbackSanitised) ? fallbackSanitised : '#ffffff',
  );
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onChange,
  onReset,
  onClose,
  onToggleNotes,
  onNotesPositionChange,
  notesVisible = false,
}) => {
  const backgroundMode = useMemo(() => {
    const mode = settings.backgroundMode ?? DEFAULT_PRESENTATION_SETTINGS.backgroundMode;
    if (mode === 'preset') {
      return 'solid';
    }

    return mode;
  }, [settings.backgroundMode]);

  const showGrid = settings.showGrid ?? DEFAULT_PRESENTATION_SETTINGS.showGrid;
  const showGuides = settings.showGuides ?? DEFAULT_PRESENTATION_SETTINGS.showGuides;
  const snapToGrid = settings.snapToGrid ?? DEFAULT_PRESENTATION_SETTINGS.snapToGrid;
  const gridSize = settings.gridSize ?? DEFAULT_PRESENTATION_SETTINGS.gridSize;
  const showSlideNumber = settings.showSlideNumber ?? DEFAULT_PRESENTATION_SETTINGS.showSlideNumber;
  const slideNumberPosition = settings.slideNumberPosition ?? DEFAULT_PRESENTATION_SETTINGS.slideNumberPosition;
  const transitionEffect = settings.transitionEffect ?? settings.slideshowTransition ?? DEFAULT_PRESENTATION_SETTINGS.transitionEffect;
  const transitionDuration = settings.transitionDuration ?? DEFAULT_PRESENTATION_SETTINGS.transitionDuration;
  const autoAdvance = settings.autoAdvance ?? DEFAULT_PRESENTATION_SETTINGS.autoAdvance;
  const autoAdvanceDuration = settings.autoAdvanceDuration ?? settings.slideshowDuration ?? DEFAULT_PRESENTATION_SETTINGS.autoAdvanceDuration;
  const highContrast = settings.highContrast ?? DEFAULT_PRESENTATION_SETTINGS.highContrast;
  const largeText = settings.largeText ?? DEFAULT_PRESENTATION_SETTINGS.largeText;
  const reducedMotion = settings.reducedMotion ?? DEFAULT_PRESENTATION_SETTINGS.reducedMotion;
  const backgroundLocked = settings.backgroundLocked ?? DEFAULT_PRESENTATION_SETTINGS.backgroundLocked;
  const backgroundOpacity = settings.backgroundOpacity ?? DEFAULT_PRESENTATION_SETTINGS.backgroundOpacity;

  const safeGridSize = Math.min(200, Math.max(4, gridSize));
  const safeBackgroundOpacity = Math.min(100, Math.max(0, backgroundOpacity));
  const safeTransitionDuration = Math.min(2000, Math.max(100, transitionDuration));
  const safeAutoAdvanceDuration = Math.min(60, Math.max(1, autoAdvanceDuration));

  const resolvedSolidColor = useMemo(() => {
    const color = settings.backgroundSolidColor ?? DEFAULT_PRESENTATION_SETTINGS.backgroundSolidColor;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : DEFAULT_PRESENTATION_SETTINGS.backgroundSolidColor;
  }, [settings.backgroundSolidColor]);

  const [solidColorInput, setSolidColorInput] = useState(resolvedSolidColor.toUpperCase());
  const [solidColorPopoverOpen, setSolidColorPopoverOpen] = useState(false);
  const solidColorTriggerRef = useRef<HTMLButtonElement | null>(null);

  const [gradientStartPopoverOpen, setGradientStartPopoverOpen] = useState(false);
  const [gradientEndPopoverOpen, setGradientEndPopoverOpen] = useState(false);

  useEffect(() => {
    setSolidColorInput(resolvedSolidColor.toUpperCase());
  }, [resolvedSolidColor]);

  const solidColorToken = useMemo(() => createSolidToken(resolvedSolidColor), [resolvedSolidColor]);
  const solidColorOption = useMemo(
    () => findOptionById(SOLID_COLOR_SECTIONS, solidColorToken),
    [solidColorToken],
  );

  const solidColorSwatchStyle = useMemo(() => {
    if (solidColorOption?.swatchStyle) {
      return solidColorOption.swatchStyle;
    }
    if (solidColorOption?.value) {
      return { background: solidColorOption.value };
    }
    return { backgroundColor: resolvedSolidColor };
  }, [resolvedSolidColor, solidColorOption]);

  const solidColorLabel = useMemo(() => {
    if (solidColorOption?.label) {
      return solidColorOption.label;
    }
    return solidColorInput;
  }, [solidColorInput, solidColorOption]);

  const gradientStartHex = useMemo(
    () => resolveHexColor(settings.backgroundGradientStart, DEFAULT_PRESENTATION_SETTINGS.backgroundGradientStart),
    [settings.backgroundGradientStart],
  );
  const gradientEndHex = useMemo(
    () => resolveHexColor(settings.backgroundGradientEnd, DEFAULT_PRESENTATION_SETTINGS.backgroundGradientEnd),
    [settings.backgroundGradientEnd],
  );

  const gradientStartToken = useMemo(() => createSolidToken(gradientStartHex), [gradientStartHex]);
  const gradientEndToken = useMemo(() => createSolidToken(gradientEndHex), [gradientEndHex]);

  const gradientStartOption = useMemo(
    () => findOptionById(SOLID_COLOR_SECTIONS, gradientStartToken),
    [gradientStartToken],
  );
  const gradientEndOption = useMemo(
    () => findOptionById(SOLID_COLOR_SECTIONS, gradientEndToken),
    [gradientEndToken],
  );

  const gradientStartLabel = useMemo(
    () => gradientStartOption?.label ?? gradientStartHex.toUpperCase(),
    [gradientStartHex, gradientStartOption],
  );
  const gradientEndLabel = useMemo(
    () => gradientEndOption?.label ?? gradientEndHex.toUpperCase(),
    [gradientEndHex, gradientEndOption],
  );

  const gradientStartSwatchStyle = useMemo(() => {
    if (gradientStartOption?.swatchStyle) {
      return gradientStartOption.swatchStyle;
    }
    if (gradientStartOption?.value) {
      return { background: gradientStartOption.value };
    }
    return { backgroundColor: gradientStartHex };
  }, [gradientStartHex, gradientStartOption]);

  const gradientEndSwatchStyle = useMemo(() => {
    if (gradientEndOption?.swatchStyle) {
      return gradientEndOption.swatchStyle;
    }
    if (gradientEndOption?.value) {
      return { background: gradientEndOption.value };
    }
    return { backgroundColor: gradientEndHex };
  }, [gradientEndHex, gradientEndOption]);

  const handleBackgroundTypeChange = (type: 'solid' | 'gradient' | 'image') => {
    onChange({ backgroundMode: type });
  };

  const handleSolidColorCommit = (value: string) => {
    const sanitised = sanitiseHex(value).toUpperCase();
    const isValid = /^#([0-9A-F]{3}|[0-9A-F]{6})$/.test(sanitised);

    if (!isValid) {
      setSolidColorInput(sanitised);
      return;
    }

    const normalisedHex = normaliseHexLength(sanitised);
    const lowerCaseHex = normalisedHex.toLowerCase();
    setSolidColorInput(normalisedHex.toUpperCase());

    onChange({
      backgroundMode: 'solid',
      backgroundSolidColor: lowerCaseHex,
      backgroundColor: createSolidToken(lowerCaseHex) as PresentationSettings['backgroundColor'],
    });
  };

  const handleSolidColorSelect = (option: ColorTrayOption) => {
    let nextHex: string | null = null;

    if (typeof option.value === 'string' && option.value.startsWith('#')) {
      nextHex = option.value;
    } else if (isSolidToken(option.id)) {
      nextHex = solidTokenToHex(option.id);
    }

    if (nextHex) {
      handleSolidColorCommit(nextHex);
    }
  };

  const handleGradientChange = (partial: Partial<PresentationSettings>) => {
    onChange({ backgroundMode: 'gradient', ...partial });
  };

  const handleGradientColorCommit = (
    key: 'backgroundGradientStart' | 'backgroundGradientEnd',
    value: string,
  ) => {
    const sanitised = resolveHexColor(value, key === 'backgroundGradientStart'
      ? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientStart
      : DEFAULT_PRESENTATION_SETTINGS.backgroundGradientEnd);

    handleGradientChange({ [key]: sanitised } as Partial<PresentationSettings>);
  };

  const handleGradientColorSelect = (
    key: 'backgroundGradientStart' | 'backgroundGradientEnd',
    option: ColorTrayOption,
  ) => {
    let nextHex: string | null = null;

    if (typeof option.value === 'string' && option.value.startsWith('#')) {
      nextHex = option.value;
    } else if (isSolidToken(option.id)) {
      nextHex = solidTokenToHex(option.id);
    }

    if (nextHex) {
      handleGradientColorCommit(key, nextHex);
    }
  };

  const handleAutoAdvanceToggle = (value: boolean) => {
    onChange({
      autoAdvance: value,
      autoAdvanceDuration: safeAutoAdvanceDuration,
      slideshowDuration: safeAutoAdvanceDuration,
    });
  };

  const handleAutoAdvanceDurationChange = (value: number) => {
    const safeValue = Math.min(60, Math.max(1, Math.round(value)));
    onChange({
      autoAdvanceDuration: safeValue,
      slideshowDuration: safeValue,
    });
  };

  return (
    <div className="flex h-full w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Slide Settings</h2>
            <p className="text-xs text-muted-foreground">Configure slide behavior and appearance</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-5 py-5 pr-3">
        <Tabs defaultValue="background" className="w-full">
          <TabsList className="mb-5 grid w-full grid-cols-4 gap-2 rounded-xl border border-border/60 bg-muted/40 p-1">
            <TabsTrigger value="background" className="h-9 rounded-lg text-[11px] font-semibold">
              Background
            </TabsTrigger>
            <TabsTrigger value="behavior" className="h-9 rounded-lg text-[11px] font-semibold">
              Behavior
            </TabsTrigger>
            <TabsTrigger value="transitions" className="h-9 rounded-lg text-[11px] font-semibold">
              Transitions
            </TabsTrigger>
            <TabsTrigger value="accessibility" className="h-9 rounded-lg text-[11px] font-semibold">
              Access
            </TabsTrigger>
          </TabsList>

          <TabsContent value="background" className="space-y-6">
            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Palette className="h-3.5 w-3.5" />
                Background Type
              </Label>
              <div className="flex gap-2">
                <Button
                  variant={backgroundMode === 'solid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleBackgroundTypeChange('solid')}
                  className="flex-1 h-8 gap-1 px-2 text-[11px]"
                >
                  <Droplet className="h-3 w-3" />
                  Solid
                </Button>
                <Button
                  variant={backgroundMode === 'gradient' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleBackgroundTypeChange('gradient')}
                  className="flex-1 h-8 gap-1 px-2 text-[11px]"
                >
                  <Layers className="h-3 w-3" />
                  Gradient
                </Button>
                <Button
                  variant={backgroundMode === 'image' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleBackgroundTypeChange('image')}
                  className="flex-1 h-8 gap-1 px-2 text-[11px]"
                >
                  <ImageIcon className="h-3 w-3" />
                  Image
                </Button>
              </div>
            </div>

            {backgroundMode === 'solid' && (
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Solid Color</Label>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {solidColorLabel}
                    </span>
                    <span className="text-[10px] text-muted-foreground/80">{solidColorInput}</span>
                  </div>
                  <Popover open={solidColorPopoverOpen} onOpenChange={setSolidColorPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        ref={solidColorTriggerRef}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 p-0"
                      >
                        <span
                          className={cn('h-5 w-5 rounded-full border border-white/70 shadow-inner')}
                          style={solidColorSwatchStyle}
                        />
                        <span className="sr-only">Select solid background color</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="left"
                      align="center"
                      sideOffset={16}
                      collisionPadding={24}
                      className="z-[3200] w-auto rounded-3xl border border-border/70 bg-background/95 p-0 shadow-2xl"
                    >
                      <div className="w-[320px] space-y-4 p-4">
                        <ColorTray
                          sections={SOLID_COLOR_SECTIONS}
                          selectedId={solidColorOption?.id ?? solidColorToken}
                          onSelect={option => {
                            handleSolidColorSelect(option);
                            setSolidColorPopoverOpen(false);
                          }}
                          defaultSectionId={DEFAULT_SOLID_SECTION.id}
                        />
                        <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={solidColorInput}
                        onChange={event => handleSolidColorCommit(event.target.value)}
                        className="h-10 w-full cursor-pointer rounded-2xl border border-border"
                      />
                          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Custom
                          </span>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <Input
                  value={solidColorInput}
                  onChange={event => setSolidColorInput(sanitiseHex(event.target.value).toUpperCase())}
                  onBlur={event => handleSolidColorCommit(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      handleSolidColorCommit((event.target as HTMLInputElement).value);
                    }
                  }}
                  placeholder="#FFFFFF"
                  className="h-9 text-sm"
                />
              </div>
            )}

            {backgroundMode === 'gradient' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label className="text-sm font-medium">Gradient Start</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-muted-foreground">{gradientStartLabel}</span>
                      <Popover open={gradientStartPopoverOpen} onOpenChange={setGradientStartPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 p-0"
                          >
                            <span
                              className={cn('h-5 w-5 rounded-full border border-white/70 shadow-inner')}
                              style={gradientStartSwatchStyle}
                            />
                            <span className="sr-only">Select gradient start color</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="left"
                          align="center"
                          sideOffset={16}
                          collisionPadding={24}
                          className="z-[3200] w-auto rounded-3xl border border-border/70 bg-background/95 p-0 shadow-2xl"
                        >
                          <div className="w-[320px] space-y-4 p-4">
                            <ColorTray
                              sections={SOLID_COLOR_SECTIONS}
                              selectedId={gradientStartOption?.id ?? gradientStartToken}
                              onSelect={option => {
                                handleGradientColorSelect('backgroundGradientStart', option);
                                setGradientStartPopoverOpen(false);
                              }}
                              defaultSectionId={DEFAULT_SOLID_SECTION.id}
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={gradientStartHex}
                                onChange={event => handleGradientColorCommit('backgroundGradientStart', event.target.value)}
                                className="h-10 w-full cursor-pointer rounded-2xl border border-border"
                              />
                              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Custom
                              </span>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label className="text-sm font-medium">Gradient End</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-muted-foreground">{gradientEndLabel}</span>
                      <Popover open={gradientEndPopoverOpen} onOpenChange={setGradientEndPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 p-0"
                          >
                            <span
                              className={cn('h-5 w-5 rounded-full border border-white/70 shadow-inner')}
                              style={gradientEndSwatchStyle}
                            />
                            <span className="sr-only">Select gradient end color</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="left"
                          align="center"
                          sideOffset={16}
                          collisionPadding={24}
                          className="z-[3200] w-auto rounded-3xl border border-border/70 bg-background/95 p-0 shadow-2xl"
                        >
                          <div className="w-[320px] space-y-4 p-4">
                            <ColorTray
                              sections={SOLID_COLOR_SECTIONS}
                              selectedId={gradientEndOption?.id ?? gradientEndToken}
                              onSelect={option => {
                                handleGradientColorSelect('backgroundGradientEnd', option);
                                setGradientEndPopoverOpen(false);
                              }}
                              defaultSectionId={DEFAULT_SOLID_SECTION.id}
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={gradientEndHex}
                                onChange={event => handleGradientColorCommit('backgroundGradientEnd', event.target.value)}
                                className="h-10 w-full cursor-pointer rounded-2xl border border-border"
                              />
                              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Custom
                              </span>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Direction</Label>
                  <Select
                    value={settings.backgroundGradientDirection ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientDirection}
                    onValueChange={value => handleGradientChange({ backgroundGradientDirection: value })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADIENT_DIRECTIONS.map(direction => (
                        <SelectItem key={direction.value} value={direction.value}>
                          {direction.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {backgroundMode === 'image' && (
              <div className="space-y-3">
                <Label>Background Image</Label>
                <Button variant="outline" disabled className="w-full justify-start gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Choose Image (coming soon)
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>Opacity: {safeBackgroundOpacity}%</Label>
              <Slider
                value={[safeBackgroundOpacity]}
                onValueChange={([value]) =>
                  onChange({
                    backgroundOpacity: Math.min(100, Math.max(0, Math.round(value))),
                  })
                }
                min={0}
                max={100}
                step={1}
              />
            </div>
          </TabsContent>

          <TabsContent value="behavior" className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-3">
                  {backgroundLocked ? <Lock className="h-4 w-4 text-destructive" /> : <Unlock className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <Label className="text-[13px] font-medium">Lock Slide Background</Label>
                    <p className="text-[11px] leading-4 text-muted-foreground">Prevent accidental changes to the background</p>
                  </div>
                </div>
                <Switch checked={backgroundLocked} onCheckedChange={value => onChange({ backgroundLocked: value })} />
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="flex items-center gap-2 text-base font-semibold">
                  <Grid3x3 className="h-4 w-4" />
                  Grid & Guides
                </Label>

                <div className="space-y-4 rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      Show Grid
                    </div>
                    <Switch checked={showGrid} onCheckedChange={value => onChange({ showGrid: value })} />
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      Show Guides
                    </div>
                    <Switch checked={showGuides} onCheckedChange={value => onChange({ showGuides: value })} />
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Move className="h-4 w-4" />
                      Snap to Grid
                    </div>
                    <Switch checked={snapToGrid} onCheckedChange={value => onChange({ snapToGrid: value })} />
                  </div>

                  {showGrid && (
                    <div className="space-y-2 rounded-lg bg-background p-3">
                      <Label className="text-[11px] font-semibold uppercase text-muted-foreground">
                        Grid Size: {safeGridSize}px
                      </Label>
                      <Slider
                        value={[safeGridSize]}
                        onValueChange={([value]) =>
                          onChange({
                            gridSize: Math.min(200, Math.max(4, Math.round(value))),
                          })
                        }
                        min={4}
                        max={200}
                        step={2}
                      />
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Hash className="h-4 w-4" />
                  Slide Numbering
                </Label>

                <div className="space-y-4 rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <Label className="text-muted-foreground">Show Slide Number</Label>
                    <Switch checked={showSlideNumber} onCheckedChange={value => onChange({ showSlideNumber: value })} />
                  </div>

                  {showSlideNumber && (
                    <div className="space-y-2">
                      <Label className="text-[11px] font-semibold uppercase text-muted-foreground">Position</Label>
                      <Select
                        value={slideNumberPosition}
                        onValueChange={value =>
                          onChange({
                            slideNumberPosition: value as SlideNumberPosition,
                          })
                        }
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SLIDE_NUMBER_POSITIONS.map(position => (
                            <SelectItem key={position} value={position} className="capitalize">
                              {position.replace('-', ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="h-4 w-4" />
                  Speaker Notes
                </Label>

                <div className="space-y-4 rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <Label className="text-muted-foreground">Show Notes Panel</Label>
                    <Switch checked={notesVisible} onCheckedChange={value => onToggleNotes?.(value)} />
                  </div>

                  {notesVisible && (
                    <div className="space-y-2">
                      <Label className="text-[11px] font-semibold uppercase text-muted-foreground">Position</Label>
                      <Select
                        value={settings.slideNotesPosition ?? DEFAULT_PRESENTATION_SETTINGS.slideNotesPosition}
                        onValueChange={value => onNotesPositionChange?.(value as SlideNotesPosition)}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NOTES_POSITIONS.map(position => (
                            <SelectItem key={position} value={position} className="capitalize">
                              {position === 'bottom' ? 'Bottom' : 'Right Side'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="transitions" className="space-y-6">
            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4" />
                Transition Effect
              </Label>
              <Select
                value={transitionEffect}
                onValueChange={value => {
                  const partial: Partial<PresentationSettings> = {
                    transitionEffect: value as PresentationSettings['transitionEffect'],
                  };

                  if (value !== 'none') {
                    partial.slideshowTransition = value as SlideshowTransition;
                  }

                  onChange(partial);
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSITION_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-[13px]">
                <Label className="text-[11px] font-semibold uppercase text-muted-foreground">
                  Duration: {safeTransitionDuration}ms
                </Label>
                <Slider
                  value={[safeTransitionDuration]}
                  onValueChange={([value]) =>
                    onChange({
                      transitionDuration: Math.min(2000, Math.max(100, Math.round(value))),
                    })
                  }
                  min={100}
                  max={2000}
                  step={50}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4" />
                Auto-Advance
              </Label>

              <div className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-3">
                <div className="space-y-1">
                  <Label className="text-[13px] font-medium leading-4">Enable Auto-Advance</Label>
                  <p className="text-[11px] leading-4 text-muted-foreground">Automatically advance to the next slide</p>
                </div>
                <Switch checked={autoAdvance} onCheckedChange={handleAutoAdvanceToggle} />
              </div>

              {autoAdvance && (
                <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-[13px]">
                  <Label className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Duration: {safeAutoAdvanceDuration}s
                  </Label>
                  <Slider
                    value={[safeAutoAdvanceDuration]}
                    onValueChange={([value]) => handleAutoAdvanceDurationChange(value)}
                    min={1}
                    max={60}
                    step={1}
                  />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="accessibility" className="space-y-6">
            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Eye className="h-4 w-4" />
                Accessibility Options
              </Label>

              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
                  <div className="max-w-[72%] space-y-1">
                    <Label className="text-[12px] font-medium leading-4">High Contrast Mode</Label>
                    <p className="text-[11px] leading-[1.1rem] text-muted-foreground">Enhance visibility for text and elements</p>
                  </div>
                  <Switch
                    className="shrink-0"
                    checked={highContrast}
                    onCheckedChange={value => onChange({ highContrast: value })}
                  />
                </div>

                <div className="flex items-start justify-between gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
                  <div className="max-w-[72%] space-y-1">
                    <Label className="text-[12px] font-medium leading-4">Large Text</Label>
                    <p className="text-[11px] leading-[1.1rem] text-muted-foreground">Increase base font size for readability</p>
                  </div>
                  <Switch
                    className="shrink-0"
                    checked={largeText}
                    onCheckedChange={value => onChange({ largeText: value })}
                  />
                </div>

                <div className="flex items-start justify-between gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
                  <div className="max-w-[72%] space-y-1">
                    <Label className="text-[12px] font-medium leading-4">Reduced Motion</Label>
                    <p className="text-[11px] leading-[1.1rem] text-muted-foreground">Minimize animations and transitions</p>
                  </div>
                  <Switch
                    className="shrink-0"
                    checked={reducedMotion}
                    onCheckedChange={value => onChange({ reducedMotion: value })}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Responsive Preview</Label>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 px-2 py-1.5 text-[11px]"
                  disabled
                >
                  <Monitor className="mr-1.5 h-3.5 w-3.5" />
                  Desktop
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 px-2 py-1.5 text-[11px]"
                  disabled
                >
                  <Tablet className="mr-1.5 h-3.5 w-3.5" />
                  Tablet
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 px-2 py-1.5 text-[11px]"
                  disabled
                >
                  <Smartphone className="mr-1.5 h-3.5 w-3.5" />
                  Mobile
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-4 py-3">
        <Button variant="outline" size="sm" className="px-3 text-[12px]" onClick={onClose}>
          Cancel
        </Button>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="px-3 text-[12px]" onClick={onReset}>
            Reset to Defaults
          </Button>
          <Button size="sm" className="px-3 text-[12px]" onClick={onClose}>
            Apply Settings
          </Button>
        </div>
      </div>
    </div>
  );
};
