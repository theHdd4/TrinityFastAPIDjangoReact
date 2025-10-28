import React, { useCallback, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Droplet,
  Eye,
  Grid3x3,
  Hash,
  Image as ImageIcon,
  Layers,
  Lock,
  Monitor,
  Palette,
  Smartphone,
  Tablet,
  Type,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ColorTray,
  DEFAULT_SOLID_COLOR_OPTIONS,
  type ColorTrayOption,
  type ColorTraySection,
} from '@/templates/color-tray';
import type {
  PresentationSettings,
  SlideNotesPosition,
} from '@/components/ExhibitionMode/store/exhibitionStore';
import { DEFAULT_PRESENTATION_SETTINGS } from '@/components/ExhibitionMode/store/exhibitionStore';
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

const TAB_TRIGGER_CLASSES = cn(
  'relative flex h-11 items-center justify-center rounded-full border border-transparent px-5 text-sm font-medium text-muted-foreground transition-all',
  'whitespace-nowrap tracking-wide leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
  'data-[state=active]:border-border/60 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
);

const BACKGROUND_PRESET_GROUP_ID = 'preset-backgrounds';
const BACKGROUND_PRESET_GROUP_LABEL = 'Presets';

const buildBackgroundPresetOptions = (defaultHex: string): readonly ColorTrayOption[] =>
  (
    [
      {
        id: 'default',
        label: 'Default',
        value: defaultHex,
        tooltip: `Default (${defaultHex.toUpperCase()})`,
        swatchClassName: 'bg-card',
        swatchStyle: { backgroundColor: defaultHex },
        ariaLabel: 'Use default slide background',
      },
      {
        id: 'ivory',
        label: 'Ivory',
        value: '#fef3c7',
        tooltip: 'Ivory (#FEF3C7)',
        swatchStyle: { backgroundColor: '#fef3c7' },
      },
      {
        id: 'slate',
        label: 'Soft Slate',
        value: '#e2e8f0',
        tooltip: 'Soft Slate (#E2E8F0)',
        swatchStyle: { backgroundColor: '#e2e8f0' },
      },
      {
        id: 'charcoal',
        label: 'Charcoal Mist',
        value: '#d4d4d4',
        tooltip: 'Charcoal Mist (#D4D4D4)',
        swatchStyle: { backgroundColor: '#d4d4d4' },
      },
      {
        id: 'indigo',
        label: 'Indigo Haze',
        value: '#e0e7ff',
        tooltip: 'Indigo Haze (#E0E7FF)',
        swatchStyle: { backgroundColor: '#e0e7ff' },
      },
      {
        id: 'emerald',
        label: 'Emerald Veil',
        value: '#d1fae5',
        tooltip: 'Emerald Veil (#D1FAE5)',
        swatchStyle: { backgroundColor: '#d1fae5' },
      },
      {
        id: 'rose',
        label: 'Rose Quartz',
        value: '#ffe4e6',
        tooltip: 'Rose Quartz (#FFE4E6)',
        swatchStyle: { backgroundColor: '#ffe4e6' },
      },
    ] as const
  ).map((option, index) => ({
    ...option,
    groupId: BACKGROUND_PRESET_GROUP_ID,
    groupLabel: BACKGROUND_PRESET_GROUP_LABEL,
    groupOrder: -1,
    toneOrder: index,
  }));

