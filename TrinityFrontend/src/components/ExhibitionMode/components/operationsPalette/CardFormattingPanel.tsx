import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Image as ImageIcon,
  Layout,
  Maximize2,
  Palette,
  Plus,
  RotateCcw,
  Settings,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ImagePanel, type ImageSelectionRequest } from '../Images';
import {
  ColorTray,
  DEFAULT_GRADIENT_COLOR_OPTIONS,
  DEFAULT_SOLID_COLOR_OPTIONS,
  DEFAULT_SOLID_SECTION,
  DEFAULT_GRADIENT_SECTION,
  GRADIENT_STYLE_MAP,
  isKnownGradientId,
  isSolidToken,
  createSolidToken,
  solidTokenToHex,
} from '@/templates/color-tray';
import type { ColorTrayOption, ColorTraySection } from '@/templates/color-tray';
import type { PresentationSettings } from '../../store/exhibitionStore';
import { cn } from '@/lib/utils';

const BACKGROUND_PRESET_GROUP_ID = 'preset-backgrounds';
const BACKGROUND_PRESET_GROUP_LABEL = 'Presets';

const backgroundPresetOptions: readonly ColorTrayOption[] = (
  [
    {
      id: 'default',
      label: 'Default',
      tooltip: 'Default (system color)',
      swatchClassName: 'bg-card',
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
})) as readonly ColorTrayOption[];

const backgroundGradientOptions = DEFAULT_GRADIENT_COLOR_OPTIONS.filter(option =>
  option.id.startsWith('gradient-'),
) as readonly ColorTrayOption[];

const layoutColorSections: readonly ColorTraySection[] = [
  {
    id: DEFAULT_GRADIENT_SECTION.id,
    label: DEFAULT_GRADIENT_SECTION.label,
    options: DEFAULT_GRADIENT_COLOR_OPTIONS,
  },
  {
    id: DEFAULT_SOLID_SECTION.id,
    label: DEFAULT_SOLID_SECTION.label,
    options: DEFAULT_SOLID_COLOR_OPTIONS,
  },
];

const backgroundColorSections: readonly ColorTraySection[] = [
  {
    id: 'solids',
    label: 'Solid colors',
    options: [...backgroundPresetOptions, ...DEFAULT_SOLID_COLOR_OPTIONS] as readonly ColorTrayOption[],
  },
  {
    id: 'gradients',
    label: 'Gradients',
    options: backgroundGradientOptions,
  },
];

