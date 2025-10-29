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
            <TabsTrigger value="background" className="h-9 rounded-lg text-xs font-semibold">
              Background
            </TabsTrigger>
            <TabsTrigger value="behavior" className="h-9 rounded-lg text-xs font-semibold">
              Behavior
            </TabsTrigger>
            <TabsTrigger value="transitions" className="h-9 rounded-lg text-xs font-semibold">
              Transitions
            </TabsTrigger>
            <TabsTrigger value="accessibility" className="h-9 rounded-lg text-xs font-semibold">
              Access
            </TabsTrigger>
          </TabsList>

          <TabsContent value="background" className="space-y-6">
            <div className="space-y-4">
              <Label className="flex items-center gap-2 text-base font-semibold">
                <Palette className="h-4 w-4" />
                Background Type
              </Label>
              <div className="flex gap-2">
                <Button
                  variant={backgroundMode === 'solid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleBackgroundTypeChange('solid')}
                  className="flex-1"
                >
                  <Droplet className="mr-2 h-4 w-4" />
                  Solid
                </Button>
                <Button
                  variant={backgroundMode === 'gradient' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleBackgroundTypeChange('gradient')}
                  className="flex-1"
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Gradient
                </Button>
                <Button
                  variant={backgroundMode === 'image' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleBackgroundTypeChange('image')}
                  className="flex-1"
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Image
                </Button>
              </div>
            </div>

            {backgroundMode === 'solid' && (
              <div className="space-y-3">
                <Label>Color</Label>
                <div className="flex gap-2">
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
                    placeholder="#FFFFFF"
                  />
                </div>
              </div>
            )}

            {backgroundMode === 'gradient' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Color</Label>
                    <Input
                      type="color"
                      value={settings.backgroundGradientStart ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientStart}
                      onChange={event => handleGradientChange({ backgroundGradientStart: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Color</Label>
                    <Input
                      type="color"
                      value={settings.backgroundGradientEnd ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientEnd}
                      onChange={event => handleGradientChange({ backgroundGradientEnd: event.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select
                    value={settings.backgroundGradientDirection ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientDirection}
                    onValueChange={value => handleGradientChange({ backgroundGradientDirection: value })}
                  >
                    <SelectTrigger>
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
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                <div className="flex items-center gap-3">
                  {backgroundLocked ? <Lock className="h-4 w-4 text-destructive" /> : <Unlock className="h-4 w-4 text-muted-foreground" />}
                  <div>
                    <Label className="font-medium">Lock Slide Background</Label>
                    <p className="text-xs text-muted-foreground">Prevent accidental changes to the background</p>
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

                <div className="space-y-4 rounded-lg bg-muted/50 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      Show Grid
                    </div>
                    <Switch checked={showGrid} onCheckedChange={value => onChange({ showGrid: value })} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      Show Guides
                    </div>
                    <Switch checked={showGuides} onCheckedChange={value => onChange({ showGuides: value })} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Move className="h-4 w-4" />
                      Snap to Grid
                    </div>
                    <Switch checked={snapToGrid} onCheckedChange={value => onChange({ snapToGrid: value })} />
                  </div>

                  {showGrid && (
                    <div className="space-y-2 rounded-lg bg-background p-4">
                      <Label className="text-xs font-semibold uppercase text-muted-foreground">
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
                <Label className="flex items-center gap-2 text-base font-semibold">
                  <Hash className="h-4 w-4" />
                  Slide Numbering
                </Label>

                <div className="space-y-4 rounded-lg bg-muted/50 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <Label className="text-muted-foreground">Show Slide Number</Label>
                    <Switch checked={showSlideNumber} onCheckedChange={value => onChange({ showSlideNumber: value })} />
                  </div>

                  {showSlideNumber && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase text-muted-foreground">Position</Label>
                      <Select
                        value={slideNumberPosition}
                        onValueChange={value =>
                          onChange({
                            slideNumberPosition: value as SlideNumberPosition,
                          })
                        }
                      >
                        <SelectTrigger>
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
                <Label className="flex items-center gap-2 text-base font-semibold">
                  <MessageSquare className="h-4 w-4" />
                  Speaker Notes
                </Label>

                <div className="space-y-4 rounded-lg bg-muted/50 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <Label className="text-muted-foreground">Show Notes Panel</Label>
                    <Switch checked={notesVisible} onCheckedChange={value => onToggleNotes?.(value)} />
                  </div>

                  {notesVisible && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase text-muted-foreground">Position</Label>
                      <Select
                        value={settings.slideNotesPosition ?? DEFAULT_PRESENTATION_SETTINGS.slideNotesPosition}
                        onValueChange={value => onNotesPositionChange?.(value as SlideNotesPosition)}
                      >
                        <SelectTrigger>
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

                  if (value !== 'none') {
                    partial.slideshowTransition = value as SlideshowTransition;
                  }

                  onChange(partial);
                }}
              >
                <SelectTrigger>
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

              <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
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
              <Label className="flex items-center gap-2 text-base font-semibold">
                <Clock className="h-4 w-4" />
                Auto-Advance
              </Label>

              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                <div>
                  <Label className="font-medium">Enable Auto-Advance</Label>
                  <p className="text-xs text-muted-foreground">Automatically advance to the next slide</p>
                </div>
                <Switch checked={autoAdvance} onCheckedChange={handleAutoAdvanceToggle} />
              </div>

              {autoAdvance && (
                <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">
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
              <Label className="flex items-center gap-2 text-base font-semibold">
                <Eye className="h-4 w-4" />
                Accessibility Options
              </Label>

              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                  <div>
                    <Label className="font-medium">High Contrast Mode</Label>
                    <p className="text-xs text-muted-foreground">Enhance visibility for text and elements</p>
                  </div>
                  <Switch checked={highContrast} onCheckedChange={value => onChange({ highContrast: value })} />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                  <div>
                    <Label className="font-medium">Large Text</Label>
                    <p className="text-xs text-muted-foreground">Increase base font size for readability</p>
                  </div>
                  <Switch checked={largeText} onCheckedChange={value => onChange({ largeText: value })} />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                  <div>
                    <Label className="font-medium">Reduced Motion</Label>
                    <p className="text-xs text-muted-foreground">Minimize animations and transitions</p>
                  </div>
                  <Switch checked={reducedMotion} onCheckedChange={value => onChange({ reducedMotion: value })} />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-base font-semibold">Responsive Preview</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" disabled>
                  <Monitor className="mr-2 h-4 w-4" />
                  Desktop
                </Button>
                <Button variant="outline" size="sm" className="flex-1" disabled>
                  <Tablet className="mr-2 h-4 w-4" />
                  Tablet
                </Button>
                <Button variant="outline" size="sm" className="flex-1" disabled>
                  <Smartphone className="mr-2 h-4 w-4" />
                  Mobile
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-5 py-4">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset to Defaults
          </Button>
          <Button size="sm" onClick={onClose}>
            Apply Settings
          </Button>
        </div>
      </div>
    </div>
  );
};
