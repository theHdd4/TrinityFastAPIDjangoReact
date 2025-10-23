import React, { RefObject } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { PresentationSettings } from '../../store/exhibitionStore';

const backgroundColorOptions: Array<{
  value: PresentationSettings['backgroundColor'];
  label: string;
  swatchClass: string;
}> = [
  { value: 'default', label: 'Default', swatchClass: 'bg-muted/40' },
  { value: 'ivory', label: 'Ivory', swatchClass: 'bg-amber-100' },
  { value: 'slate', label: 'Soft Slate', swatchClass: 'bg-slate-200' },
  { value: 'charcoal', label: 'Charcoal Mist', swatchClass: 'bg-neutral-300' },
  { value: 'indigo', label: 'Indigo Haze', swatchClass: 'bg-indigo-100' },
  { value: 'emerald', label: 'Emerald Veil', swatchClass: 'bg-emerald-100' },
  { value: 'rose', label: 'Rose Quartz', swatchClass: 'bg-rose-100' },
];

const backgroundColorLabels = backgroundColorOptions.reduce<Record<string, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

interface CardFormattingPanelProps {
  settings: PresentationSettings;
  canEdit: boolean;
  onUpdateSettings: (partial: Partial<PresentationSettings>) => void;
  onReset: () => void;
  onAccentImageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  accentImageInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}

export const CardFormattingPanel: React.FC<CardFormattingPanelProps> = ({
  settings,
  canEdit,
  onUpdateSettings,
  onReset,
  onAccentImageChange,
  accentImageInputRef,
  onClose,
}) => {
  const hasAccentImage = Boolean(settings.accentImage);

  return (
    <div className="w-full shrink-0 rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
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
                  onClick={() => onUpdateSettings({ accentImage: null, accentImageName: null })}
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
                onClick={() => accentImageInputRef.current?.click()}
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

          <input
            ref={accentImageInputRef}
            type="file"
            accept="image/*"
            onChange={onAccentImageChange}
            className="hidden"
          />
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Card color</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs capitalize"
                  disabled={!canEdit || hasAccentImage}
                >
                  {settings.cardColor}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background">
                <DropdownMenuItem onClick={() => onUpdateSettings({ cardColor: 'default' })}>Default</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onUpdateSettings({ cardColor: 'blue' })}>Blue</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onUpdateSettings({ cardColor: 'purple' })}>Purple</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onUpdateSettings({ cardColor: 'green' })}>Green</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onUpdateSettings({ cardColor: 'orange' })}>Orange</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Maximize2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Background color</span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!canEdit}
                >
                  {backgroundColorLabels[settings.backgroundColor] ?? 'Default'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background">
                {backgroundColorOptions.map(option => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => onUpdateSettings({ backgroundColor: option.value })}
                  >
                    <span
                      className={cn('mr-2 inline-flex h-3 w-3 rounded-full border border-border/40', option.swatchClass)}
                    />
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
  );
};

export default CardFormattingPanel;
