import React, { useMemo } from 'react';
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
import type {
  PresentationSettings,
  SlideNotesPosition,
} from '@/components/ExhibitionMode/store/exhibitionStore';

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
          <TabsList className="grid w-full grid-cols-4 rounded-full bg-muted/40 p-1">
            <TabsTrigger value="background">Background</TabsTrigger>
            <TabsTrigger value="behavior">Behaviour</TabsTrigger>
            <TabsTrigger value="transitions">Transitions</TabsTrigger>
            <TabsTrigger value="accessibility">Access</TabsTrigger>
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
              <div className="space-y-2">
                <Label className="text-sm font-medium">Colour</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="color"
                    value={settings.backgroundSolidColor ?? '#ffffff'}
                    onChange={event =>
                      onChange({ backgroundMode: 'solid', backgroundSolidColor: event.target.value })
                    }
                    className="h-10 w-20 cursor-pointer"
                  />
                  <Input
                    value={settings.backgroundSolidColor ?? '#ffffff'}
                    onChange={event =>
                      onChange({ backgroundMode: 'solid', backgroundSolidColor: event.target.value })
                    }
                    className="flex-1"
                  />
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
