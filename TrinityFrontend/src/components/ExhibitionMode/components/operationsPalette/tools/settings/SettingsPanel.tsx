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

const TAB_TRIGGER_CLASSES = cn(
  'relative flex min-w-0 items-center justify-center rounded-xl border border-transparent px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors',
  'hover:text-foreground data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
);

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
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Slide Settings</h2>
            <p className="text-sm text-muted-foreground">Configure slide behaviour and appearance</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-muted"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-6 py-5">
        <Tabs defaultValue="background" className="w-full">
          <TabsList className="grid w-full grid-cols-4 gap-2 rounded-xl bg-muted/40 p-1">
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

          <TabsContent value="background" className="mt-6 space-y-6">
            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-base font-semibold">
                <Palette className="h-4 w-4" />
                Background Type
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={backgroundMode === 'solid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleBackgroundTypeChange('solid')}
                  className="justify-start gap-2"
                >
                  <Droplet className="h-4 w-4" />
                  Solid
                </Button>
                <Button
                  variant={backgroundMode === 'gradient' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleBackgroundTypeChange('gradient')}
                  className="justify-start gap-2"
                >
                  <Layers className="h-4 w-4" />
                  Gradient
                </Button>
                <Button
                  variant={backgroundMode === 'image' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleBackgroundTypeChange('image')}
                  className="justify-start gap-2"
                >
                  <ImageIcon className="h-4 w-4" />
                  Image
                </Button>
              </div>
            </div>

            {backgroundMode === 'solid' && (
              <div className="space-y-3">
                <Label>Colour</Label>
                <div className="flex gap-3">
                  <Input
                    type="color"
                    value={solidColorInput}
                    onChange={event => handleSolidColorCommit(event.target.value)}
                    className="h-10 w-20 cursor-pointer"
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
                    className="flex-1 uppercase"
                    placeholder="#FFFFFF"
                  />
                </div>
              </div>
            )}

            {backgroundMode === 'gradient' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Colour</Label>
                    <Input
                      type="color"
                      value={settings.backgroundGradientStart ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientStart}
                      onChange={event =>
                        handleGradientChange({ backgroundGradientStart: event.target.value })
                      }
                      className="h-10 w-full cursor-pointer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Colour</Label>
                    <Input
                      type="color"
                      value={settings.backgroundGradientEnd ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientEnd}
                      onChange={event =>
                        handleGradientChange({ backgroundGradientEnd: event.target.value })
                      }
                      className="h-10 w-full cursor-pointer"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select
                    value={settings.backgroundGradientDirection ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientDirection}
                    onValueChange={value =>
                      handleGradientChange({ backgroundGradientDirection: value })
                    }
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
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
                <Button variant="outline" className="w-full justify-start gap-2" disabled>
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

          <TabsContent value="behavior" className="mt-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-3">
                  {backgroundLocked ? (
                    <Lock className="h-4 w-4 text-destructive" />
                  ) : (
                    <Unlock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <Label className="font-medium">Lock Slide Background</Label>
                    <p className="text-xs text-muted-foreground">
                      Prevent accidental changes to the background
                    </p>
                  </div>
                </div>
                <Switch
                  checked={backgroundLocked}
                  onCheckedChange={value => onChange({ backgroundLocked: value })}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="flex items-center gap-2 text-base font-semibold">
                  <Grid3x3 className="h-4 w-4" />
                  Grid & Guides
                </Label>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <span>Show Grid</span>
                  </div>
                  <Switch checked={showGrid} onCheckedChange={value => onChange({ showGrid: value })} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <span>Show Guides</span>
                  </div>
                  <Switch checked={showGuides} onCheckedChange={value => onChange({ showGuides: value })} />
                </div>

                <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Move className="h-4 w-4 text-muted-foreground" />
                  <span>Snap to Grid</span>
                </div>
                  <Switch checked={snapToGrid} onCheckedChange={value => onChange({ snapToGrid: value })} />
                </div>

                {showGrid && (
                  <div className="space-y-2 rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-sm">
                    <Label className="text-xs font-medium">Grid Size: {safeGridSize}px</Label>
                    <Slider
                      value={[safeGridSize]}
                      onValueChange={([value]) =>
                        onChange({ gridSize: Math.min(200, Math.max(4, Math.round(value))) })
                      }
                      min={4}
                      max={200}
                      step={4}
                    />
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="flex items-center gap-2 text-base font-semibold">
                  <Hash className="h-4 w-4" />
                  Slide Numbering
                </Label>

                <div className="flex items-center justify-between text-sm">
                  <span>Show Slide Number</span>
                  <Switch checked={showSlideNumber} onCheckedChange={value => onChange({ showSlideNumber: value })} />
                </div>

                {showSlideNumber && (
                  <div className="space-y-2 rounded-lg border border-dashed border-border/60 bg-muted/20 p-3">
                    <Label className="text-xs font-medium">Position</Label>
                    <Select
                      value={slideNumberPosition}
                      onValueChange={value =>
                        onChange({ slideNumberPosition: value as SlideNumberPosition })
                      }
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background">
                        {SLIDE_NUMBER_POSITIONS.map(position => (
                          <SelectItem key={position} value={position}>
                            {position
                              .split('-')
                              .map(word => word[0]?.toUpperCase().concat(word.slice(1)) ?? word)
                              .join(' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="flex items-center gap-2 text-base font-semibold">
                  <MessageSquare className="h-4 w-4" />
                  Speaker Notes
                </Label>

                <div className="flex items-center justify-between text-sm">
                  <span>Show Notes Panel</span>
                  <Switch
                    checked={notesVisible}
                    onCheckedChange={value => onToggleNotes?.(value)}
                  />
                </div>

                {notesVisible && (
                  <div className="space-y-2 rounded-lg border border-dashed border-border/60 bg-muted/20 p-3">
                    <Label className="text-xs font-medium">Position</Label>
                    <Select
                      value={settings.slideNotesPosition ?? DEFAULT_PRESENTATION_SETTINGS.slideNotesPosition}
                      onValueChange={value => onNotesPositionChange?.(value as SlideNotesPosition)}
                    >
                      <SelectTrigger className="bg-background">
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
            </div>
          </TabsContent>

          <TabsContent value="transitions" className="mt-6 space-y-6">
            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-base font-semibold">
                <Zap className="h-4 w-4" />
                Transition Effect
              </Label>
              <Select
                value={transitionEffect}
                onValueChange={value => {
                  const partial: Partial<PresentationSettings> = {
                    transitionEffect: value as PresentationSettings['transitionEffect'],
                  };

                  if ((['fade', 'slide', 'zoom'] as SlideshowTransition[]).includes(value as SlideshowTransition)) {
                    partial.slideshowTransition = value as SlideshowTransition;
                  }

                  onChange(partial);
                }}
              >
                <SelectTrigger className="bg-background">
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
                <Label>Duration: {safeTransitionDuration}ms</Label>
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
              <Label className="flex items-center gap-2 text-base font-semibold">
                <Clock className="h-4 w-4" />
                Auto-Advance
              </Label>

              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <div>
                  <Label className="font-medium">Enable Auto-Advance</Label>
                  <p className="text-xs text-muted-foreground">Automatically advance to the next slide</p>
                </div>
                <Switch checked={autoAdvance} onCheckedChange={handleAutoAdvanceToggle} />
              </div>

              {autoAdvance && (
                <div className="space-y-2 rounded-lg border border-dashed border-border/60 bg-muted/20 p-3">
                  <Label>Duration: {safeAutoAdvanceDuration}s</Label>
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

          <TabsContent value="accessibility" className="mt-6 space-y-6">
            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-base font-semibold">
                <Eye className="h-4 w-4" />
                Accessibility Options
              </Label>

              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <div>
                  <Label className="font-medium">High Contrast Mode</Label>
                  <p className="text-xs text-muted-foreground">Enhance visibility for text and elements</p>
                </div>
                <Switch checked={highContrast} onCheckedChange={value => onChange({ highContrast: value })} />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <div>
                  <Label className="font-medium">Large Text</Label>
                  <p className="text-xs text-muted-foreground">Increase base font size for readability</p>
                </div>
                <Switch checked={largeText} onCheckedChange={value => onChange({ largeText: value })} />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <div>
                  <Label className="font-medium">Reduced Motion</Label>
                  <p className="text-xs text-muted-foreground">Minimise animations and transitions</p>
                </div>
                <Switch checked={reducedMotion} onCheckedChange={value => onChange({ reducedMotion: value })} />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-base font-semibold">Responsive Preview</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="justify-center gap-2" disabled>
                  <Monitor className="h-4 w-4" />
                  Desktop
                </Button>
                <Button variant="outline" size="sm" className="justify-center gap-2" disabled>
                  <Tablet className="h-4 w-4" />
                  Tablet
                </Button>
                <Button variant="outline" size="sm" className="justify-center gap-2" disabled>
                  <Smartphone className="h-4 w-4" />
                  Mobile
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-5">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReset}>
            Reset to Defaults
          </Button>
          <Button onClick={onClose}>Apply Settings</Button>
        </div>
      </div>
    </div>
  );
};
