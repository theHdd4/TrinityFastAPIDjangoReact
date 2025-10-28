import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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

  const resolvedSolidHex = useMemo(() => {
    const candidate = settings.backgroundSolidColor ?? DEFAULT_PRESENTATION_SETTINGS.backgroundSolidColor;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(candidate)
      ? candidate
      : DEFAULT_PRESENTATION_SETTINGS.backgroundSolidColor;
  }, [settings.backgroundSolidColor]);

  const [backgroundHexInput, setBackgroundHexInput] = useState(resolvedSolidHex.toUpperCase());

  useEffect(() => {
    setBackgroundHexInput(resolvedSolidHex.toUpperCase());
  }, [resolvedSolidHex]);

  const handleBackgroundHexInputChange = useCallback(
    (value: string) => {
      const trimmed = value.replace(/\s+/g, '').toUpperCase();
      const prefixed = trimmed.startsWith('#') ? trimmed : `#${trimmed.replace(/#/g, '')}`;
      const sanitised = `#${prefixed
        .replace(/[^0-9A-F#]/g, '')
        .replace(/#/g, '')
        .slice(0, 6)}`;
      setBackgroundHexInput(sanitised);
      if (/^#([0-9A-F]{3}|[0-9A-F]{6})$/.test(sanitised)) {
        onChange({ backgroundMode: 'solid', backgroundSolidColor: sanitised.toLowerCase() });
      }
    },
    [onChange],
  );

  const handleBackgroundModeChange = useCallback(
    (mode: 'solid' | 'gradient' | 'image') => {
      onChange({ backgroundMode: mode });
      if (mode === 'image' && !settings.backgroundImageUrl) {
        onChange({ backgroundImageUrl: '' });
      }
    },
    [onChange, settings.backgroundImageUrl],
  );

  const handleGradientChange = useCallback(
    (partial: Partial<PresentationSettings>) => {
      onChange({ backgroundMode: 'gradient', ...partial });
    },
    [onChange],
  );

  const handleAutoAdvanceToggle = useCallback(
    (value: boolean) => {
      onChange({
        autoAdvance: value,
        autoAdvanceDuration,
        slideshowDuration: autoAdvanceDuration,
      });
    },
    [autoAdvanceDuration, onChange],
  );

  const handleAutoAdvanceDurationChange = useCallback(
    (value: number) => {
      const safe = Math.max(1, value);
      onChange({
        autoAdvanceDuration: safe,
        slideshowDuration: safe,
      });
    },
    [onChange],
  );

  const handleTransitionChange = useCallback(
    (value: string) => {
      const candidate = value as PresentationSettings['transitionEffect'];
      onChange({
        transitionEffect: candidate,
        slideshowTransition: candidate === 'slide' || candidate === 'zoom' ? candidate : 'fade',
      });
    },
    [onChange],
  );

  const handleNotesToggle = useCallback(
    (value: boolean) => {
      onToggleNotes?.(value);
      onChange({ slideNotesVisible: value });
    },
    [onChange, onToggleNotes],
  );

  const handleNotesPosition = useCallback(
    (position: SlideNotesPosition) => {
      onChange({ slideNotesPosition: position });
      onNotesPositionChange?.(position);
    },
    [onChange, onNotesPositionChange],
  );

  const backgroundGradientStart = settings.backgroundGradientStart ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientStart;
  const backgroundGradientEnd = settings.backgroundGradientEnd ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientEnd;
  const backgroundGradientDirection = settings.backgroundGradientDirection ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientDirection;
  const backgroundImageUrl = settings.backgroundImageUrl ?? '';
  const isBackgroundLocked = Boolean(settings.backgroundLocked);
  const showGrid = Boolean(settings.showGrid);
  const showGuides = Boolean(settings.showGuides);
  const snapToGrid = Boolean(settings.snapToGrid ?? true);
  const autoAdvance = Boolean(settings.autoAdvance);
  const highContrast = Boolean(settings.highContrast);
  const largeText = Boolean(settings.largeText);
  const reducedMotion = Boolean(settings.reducedMotion);
  const notesPanelVisible = Boolean(notesVisible ?? settings.slideNotesVisible);
  const slideNumberPosition = settings.slideNumberPosition ?? 'bottom-right';
  const transitionEffect = (settings.transitionEffect as string) ?? settings.slideshowTransition ?? 'fade';

  return (
    <div className="flex h-full w-full max-w-[480px] flex-col rounded-none border border-border bg-background shadow-xl">
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Monitor className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <h3 className="text-xl font-semibold text-foreground">Slide Settings</h3>
            <p className="text-sm text-muted-foreground">Configure slide behaviour and appearance</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-6">
        <Tabs defaultValue="background" className="w-full py-6">
          <TabsList className="grid w-full grid-cols-2 gap-2 rounded-2xl border border-border bg-muted/20 p-2 sm:grid-cols-4">
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

          <TabsContent value="background" className="space-y-6 pt-6">
            <div className="space-y-4 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Palette className="h-4 w-4" />
                Background Type
              </Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  variant={backgroundMode === 'solid' ? 'default' : 'outline'}
                  size="sm"
                  className="h-10 justify-center rounded-xl text-sm"
                  onClick={() => handleBackgroundModeChange('solid')}
                >
                  <Droplet className="mr-2 h-4 w-4" />
                  Solid
                </Button>
                <Button
                  type="button"
                  variant={backgroundMode === 'gradient' ? 'default' : 'outline'}
                  size="sm"
                  className="h-10 justify-center rounded-xl text-sm"
                  onClick={() => handleBackgroundModeChange('gradient')}
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Gradient
                </Button>
                <Button
                  type="button"
                  variant={backgroundMode === 'image' ? 'default' : 'outline'}
                  size="sm"
                  className="h-10 justify-center rounded-xl text-sm"
                  onClick={() => handleBackgroundModeChange('image')}
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Image
                </Button>
              </div>
            </div>

            {backgroundMode === 'solid' && (
              <div className="space-y-4 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
                <Label className="text-sm font-semibold text-foreground">Color</Label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    type="color"
                    value={resolvedSolidHex}
                    onChange={event => onChange({ backgroundMode: 'solid', backgroundSolidColor: event.target.value })}
                    className="h-12 w-full cursor-pointer rounded-xl border border-border sm:w-28"
                  />
                  <Input
                    value={backgroundHexInput}
                    onChange={event => handleBackgroundHexInputChange(event.target.value)}
                    className="h-12 rounded-xl border-border text-sm font-medium uppercase tracking-wide"
                    maxLength={7}
                  />
                </div>
              </div>
            )}

            {backgroundMode === 'gradient' && (
              <div className="space-y-4 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">Start</Label>
                    <Input
                      type="color"
                      value={backgroundGradientStart}
                      onChange={event => handleGradientChange({ backgroundGradientStart: event.target.value })}
                      className="h-12 w-full cursor-pointer rounded-xl border border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">End</Label>
                    <Input
                      type="color"
                      value={backgroundGradientEnd}
                      onChange={event => handleGradientChange({ backgroundGradientEnd: event.target.value })}
                      className="h-12 w-full cursor-pointer rounded-xl border border-border"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Direction</Label>
                  <Select
                    value={backgroundGradientDirection}
                    onValueChange={value => handleGradientChange({ backgroundGradientDirection: value })}
                  >
                    <SelectTrigger className="rounded-xl border-border">
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
              <div className="space-y-3 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <ImageIcon className="h-4 w-4" />
                  Image URL
                </Label>
                <Input
                  value={backgroundImageUrl}
                  placeholder="https://example.com/background.jpg"
                  onChange={event =>
                    onChange({
                      backgroundMode: 'image',
                      backgroundImageUrl: event.target.value,
                    })
                  }
                  className="rounded-xl border-border"
                />
              </div>
            )}

            <div className="space-y-3 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
              <Label className="text-sm font-semibold text-foreground">Opacity: {backgroundOpacity}%</Label>
              <Slider
                value={[backgroundOpacity]}
                onValueChange={([value]) => onChange({ backgroundOpacity: value })}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
          </TabsContent>

          <TabsContent value="behavior" className="space-y-6 pt-6">
            <div className="space-y-4 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isBackgroundLocked ? (
                    <Lock className="h-4 w-4 text-destructive" />
                  ) : (
                    <Unlock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">Lock Slide</p>
                    <p className="text-xs text-muted-foreground">Prevent accidental edits</p>
                  </div>
                </div>
                <Switch checked={isBackgroundLocked} onCheckedChange={value => onChange({ backgroundLocked: value })} />
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Grid3x3 className="h-4 w-4" />
                Grid & Guides
              </Label>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span>Show Grid</span>
                </div>
                <Switch checked={showGrid} onCheckedChange={value => onChange({ showGrid: value })} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span>Show Guides</span>
                </div>
                <Switch checked={showGuides} onCheckedChange={value => onChange({ showGuides: value })} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Type className="h-4 w-4 text-muted-foreground" />
                  <span>Snap to Grid</span>
                </div>
                <Switch checked={snapToGrid} onCheckedChange={value => onChange({ snapToGrid: value })} />
              </div>
              {showGrid && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Grid Size: {gridSize}px</Label>
                  <Slider
                    value={[gridSize]}
                    onValueChange={([value]) => onChange({ gridSize: value })}
                    min={4}
                    max={200}
                    step={2}
                  />
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Hash className="h-4 w-4" />
                Slide Numbering
              </Label>
              <div className="flex items-center justify-between text-sm">
                <span>Show Slide Number</span>
                <Switch checked={showSlideNumber} onCheckedChange={value => onChange({ showSlideNumber: value })} />
              </div>
              {showSlideNumber && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Position</Label>
                  <Select
                    value={slideNumberPosition}
                    onValueChange={value => onChange({ slideNumberPosition: value as PresentationSettings['slideNumberPosition'] })}
                  >
                    <SelectTrigger className="rounded-xl border-border">
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

            <div className="space-y-4 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Type className="h-4 w-4" />
                Speaker Notes
              </Label>
              <div className="flex items-center justify-between text-sm">
                <span>Show Notes Panel</span>
                <Switch checked={notesPanelVisible} onCheckedChange={handleNotesToggle} />
              </div>
              {notesPanelVisible && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Position</Label>
                  <Select
                    value={(settings.slideNotesPosition as SlideNotesPosition) ?? 'bottom'}
                    onValueChange={value => handleNotesPosition(value as SlideNotesPosition)}
                  >
                    <SelectTrigger className="rounded-xl border-border">
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

          <TabsContent value="transitions" className="space-y-6 pt-6">
            <div className="space-y-3 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4" />
                Transition Effect
              </Label>
              <Select value={transitionEffect} onValueChange={handleTransitionChange}>
                <SelectTrigger className="rounded-xl border-border">
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
                <Label className="text-xs font-medium text-muted-foreground">Duration: {transitionDuration}ms</Label>
                <Slider
                  value={[transitionDuration]}
                  onValueChange={([value]) => onChange({ transitionDuration: value })}
                  min={100}
                  max={2000}
                  step={50}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4" />
                Auto-Advance
              </Label>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Enable Auto-Advance</span>
                <Switch checked={autoAdvance} onCheckedChange={handleAutoAdvanceToggle} />
              </div>
              {autoAdvance && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Duration: {autoAdvanceDuration}s</Label>
                  <Slider
                    value={[autoAdvanceDuration]}
                    onValueChange={([value]) => handleAutoAdvanceDurationChange(value)}
                    min={1}
                    max={60}
                    step={1}
                  />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="accessibility" className="space-y-6 pt-6">
            <div className="space-y-4 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">High Contrast</p>
                  <p className="text-xs text-muted-foreground">Boost colour separation for readability.</p>
                </div>
                <Switch checked={highContrast} onCheckedChange={value => onChange({ highContrast: value })} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Large Text</p>
                  <p className="text-xs text-muted-foreground">Increase base font size for better readability.</p>
                </div>
                <Switch checked={largeText} onCheckedChange={value => onChange({ largeText: value })} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Reduced Motion</p>
                  <p className="text-xs text-muted-foreground">Minimise animations and transitions.</p>
                </div>
                <Switch checked={reducedMotion} onCheckedChange={value => onChange({ reducedMotion: value })} />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-background px-5 py-5 shadow-sm">
              <Label className="text-sm font-semibold text-foreground">Responsive Preview</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="justify-center">
                  <Monitor className="mr-2 h-4 w-4" />
                  Desktop
                </Button>
                <Button variant="outline" size="sm" className="justify-center">
                  <Tablet className="mr-2 h-4 w-4" />
                  Tablet
                </Button>
                <Button variant="outline" size="sm" className="justify-center">
                  <Smartphone className="mr-2 h-4 w-4" />
                  Mobile
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ScrollArea>

      <div className="flex items-center justify-between border-t border-border bg-muted/10 px-6 py-5">
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

export default SettingsPanel;
