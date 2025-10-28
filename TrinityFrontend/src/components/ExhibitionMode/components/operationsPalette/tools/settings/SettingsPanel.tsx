import React, { useEffect, useMemo, useState } from 'react';
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

const ACCENT_COLOR = '#FACC15';
const ACCENT_DARK = '#B45309';
const BORDER_COLOR = '#E5E7EB';
const MUTED_SURFACE = '#F9FAFB';

const TAB_TRIGGER_CLASSES = cn(
  'rounded-full px-4 py-2 text-sm font-semibold text-[#6B7280] transition-all duration-200',
  'data-[state=active]:bg-white data-[state=active]:text-[#111827] data-[state=active]:shadow-sm'
);

const OPTION_BUTTON_BASE =
  'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all duration-200';
const OPTION_BUTTON_INACTIVE = 'border-[var(--border-color)] bg-[var(--muted-surface)] text-[#6B7280] hover:bg-[#F3F4F6]';
const OPTION_BUTTON_ACTIVE = 'border-[var(--accent-color)] bg-[#FFF4CC] text-[#111827] shadow-sm';

const CARD_BASE = 'rounded-2xl border border-[var(--border-color)] bg-white px-5 py-4 shadow-sm';
const CARD_SUBTLE =
  'rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--muted-surface)] px-4 py-3 text-sm';

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

  useEffect(() => {
    setSolidColorInput(resolvedSolidColor.toUpperCase());
  }, [resolvedSolidColor]);

  const handleBackgroundTypeChange = (type: 'solid' | 'gradient' | 'image') => {
    onChange({ backgroundMode: type });
  };

  const handleSolidColorCommit = (value: string) => {
    const sanitised = sanitiseHex(value);
    setSolidColorInput(sanitised.toUpperCase());

    if (/^#([0-9A-F]{3}|[0-9A-F]{6})$/.test(sanitised.toUpperCase())) {
      onChange({ backgroundMode: 'solid', backgroundSolidColor: sanitised.toLowerCase() });
    }
  };

  const handleGradientChange = (partial: Partial<PresentationSettings>) => {
    onChange({ backgroundMode: 'gradient', ...partial });
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
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-white text-[#111827]"
      style={{
        ['--accent-color' as string]: ACCENT_COLOR,
        ['--accent-dark' as string]: ACCENT_DARK,
        ['--border-color' as string]: BORDER_COLOR,
        ['--muted-surface' as string]: MUTED_SURFACE,
      }}
    >
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#FFF4CC] p-2 text-[var(--accent-dark)]">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Slide Settings</h2>
            <p className="text-sm text-[#6B7280]">Configure slide behavior and appearance</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full border border-transparent text-[#6B7280] transition-colors hover:border-[var(--border-color)] hover:bg-[var(--muted-surface)] hover:text-[#111827]"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-8 py-8">
        <Tabs defaultValue="background" className="w-full">
          <TabsList className="mb-8 grid w-full grid-cols-4 gap-2 rounded-full border border-[var(--border-color)] bg-[var(--muted-surface)] p-1">
            <TabsTrigger value="background" className={TAB_TRIGGER_CLASSES}>
              Background
            </TabsTrigger>
            <TabsTrigger value="behavior" className={TAB_TRIGGER_CLASSES}>
              Behavior
            </TabsTrigger>
            <TabsTrigger value="transitions" className={TAB_TRIGGER_CLASSES}>
              Transitions
            </TabsTrigger>
            <TabsTrigger value="accessibility" className={TAB_TRIGGER_CLASSES}>
              Access
            </TabsTrigger>
          </TabsList>

          <TabsContent value="background" className="mt-2 space-y-8">
            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#6B7280]">
                <Palette className="h-4 w-4 text-[var(--accent-dark)]" />
                Background Type
              </Label>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  type="button"
                  onClick={() => handleBackgroundTypeChange('solid')}
                  className={cn(
                    OPTION_BUTTON_BASE,
                    backgroundMode === 'solid' ? OPTION_BUTTON_ACTIVE : OPTION_BUTTON_INACTIVE
                  )}
                >
                  <Droplet className="h-4 w-4" />
                  Solid
                </Button>
                <Button
                  type="button"
                  onClick={() => handleBackgroundTypeChange('gradient')}
                  className={cn(
                    OPTION_BUTTON_BASE,
                    backgroundMode === 'gradient' ? OPTION_BUTTON_ACTIVE : OPTION_BUTTON_INACTIVE
                  )}
                >
                  <Layers className="h-4 w-4" />
                  Gradient
                </Button>
                <Button
                  type="button"
                  onClick={() => handleBackgroundTypeChange('image')}
                  className={cn(
                    OPTION_BUTTON_BASE,
                    backgroundMode === 'image' ? OPTION_BUTTON_ACTIVE : OPTION_BUTTON_INACTIVE
                  )}
                >
                  <ImageIcon className="h-4 w-4" />
                  Image
                </Button>
              </div>
            </div>

            {backgroundMode === 'solid' && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-[#374151]">Color</Label>
                <div className="flex gap-3">
                  <Input
                    type="color"
                    value={solidColorInput}
                    onChange={event => handleSolidColorCommit(event.target.value)}
                    className="h-11 w-20 cursor-pointer rounded-xl border border-[var(--border-color)] bg-white p-1"
                  />
                  <Input
                    value={solidColorInput}
                    onChange={event => setSolidColorInput(sanitiseHex(event.target.value).toUpperCase())}
                    onBlur={event => handleSolidColorCommit(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        handleSolidColorCommit((event.target as HTMLInputElement).value);
                      }
                    }}
                    className="h-11 flex-1 rounded-xl border-[var(--border-color)] text-sm uppercase text-[#111827] focus-visible:border-[var(--accent-color)] focus-visible:ring-[var(--accent-color)]"
                    placeholder="#FFFFFF"
                  />
                </div>
              </div>
            )}

            {backgroundMode === 'gradient' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-[#374151]">Start Color</Label>
                    <Input
                      type="color"
                      value={settings.backgroundGradientStart ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientStart}
                      onChange={event => handleGradientChange({ backgroundGradientStart: event.target.value })}
                      className="h-11 w-full cursor-pointer rounded-xl border border-[var(--border-color)] bg-white p-1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-[#374151]">End Color</Label>
                    <Input
                      type="color"
                      value={settings.backgroundGradientEnd ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientEnd}
                      onChange={event => handleGradientChange({ backgroundGradientEnd: event.target.value })}
                      className="h-11 w-full cursor-pointer rounded-xl border border-[var(--border-color)] bg-white p-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-[#374151]">Direction</Label>
                  <Select
                    value={settings.backgroundGradientDirection ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientDirection}
                    onValueChange={value => handleGradientChange({ backgroundGradientDirection: value })}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-[var(--border-color)] text-sm text-[#111827] focus-visible:border-[var(--accent-color)] focus-visible:ring-[var(--accent-color)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-[var(--border-color)] bg-white text-[#111827]">
                      {GRADIENT_DIRECTIONS.map(direction => (
                        <SelectItem key={direction.value} value={direction.value} className="text-sm">
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
                <Label className="text-sm font-semibold text-[#374151]">Background Image</Label>
                <Button
                  variant="outline"
                  disabled
                  className="h-11 w-full justify-start gap-2 rounded-xl border-[var(--border-color)] bg-[var(--muted-surface)] text-sm font-semibold text-[#6B7280]"
                >
                  <ImageIcon className="h-4 w-4" />
                  Choose Image (coming soon)
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-[#374151]">Opacity: {safeBackgroundOpacity}%</Label>
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
                className="[&_.bg-primary]:bg-[var(--accent-color)] [&_.bg-secondary]:bg-[#F3F4F6] [&_.border-primary]:border-[var(--accent-color)]"
              />
            </div>
          </TabsContent>

          <TabsContent value="behavior" className="mt-2 space-y-8">
            <div className="space-y-5">
              <div className={CARD_BASE}>
                <div className="flex items-center gap-3">
                  {backgroundLocked ? (
                    <Lock className="h-4 w-4 text-[var(--accent-dark)]" />
                  ) : (
                    <Unlock className="h-4 w-4 text-[#9CA3AF]" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">Lock Slide Background</p>
                    <p className="text-xs text-[#6B7280]">Prevent accidental changes to the background</p>
                  </div>
                </div>
                <Switch
                  checked={backgroundLocked}
                  onCheckedChange={value => onChange({ backgroundLocked: value })}
                  className="data-[state=checked]:bg-[var(--accent-color)]"
                />
              </div>

              <Separator className="border-[var(--border-color)]" />

              <div className="space-y-4">
                <Label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#6B7280]">
                  <Grid3x3 className="h-4 w-4 text-[var(--accent-dark)]" />
                  Grid & Guides
                </Label>

                <div className={CARD_BASE}>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-[#374151]">
                        <Eye className="h-4 w-4 text-[#9CA3AF]" />
                        Show Grid
                      </div>
                      <Switch
                        checked={showGrid}
                        onCheckedChange={value => onChange({ showGrid: value })}
                        className="data-[state=checked]:bg-[var(--accent-color)]"
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-[#374151]">
                        <Eye className="h-4 w-4 text-[#9CA3AF]" />
                        Show Guides
                      </div>
                      <Switch
                        checked={showGuides}
                        onCheckedChange={value => onChange({ showGuides: value })}
                        className="data-[state=checked]:bg-[var(--accent-color)]"
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-[#374151]">
                        <Move className="h-4 w-4 text-[#9CA3AF]" />
                        Snap to Grid
                      </div>
                      <Switch
                        checked={snapToGrid}
                        onCheckedChange={value => onChange({ snapToGrid: value })}
                        className="data-[state=checked]:bg-[var(--accent-color)]"
                      />
                    </div>
                  </div>
                </div>

                {showGrid && (
                  <div className={CARD_SUBTLE}>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                      Grid Size: {safeGridSize}px
                    </Label>
                    <Slider
                      value={[safeGridSize]}
                      onValueChange={([value]) => onChange({ gridSize: Math.min(200, Math.max(4, Math.round(value))) })}
                      min={4}
                      max={200}
                      step={4}
                      className="mt-3 [&_.bg-primary]:bg-[var(--accent-color)] [&_.bg-secondary]:bg-[#EDEEF2] [&_.border-primary]:border-[var(--accent-color)]"
                    />
                  </div>
                )}
              </div>

              <Separator className="border-[var(--border-color)]" />

              <div className="space-y-4">
                <Label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#6B7280]">
                  <Hash className="h-4 w-4 text-[var(--accent-dark)]" />
                  Slide Numbering
                </Label>

                <div className={CARD_BASE}>
                  <div className="flex items-center justify-between text-sm text-[#374151]">
                    Show Slide Number
                    <Switch
                      checked={showSlideNumber}
                      onCheckedChange={value => onChange({ showSlideNumber: value })}
                      className="data-[state=checked]:bg-[var(--accent-color)]"
                    />
                  </div>

                  {showSlideNumber && (
                    <div className="mt-4 space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">Position</Label>
                      <Select
                        value={slideNumberPosition}
                        onValueChange={value => onChange({ slideNumberPosition: value as SlideNumberPosition })}
                      >
                        <SelectTrigger className="h-11 rounded-xl border-[var(--border-color)] text-sm text-[#111827] focus-visible:border-[var(--accent-color)] focus-visible:ring-[var(--accent-color)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border border-[var(--border-color)] bg-white text-[#111827]">
                          {SLIDE_NUMBER_POSITIONS.map(position => (
                            <SelectItem key={position} value={position} className="text-sm capitalize">
                              {position.replace('-', ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              <Separator className="border-[var(--border-color)]" />

              <div className="space-y-4">
                <Label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#6B7280]">
                  <MessageSquare className="h-4 w-4 text-[var(--accent-dark)]" />
                  Speaker Notes
                </Label>

                <div className={CARD_BASE}>
                  <div className="flex items-center justify-between text-sm text-[#374151]">
                    Show Notes Panel
                    <Switch
                      checked={notesVisible}
                      onCheckedChange={value => onToggleNotes?.(value)}
                      className="data-[state=checked]:bg-[var(--accent-color)]"
                    />
                  </div>

                  {notesVisible && (
                    <div className="mt-4 space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">Position</Label>
                      <Select
                        value={settings.slideNotesPosition ?? DEFAULT_PRESENTATION_SETTINGS.slideNotesPosition}
                        onValueChange={value => onNotesPositionChange?.(value as SlideNotesPosition)}
                      >
                        <SelectTrigger className="h-11 rounded-xl border-[var(--border-color)] text-sm text-[#111827] focus-visible:border-[var(--accent-color)] focus-visible:ring-[var(--accent-color)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border border-[var(--border-color)] bg-white text-[#111827]">
                          {NOTES_POSITIONS.map(position => (
                            <SelectItem key={position} value={position} className="text-sm capitalize">
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

          <TabsContent value="transitions" className="mt-2 space-y-8">
            <div className="space-y-5">
              <Label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#6B7280]">
                <Zap className="h-4 w-4 text-[var(--accent-dark)]" />
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
                <SelectTrigger className="h-11 rounded-xl border-[var(--border-color)] text-sm text-[#111827] focus-visible:border-[var(--accent-color)] focus-visible:ring-[var(--accent-color)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[var(--border-color)] bg-white text-[#111827]">
                  {TRANSITION_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value} className="text-sm">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className={CARD_SUBTLE}>
                <Label className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
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
                  className="mt-3 [&_.bg-primary]:bg-[var(--accent-color)] [&_.bg-secondary]:bg-[#EDEEF2] [&_.border-primary]:border-[var(--accent-color)]"
                />
              </div>
            </div>

            <Separator className="border-[var(--border-color)]" />

            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#6B7280]">
                <Clock className="h-4 w-4 text-[var(--accent-dark)]" />
                Auto-Advance
              </Label>

              <div className={CARD_BASE}>
                <div>
                  <p className="text-sm font-semibold text-[#374151]">Enable Auto-Advance</p>
                  <p className="text-xs text-[#6B7280]">Automatically advance to the next slide</p>
                </div>
                <Switch
                  checked={autoAdvance}
                  onCheckedChange={handleAutoAdvanceToggle}
                  className="data-[state=checked]:bg-[var(--accent-color)]"
                />
              </div>

              {autoAdvance && (
                <div className={CARD_SUBTLE}>
                  <Label className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                    Duration: {safeAutoAdvanceDuration}s
                  </Label>
                  <Slider
                    value={[safeAutoAdvanceDuration]}
                    onValueChange={([value]) => handleAutoAdvanceDurationChange(value)}
                    min={1}
                    max={60}
                    step={1}
                    className="mt-3 [&_.bg-primary]:bg-[var(--accent-color)] [&_.bg-secondary]:bg-[#EDEEF2] [&_.border-primary]:border-[var(--accent-color)]"
                  />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="accessibility" className="mt-2 space-y-8">
            <div className="space-y-5">
              <Label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#6B7280]">
                <Eye className="h-4 w-4 text-[var(--accent-dark)]" />
                Accessibility Options
              </Label>

              <div className="space-y-4">
                <div className={CARD_BASE}>
                  <div>
                    <p className="text-sm font-semibold text-[#374151]">High Contrast Mode</p>
                    <p className="text-xs text-[#6B7280]">Enhance visibility for text and elements</p>
                  </div>
                  <Switch
                    checked={highContrast}
                    onCheckedChange={value => onChange({ highContrast: value })}
                    className="data-[state=checked]:bg-[var(--accent-color)]"
                  />
                </div>

                <div className={CARD_BASE}>
                  <div>
                    <p className="text-sm font-semibold text-[#374151]">Large Text</p>
                    <p className="text-xs text-[#6B7280]">Increase base font size for readability</p>
                  </div>
                  <Switch
                    checked={largeText}
                    onCheckedChange={value => onChange({ largeText: value })}
                    className="data-[state=checked]:bg-[var(--accent-color)]"
                  />
                </div>

                <div className={CARD_BASE}>
                  <div>
                    <p className="text-sm font-semibold text-[#374151]">Reduced Motion</p>
                    <p className="text-xs text-[#6B7280]">Minimize animations and transitions</p>
                  </div>
                  <Switch
                    checked={reducedMotion}
                    onCheckedChange={value => onChange({ reducedMotion: value })}
                    className="data-[state=checked]:bg-[var(--accent-color)]"
                  />
                </div>
              </div>
            </div>

            <Separator className="border-[var(--border-color)]" />

            <div className="space-y-3">
              <Label className="text-sm font-semibold uppercase tracking-wide text-[#6B7280]">
                Responsive Preview
              </Label>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 justify-center gap-2 rounded-xl border-[var(--border-color)] bg-[var(--muted-surface)] text-sm font-semibold text-[#6B7280]"
                  disabled
                >
                  <Monitor className="h-4 w-4" />
                  Desktop
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 justify-center gap-2 rounded-xl border-[var(--border-color)] bg-[var(--muted-surface)] text-sm font-semibold text-[#6B7280]"
                  disabled
                >
                  <Tablet className="h-4 w-4" />
                  Tablet
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 justify-center gap-2 rounded-xl border-[var(--border-color)] bg-[var(--muted-surface)] text-sm font-semibold text-[#6B7280]"
                  disabled
                >
                  <Smartphone className="h-4 w-4" />
                  Mobile
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-[var(--border-color)] px-8 py-6">
        <Button
          variant="outline"
          onClick={onClose}
          className="h-11 rounded-xl border-[var(--border-color)] px-6 text-sm font-semibold text-[#111827] hover:bg-[var(--muted-surface)]"
        >
          Cancel
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onReset}
            className="h-11 rounded-xl border-[var(--border-color)] px-6 text-sm font-semibold text-[#111827] hover:bg-[var(--muted-surface)]"
          >
            Reset to Defaults
          </Button>
          <Button
            onClick={onClose}
            className="h-11 rounded-xl bg-[var(--accent-color)] px-6 text-sm font-semibold text-[#111827] transition-colors hover:bg-[#EAB308]"
          >
            Apply Settings
          </Button>
        </div>
      </div>
    </div>
  );
};