interface CardFormattingPanelProps {
  settings: PresentationSettings;
  canEdit: boolean;
  onUpdateSettings: (partial: Partial<PresentationSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

export const CardFormattingPanel: React.FC<CardFormattingPanelProps> = ({
  settings,
  canEdit,
  onUpdateSettings,
  onReset,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [layoutPopoverOpen, setLayoutPopoverOpen] = useState(false);
  const [backgroundPopoverOpen, setBackgroundPopoverOpen] = useState(false);
  const layoutTriggerRef = useRef<HTMLButtonElement | null>(null);
  const backgroundTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hasAccentImage = Boolean(settings.accentImage);
  const [isAccentLibraryOpen, setIsAccentLibraryOpen] = useState(false);

  const getSelectedOption = (sections: readonly ColorTraySection[], id: string | null | undefined) => {
    if (!id) {
      return undefined;
    }
    for (const section of sections) {
      const option = section.options.find(candidate => candidate.id === id);
      if (option) {
        return option;
      }
    }
    return undefined;
  };

  const resolveSwatchStyle = (id: string | null | undefined, option?: ColorTrayOption) => {
    if (!id) {
      return {};
    }
    if (option?.swatchStyle) {
      return option.swatchStyle;
    }
    if (isSolidToken(id)) {
      return { backgroundColor: solidTokenToHex(id) };
    }
    if (isKnownGradientId(id)) {
      return { backgroundImage: GRADIENT_STYLE_MAP[id] };
    }
    return {};
  };

  const layoutColorOption = getSelectedOption(layoutColorSections, settings.cardColor);
  const layoutSwatchStyle = resolveSwatchStyle(settings.cardColor, layoutColorOption);
  const layoutCustomHex = useMemo(() => {
    if (isSolidToken(settings.cardColor)) {
      return solidTokenToHex(settings.cardColor);
    }
    return '#111827';
  }, [settings.cardColor]);
  const layoutColorLabel = useMemo(() => {
    if (layoutColorOption?.label) {
      return layoutColorOption.label;
    }
    if (isSolidToken(settings.cardColor)) {
      return solidTokenToHex(settings.cardColor).toUpperCase();
    }
    return undefined;
  }, [layoutColorOption, settings.cardColor]);

  const handleAccentDialogOpen = useCallback(() => {
    if (!canEdit) {
      return;
    }
    setIsAccentLibraryOpen(true);
  }, [canEdit]);

  const handleAccentDialogClose = useCallback(() => {
    setIsAccentLibraryOpen(false);
  }, []);

  const handleAccentImageRemove = useCallback(() => {
    onUpdateSettings({ accentImage: null, accentImageName: null });
  }, [onUpdateSettings]);

  const handleAccentImageSelect = useCallback(
    (selections: ImageSelectionRequest[]) => {
      const [first] = selections;
      if (!first) {
        return;
      }

      const title = first.metadata?.title;
      const fallbackName = first.metadata?.source === 'upload' ? 'Uploaded image' : 'Selected image';

      onUpdateSettings({
        accentImage: first.imageUrl,
        accentImageName: title ?? fallbackName,
      });
      handleAccentDialogClose();
    },
    [handleAccentDialogClose, onUpdateSettings],
  );

  const backgroundColorOption = getSelectedOption(backgroundColorSections, settings.backgroundColor);
  const backgroundSwatchStyle = resolveSwatchStyle(settings.backgroundColor, backgroundColorOption);
  const backgroundCustomHex = useMemo(() => {
    if (isSolidToken(settings.backgroundColor)) {
      return solidTokenToHex(settings.backgroundColor);
    }
    return '#111827';
  }, [settings.backgroundColor]);
  const backgroundColorLabel = useMemo(() => {
    if (backgroundColorOption?.label) {
      return backgroundColorOption.label;
    }
    if (isSolidToken(settings.backgroundColor)) {
      return solidTokenToHex(settings.backgroundColor).toUpperCase();
    }
    return undefined;
  }, [backgroundColorOption, settings.backgroundColor]);

  useEffect(() => {
    if ((!canEdit || hasAccentImage) && layoutPopoverOpen) {
      setLayoutPopoverOpen(false);
    }
  }, [canEdit, hasAccentImage, layoutPopoverOpen]);

  useEffect(() => {
    if (!canEdit && backgroundPopoverOpen) {
      setBackgroundPopoverOpen(false);
    }
  }, [canEdit, backgroundPopoverOpen]);

  const handleCustomLayoutColor = useCallback(
    (hex: string) => {
      const token = createSolidToken(hex);
      onUpdateSettings({ cardColor: token as PresentationSettings['cardColor'] });
    },
    [onUpdateSettings],
  );

  const applyBackgroundPresetColor = useCallback(
    (color: PresentationSettings['backgroundColor']) => {
      onUpdateSettings({
        backgroundMode: 'preset',
        backgroundColor: color,
      });
    },
    [onUpdateSettings],
  );

  const handleCustomBackgroundColor = useCallback(
    (hex: string) => {
      const token = createSolidToken(hex);
      applyBackgroundPresetColor(token as PresentationSettings['backgroundColor']);
    },
    [applyBackgroundPresetColor],
  );

  return (
    <>
      <ImagePanel
        fullscreenOnly
        fullscreenOpen={isAccentLibraryOpen}
        onFullscreenOpenChange={setIsAccentLibraryOpen}
        currentImage={settings.accentImage}
        currentImageName={settings.accentImageName}
        onClose={handleAccentDialogClose}
        onImageSelect={handleAccentImageSelect}
        onRemoveImage={handleAccentImageRemove}
        canEdit={canEdit}
        insertButtonLabel="Use accent image"
        fullscreenTitle="Choose accent image"
        fullscreenDescription="Select an image to feature alongside your card content."
        allowMultipleUploadSelection={false}
      />

      <div
      ref={panelRef}
      className="w-full shrink-0 rounded-3xl border border-border/70 bg-background/95 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Card formatting</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-5 px-5 py-5">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Layout</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              size="icon"
              variant={settings.cardLayout === 'none' ? 'default' : 'outline'}
              className="h-12 w-12 rounded-lg"
              onClick={() => onUpdateSettings({ cardLayout: 'none' })}
              type="button"
              disabled={!canEdit}
            >
              <span className="sr-only">No layout</span>
              <div className="flex h-6 w-6 items-center justify-center rounded border-2 border-current">
                <div className="h-2 w-2 rounded-full bg-current/20" />
              </div>
            </Button>
            <Button
              size="icon"
              variant={settings.cardLayout === 'top' ? 'default' : 'outline'}
              className="h-12 w-12 rounded-lg"
              onClick={() => onUpdateSettings({ cardLayout: 'top' })}
              type="button"
              disabled={!canEdit}
            >
              <span className="sr-only">Top layout</span>
              <div className="flex h-6 w-6 flex-col">
                <div className="h-2 rounded-t border-2 border-current bg-current/20" />
                <div className="flex-1 rounded-b border-2 border-current" />
              </div>
            </Button>
            <Button
              size="icon"
              variant={settings.cardLayout === 'bottom' ? 'default' : 'outline'}
              className="h-12 w-12 rounded-lg"
              onClick={() => onUpdateSettings({ cardLayout: 'bottom' })}
              type="button"
              disabled={!canEdit}
            >
              <span className="sr-only">Bottom layout</span>
              <div className="flex h-6 w-6 flex-col">
                <div className="flex-1 rounded-t border-2 border-current" />
                <div className="h-2 rounded-b border-2 border-current bg-current/20" />
              </div>
            </Button>
            <Button
              size="icon"
              variant={settings.cardLayout === 'right' ? 'default' : 'outline'}
              className="h-12 w-12 rounded-lg"
              onClick={() => onUpdateSettings({ cardLayout: 'right' })}
              type="button"
              disabled={!canEdit}
            >
              <span className="sr-only">Right layout</span>
              <div className="flex h-6 w-6">
                <div className="flex-1 rounded-l border-2 border-current" />
                <div className="w-2 rounded-r border-2 border-current bg-current/20" />
              </div>
            </Button>
            <Button
              size="icon"
              variant={settings.cardLayout === 'left' ? 'default' : 'outline'}
              className="h-12 w-12 rounded-lg"
              onClick={() => onUpdateSettings({ cardLayout: 'left' })}
              type="button"
              disabled={!canEdit}
            >
              <span className="sr-only">Left layout</span>
              <div className="flex h-6 w-6">
                <div className="w-2 rounded-l border-2 border-current bg-current/20" />
                <div className="flex-1 rounded-r border-2 border-current" />
              </div>
            </Button>
            <Button
              size="icon"
              variant={settings.cardLayout === 'full' ? 'default' : 'outline'}
              className="h-12 w-12 rounded-lg"
              onClick={() => onUpdateSettings({ cardLayout: 'full' })}
              type="button"
              disabled={!canEdit}
            >
              <span className="sr-only">Entire background layout</span>
              <div className="h-6 w-6 rounded border-2 border-current bg-current/20" />
            </Button>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Accent image</span>
            </div>
            <div className="flex items-center gap-2">
              {hasAccentImage && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive"
                  onClick={handleAccentImageRemove}
                  disabled={!canEdit}
                  type="button"
                >
                  Remove
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-primary"
                onClick={handleAccentDialogOpen}
                disabled={!canEdit}
                type="button"
              >
                {hasAccentImage ? 'Change' : 'Upload'}
              </Button>
            </div>
          </div>

          {hasAccentImage && (
            <div className="space-y-2">
              <div className="relative h-24 overflow-hidden rounded-lg border border-border">
                <img src={settings.accentImage ?? undefined} alt="Accent" className="h-full w-full object-cover" />
                {settings.accentImageName && (
                  <div className="absolute bottom-0 left-0 right-0 bg-background/90 px-2 py-1 text-[11px] truncate">
                    {settings.accentImageName}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Accent images replace the card color for this slide layout.
              </p>
            </div>
          )}
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Layout color</span>
            </div>
            <div className="flex items-center gap-3">
              {layoutColorLabel && (
                <span className="text-xs font-medium text-muted-foreground">{layoutColorLabel}</span>
              )}
              <Popover open={layoutPopoverOpen} onOpenChange={setLayoutPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 p-0"
                    disabled={!canEdit || hasAccentImage}
                    ref={layoutTriggerRef}
                  >
                    <span
                      className={cn(
                        'h-5 w-5 rounded-full border border-white/70 shadow-inner',
                        layoutColorOption?.swatchClassName,
                      )}
                      style={layoutSwatchStyle}
                    />
                    <span className="sr-only">Select layout color</span>
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
                      sections={layoutColorSections}
                      selectedId={settings.cardColor}
                      onSelect={option =>
                        onUpdateSettings({ cardColor: option.id as PresentationSettings['cardColor'] })
                      }
                      disabled={!canEdit || hasAccentImage}
                      defaultSectionId="gradients"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={layoutCustomHex}
                        onChange={event => handleCustomLayoutColor(event.target.value)}
                        className="h-11 w-full cursor-pointer rounded-2xl border border-border"
                        disabled={!canEdit || hasAccentImage}
                      />
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Custom</span>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Maximize2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Background (Card Color)</span>
            </div>
            <div className="flex items-center gap-3">
              {backgroundColorLabel && (
                <span className="text-xs font-medium text-muted-foreground">{backgroundColorLabel}</span>
              )}
              <Popover open={backgroundPopoverOpen} onOpenChange={setBackgroundPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 p-0"
                    disabled={!canEdit}
                    ref={backgroundTriggerRef}
                  >
                    <span
                      className={cn(
                        'h-5 w-5 rounded-full border border-white/70 shadow-inner',
                        backgroundColorOption?.swatchClassName,
                      )}
                      style={backgroundSwatchStyle}
                    />
                    <span className="sr-only">Select background color</span>
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
                      selectedId={settings.backgroundColor}
                      onSelect={option =>
                        applyBackgroundPresetColor(
                          option.id as PresentationSettings['backgroundColor'],
                        )
                      }
                      disabled={!canEdit}
                      defaultSectionId="solids"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={backgroundCustomHex}
                        onChange={event => handleCustomBackgroundColor(event.target.value)}
                        className="h-11 w-full cursor-pointer rounded-2xl border border-border"
                        disabled={!canEdit}
                      />
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Custom</span>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layout className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Full-bleed card</span>
            </div>
            <Switch
              checked={settings.fullBleed}
              onCheckedChange={value => onUpdateSettings({ fullBleed: value })}
              disabled={!canEdit}
            />
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlignCenter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Content alignment</span>
            </div>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant={settings.contentAlignment === 'top' ? 'default' : 'outline'}
                className="h-7 w-7"
                onClick={() => onUpdateSettings({ contentAlignment: 'top' })}
                disabled={!canEdit}
                type="button"
              >
                <AlignLeft className="h-3 w-3 rotate-90" />
              </Button>
              <Button
                size="icon"
                variant={settings.contentAlignment === 'center' ? 'default' : 'outline'}
                className="h-7 w-7"
                onClick={() => onUpdateSettings({ contentAlignment: 'center' })}
                disabled={!canEdit}
                type="button"
              >
                <AlignCenter className="h-3 w-3 rotate-90" />
              </Button>
              <Button
                size="icon"
                variant={settings.contentAlignment === 'bottom' ? 'default' : 'outline'}
                className="h-7 w-7"
                onClick={() => onUpdateSettings({ contentAlignment: 'bottom' })}
                disabled={!canEdit}
                type="button"
              >
                <AlignRight className="h-3 w-3 rotate-90" />
              </Button>
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Maximize2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Card width</span>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={settings.cardWidth === 'M' ? 'default' : 'outline'}
                className="h-7 px-3 text-xs"
                onClick={() => onUpdateSettings({ cardWidth: 'M' })}
                disabled={!canEdit}
                type="button"
              >
                M
              </Button>
              <Button
                size="sm"
                variant={settings.cardWidth === 'L' ? 'default' : 'outline'}
                className="h-7 px-3 text-xs"
                onClick={() => onUpdateSettings({ cardWidth: 'L' })}
                disabled={!canEdit}
                type="button"
              >
                L
              </Button>
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Backdrop</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-primary" type="button">
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Card headers & footers</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-primary" type="button">
              Edit
            </Button>
          </div>
        </section>

        <Separator />

        <Button
          variant="outline"
          className="w-full justify-start text-sm"
          onClick={onReset}
          type="button"
          disabled={!canEdit}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset styling
        </Button>
      </div>
    </div>
    </>
  );
};

export default CardFormattingPanel;