interface SettingsPanelProps {
  settings: PresentationSettings;
  onChange: (partial: Partial<PresentationSettings>) => void;
  onReset: () => void;
  onClose: () => void;
  onToggleNotes?: (visible: boolean) => void;
  onNotesPositionChange?: (position: SlideNotesPosition) => void;
  notesVisible?: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onChange,
  onReset,
  onClose,
  onToggleNotes,
  onNotesPositionChange,
  notesVisible = false,
}) => {
  const backgroundMode = settings.backgroundMode && settings.backgroundMode !== 'preset'
    ? settings.backgroundMode
    : 'solid';
  const gridSize = useMemo(() => {
    const value = Number.isFinite(settings.gridSize) ? Number(settings.gridSize) : 20;
    return Math.min(200, Math.max(4, Math.round(value)));
  }, [settings.gridSize]);
  const backgroundOpacity = Math.min(100, Math.max(0, settings.backgroundOpacity ?? 100));
  const transitionDuration = Math.min(2000, Math.max(100, settings.transitionDuration ?? 450));
  const autoAdvanceDuration = Math.max(1, Math.round(settings.autoAdvanceDuration ?? settings.slideshowDuration ?? 8));
  const showSlideNumber = settings.showSlideNumber ?? true;
  const [backgroundPaletteOpen, setBackgroundPaletteOpen] = useState(false);

  const backgroundColorSections = useMemo<readonly ColorTraySection[]>(() => {
    const defaultHex = DEFAULT_PRESENTATION_SETTINGS.backgroundSolidColor;
    const presets = buildBackgroundPresetOptions(defaultHex);
    return [
      {
        id: 'solids',
        label: 'Solid colors',
        options: [...presets, ...DEFAULT_SOLID_COLOR_OPTIONS] as readonly ColorTrayOption[],
      },
    ];
  }, []);

  const resolvedSolidHex = useMemo(() => {
    const candidate = settings.backgroundSolidColor ?? DEFAULT_PRESENTATION_SETTINGS.backgroundSolidColor;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate)
      ? candidate
      : DEFAULT_PRESENTATION_SETTINGS.backgroundSolidColor;
  }, [settings.backgroundSolidColor]);

  const backgroundColorOption = useMemo(() => {
    const normalized = resolvedSolidHex.toLowerCase();
    for (const section of backgroundColorSections) {
      for (const option of section.options) {
        if (typeof option.value === 'string' && option.value.toLowerCase() === normalized) {
          return option;
        }
      }
    }
    return undefined;
  }, [backgroundColorSections, resolvedSolidHex]);

  const backgroundSelectedId = backgroundColorOption?.id;
  const backgroundColorLabel = backgroundColorOption?.label ?? resolvedSolidHex.toUpperCase();
  const backgroundSwatchStyle = backgroundColorOption?.swatchStyle ?? { backgroundColor: resolvedSolidHex };

  const handleBackgroundPaletteSelect = useCallback(
    (option: ColorTrayOption) => {
      if (typeof option.value === 'string') {
        onChange({ backgroundMode: 'solid', backgroundSolidColor: option.value });
      }
      setBackgroundPaletteOpen(false);
    },
    [onChange],
  );

  const handleCustomBackgroundColor = useCallback(
    (hex: string) => {
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
        onChange({ backgroundMode: 'solid', backgroundSolidColor: hex });
      }
    },
    [onChange],
  );

  const handleBackgroundModeChange = (mode: 'solid' | 'gradient' | 'image') => {
    onChange({ backgroundMode: mode });
    if (mode === 'image' && !settings.backgroundImageUrl) {
      onChange({ backgroundImageUrl: '' });
    }
  };

  const handleGradientChange = (partial: Partial<PresentationSettings>) => {
    onChange({
      backgroundMode: 'gradient',
      ...partial,
    });
  };

  const handleAutoAdvanceToggle = (value: boolean) => {
    onChange({
      autoAdvance: value,
      autoAdvanceDuration,
      slideshowDuration: autoAdvanceDuration,
    });
  };

  const handleAutoAdvanceDurationChange = (value: number) => {
    const safe = Math.max(1, value);
    onChange({
      autoAdvanceDuration: safe,
      slideshowDuration: safe,
    });
  };

  const handleTransitionChange = (value: string) => {
    const candidate = value as PresentationSettings['transitionEffect'];
    onChange({
      transitionEffect: candidate,
      slideshowTransition: candidate === 'slide' || candidate === 'zoom' ? candidate : 'fade',
    });
  };

  const handleNotesToggle = (value: boolean) => {
    onToggleNotes?.(value);
    onChange({ slideNotesVisible: value });
  };

  const handleNotesPosition = (position: SlideNotesPosition) => {
    onChange({ slideNotesPosition: position });
    onNotesPositionChange?.(position);
  };

  return (
    <div className="w-full shrink-0 rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Palette className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Slide Settings</h3>
            <p className="text-xs text-muted-foreground">Fine-tune appearance and playback behaviour.</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="max-h-[70vh] px-5">
        <Tabs defaultValue="background" className="w-full py-5">
          <TabsList className="grid w-full grid-cols-2 gap-2.5 rounded-full border border-border/60 bg-muted/40 p-2.5 sm:grid-cols-4 sm:gap-3.5 sm:p-3">
            <TabsTrigger value="background" className={TAB_TRIGGER_CLASSES}>
              Background
            </TabsTrigger>
            <TabsTrigger value="behavior" className={TAB_TRIGGER_CLASSES}>
              Behaviour
            </TabsTrigger>
            <TabsTrigger value="transitions" className={TAB_TRIGGER_CLASSES}>
              Transitions
            </TabsTrigger>
            <TabsTrigger value="accessibility" className={TAB_TRIGGER_CLASSES}>
              Access
            </TabsTrigger>
          </TabsList>

          <TabsContent value="background" className="space-y-5 pt-4">
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Palette className="h-4 w-4" />
                Background Type
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={backgroundMode === 'solid' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start"
                  onClick={() => handleBackgroundModeChange('solid')}
                >
                  <Droplet className="mr-2 h-4 w-4" />
                  Solid
                </Button>
                <Button
                  variant={backgroundMode === 'gradient' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start"
                  onClick={() => handleBackgroundModeChange('gradient')}
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Gradient
                </Button>
                <Button
                  variant={backgroundMode === 'image' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start"
                  onClick={() => handleBackgroundModeChange('image')}
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Image
                </Button>
              </div>
            </div>

            {backgroundMode === 'solid' && (
              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplet className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">Solid colour</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {backgroundColorLabel && (
                      <span className="text-xs font-medium text-muted-foreground">{backgroundColorLabel}</span>
                    )}
                    <Popover open={backgroundPaletteOpen} onOpenChange={setBackgroundPaletteOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 p-0"
                        >
                          <span
                            className={cn(
                              'h-5 w-5 rounded-full border border-white/70 shadow-inner',
                              backgroundColorOption?.swatchClassName,
                            )}
                            style={backgroundSwatchStyle}
                          />
                          <span className="sr-only">Select background colour</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="left"
                        align="center"
                        sideOffset={16}
                        collisionPadding={24}
                        className="z-[3000] w-auto rounded-3xl border border-border/70 bg-background/95 p-0 shadow-2xl"
                      >
                        <div className="w-[360px] space-y-4 p-4">
                          <ColorTray
                            sections={backgroundColorSections}
                            selectedId={backgroundSelectedId}
                            onSelect={handleBackgroundPaletteSelect}
                            swatchSize="md"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={resolvedSolidHex}
                              onChange={event => handleCustomBackgroundColor(event.target.value)}
                              className="h-11 w-full cursor-pointer rounded-2xl border border-border"
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
            )}

            {backgroundMode === 'gradient' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Start</Label>
                    <Input
                      type="color"
                      value={settings.backgroundGradientStart ?? '#667eea'}
                      onChange={event =>
                        handleGradientChange({ backgroundGradientStart: event.target.value })
                      }
                      className="h-10 w-full cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">End</Label>
                    <Input
                      type="color"
                      value={settings.backgroundGradientEnd ?? '#764ba2'}
                      onChange={event => handleGradientChange({ backgroundGradientEnd: event.target.value })}
                      className="h-10 w-full cursor-pointer"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Direction</Label>
                  <Select
                    value={settings.backgroundGradientDirection ?? '135deg'}
                    onValueChange={value => handleGradientChange({ backgroundGradientDirection: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      {GRADIENT_DIRECTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {backgroundMode === 'image' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Image URL</Label>
                <Input
                  placeholder="https://example.com/background.jpg"
                  value={settings.backgroundImageUrl ?? ''}
                  onChange={event =>
                    onChange({
                      backgroundMode: 'image',
                      backgroundImageUrl: event.target.value.trim(),
                    })
                  }
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">Background Opacity {backgroundOpacity}%</Label>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[backgroundOpacity]}
                onValueChange={([value]) => onChange({ backgroundOpacity: value })}
              />
            </div>
          </TabsContent>

          <TabsContent value="behavior" className="space-y-5 pt-4">
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                {settings.backgroundLocked ? (
                  <Lock className="h-4 w-4 text-destructive" />
                ) : (
                  <Unlock className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground">Lock Background</p>
                  <p className="text-xs text-muted-foreground">Prevent background adjustments on this slide.</p>
                </div>
              </div>
              <Switch
                checked={Boolean(settings.backgroundLocked)}
                onCheckedChange={value => onChange({ backgroundLocked: value })}
              />
            </div>

            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-4">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Grid3x3 className="h-4 w-4" />
                Canvas Guides
              </Label>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Eye className="h-4 w-4" />
                    Show Grid
                  </div>
                  <Switch
                    checked={Boolean(settings.showGrid)}
                    onCheckedChange={value => onChange({ showGrid: value })}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Type className="h-4 w-4" />
                    Show Guides
                  </div>
                  <Switch
                    checked={Boolean(settings.showGuides)}
                    onCheckedChange={value => onChange({ showGuides: value })}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Layers className="h-4 w-4" />
                    Snap to Grid
                  </div>
                  <Switch
                    checked={Boolean(settings.snapToGrid ?? true)}
                    onCheckedChange={value => onChange({ snapToGrid: value })}
                  />
                </div>
                {settings.snapToGrid !== false && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Grid Size {gridSize}px</Label>
                    <Slider
                      min={4}
                      max={120}
                      step={2}
                      value={[gridSize]}
                      onValueChange={([value]) => onChange({ gridSize: value })}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-4">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Hash className="h-4 w-4" />
                Slide Numbering
              </Label>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Show Slide Number</span>
                <Switch
                  checked={showSlideNumber}
                  onCheckedChange={value => onChange({ showSlideNumber: value })}
                />
              </div>
              {showSlideNumber && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Position</Label>
                  <Select
                    value={settings.slideNumberPosition ?? 'bottom-right'}
                    onValueChange={value =>
                      onChange({
                        slideNumberPosition: value as PresentationSettings['slideNumberPosition'],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="top-left">Top Left</SelectItem>
                      <SelectItem value="top-right">Top Right</SelectItem>
                      <SelectItem value="bottom-left">Bottom Left</SelectItem>
                      <SelectItem value="bottom-right">Bottom Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-4">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Calendar className="h-4 w-4" />
                Speaker Notes
              </Label>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Show Notes Panel</span>
                <Switch checked={notesVisible} onCheckedChange={handleNotesToggle} />
              </div>
              {notesVisible && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Position</Label>
                  <Select
                    value={settings.slideNotesPosition ?? 'bottom'}
                    onValueChange={value => handleNotesPosition(value as SlideNotesPosition)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      {NOTES_POSITIONS.map(position => (
                        <SelectItem key={position} value={position}>
                          {position === 'bottom' ? 'Bottom' : 'Right Side'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="transitions" className="space-y-5 pt-4">
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-4">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4" />
                Transition Effect
              </Label>
              <Select
                value={(settings.transitionEffect as string) ?? settings.slideshowTransition ?? 'fade'}
                onValueChange={handleTransitionChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {TRANSITION_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Duration {transitionDuration}ms</Label>
                <Slider
                  min={100}
                  max={2000}
                  step={50}
                  value={[transitionDuration]}
                  onValueChange={([value]) => onChange({ transitionDuration: value })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-4">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4" />
                Auto Advance
              </Label>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Enable Auto Advance</span>
                <Switch checked={Boolean(settings.autoAdvance)} onCheckedChange={handleAutoAdvanceToggle} />
              </div>
              {settings.autoAdvance && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Delay {autoAdvanceDuration}s</Label>
                  <Slider
                    min={1}
                    max={60}
                    step={1}
                    value={[autoAdvanceDuration]}
                    onValueChange={([value]) => handleAutoAdvanceDurationChange(value)}
                  />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="accessibility" className="space-y-5 pt-4">
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">High Contrast</p>
                  <p className="text-xs text-muted-foreground">Boost colour separation for readability.</p>
                </div>
                <Switch
                  checked={Boolean(settings.highContrast)}
                  onCheckedChange={value => onChange({ highContrast: value })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Larger Text</p>
                  <p className="text-xs text-muted-foreground">Increase base typography scale.</p>
                </div>
                <Switch
                  checked={Boolean(settings.largeText)}
                  onCheckedChange={value => onChange({ largeText: value })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Reduced Motion</p>
                  <p className="text-xs text-muted-foreground">Minimise animations during playback.</p>
                </div>
                <Switch
                  checked={Boolean(settings.reducedMotion)}
                  onCheckedChange={value => onChange({ reducedMotion: value })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-4">
              <Label className="text-sm font-semibold text-foreground">Responsive Preview</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="justify-start">
                  <Monitor className="mr-2 h-4 w-4" />
                  Desktop
                </Button>
                <Button variant="outline" size="sm" className="justify-start">
                  <Tablet className="mr-2 h-4 w-4" />
                  Tablet
                </Button>
                <Button variant="outline" size="sm" className="justify-start">
                  <Smartphone className="mr-2 h-4 w-4" />
                  Mobile
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-border/60 px-5 py-4">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReset}>
            Reset
          </Button>
          <Button onClick={onClose}>Apply</Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
