import React, { useEffect, useMemo, useState } from 'react';
import {
  User,
  Calendar,
  Sparkles,
  Image as ImageIcon,
  Palette,
  Layout,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  RotateCcw,
  Settings,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import TextBoxDisplay from '@/components/AtomList/atoms/text-box/TextBoxDisplay';
import {
  CardLayout,
  CardColor,
  CardWidth,
  ContentAlignment,
  LayoutCard,
  DroppedAtom,
  PresentationSettings,
  DEFAULT_PRESENTATION_SETTINGS,
} from '../store/exhibitionStore';

interface SlideCanvasProps {
  card: LayoutCard;
  slideNumber: number;
  totalSlides: number;
  onDrop: (atom: DroppedAtom, sourceCardId: string) => void;
  draggedAtom?: { atom: DroppedAtom; cardId: string } | null;
  canEdit?: boolean;
  onPresentationChange?: (settings: PresentationSettings) => void;
  onRemoveAtom?: (atomId: string) => void;
}

export const SlideCanvas: React.FC<SlideCanvasProps> = ({
  card,
  slideNumber,
  totalSlides,
  onDrop,
  draggedAtom,
  canEdit = true,
  onPresentationChange,
  onRemoveAtom,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFormatPanel, setShowFormatPanel] = useState(false);
  const [settings, setSettings] = useState<PresentationSettings>(() => ({
    ...DEFAULT_PRESENTATION_SETTINGS,
    ...card.presentationSettings,
  }));

  useEffect(() => {
    setSettings({
      ...DEFAULT_PRESENTATION_SETTINGS,
      ...card.presentationSettings,
    });
  }, [card]);

  useEffect(() => {
    if (!canEdit) {
      setShowFormatPanel(false);
    }
  }, [canEdit]);

  const updateSettings = (partial: Partial<PresentationSettings>) => {
    setSettings(prev => {
      if (!canEdit) {
        return prev;
      }
      const next = { ...prev, ...partial };
      onPresentationChange?.(next);
      return next;
    });
  };

  const resetSettings = () => {
    if (!canEdit) {
      return;
    }
    const defaults = { ...DEFAULT_PRESENTATION_SETTINGS };
    setSettings(defaults);
    onPresentationChange?.(defaults);
  };

  const layoutConfig = useMemo(() => {
    switch (settings.cardLayout) {
      case 'blank':
        return {
          showOverview: false,
          wrapper: '',
          contentClass: '',
          overviewOuterClass: 'hidden',
          gridClass: 'hidden',
        };
      case 'horizontal-split':
        return {
          showOverview: true,
          wrapper: 'lg:flex-row lg:items-stretch lg:divide-x lg:divide-border/60',
          contentClass: 'lg:w-1/2 lg:pr-8',
          overviewOuterClass: 'lg:w-1/2 lg:pl-8',
          gridClass: 'grid-cols-1 md:grid-cols-2',
        };
      case 'vertical-split':
        return {
          showOverview: true,
          wrapper: 'gap-6',
          contentClass: '',
          overviewOuterClass: '',
          gridClass: 'grid-cols-1',
        };
      case 'full':
        return {
          showOverview: true,
          wrapper: 'gap-6',
          contentClass: '',
          overviewOuterClass: '',
          gridClass: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        };
      default:
        return {
          showOverview: true,
          wrapper: 'lg:flex-row lg:items-stretch lg:divide-x lg:divide-border/60',
          contentClass: 'lg:w-2/5 lg:pr-8',
          overviewOuterClass: 'lg:w-3/5 lg:pl-8',
          gridClass: 'grid-cols-1 md:grid-cols-2',
        };
    }
  }, [settings.cardLayout]);

  const showOverview = layoutConfig.showOverview && card.atoms.length > 0;

  const handleAtomRemove = (atomId: string) => {
    if (!canEdit) {
      return;
    }
    onRemoveAtom?.(atomId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit || !draggedAtom) {
      return;
    }
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      /* ignore */
    }
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canEdit || !draggedAtom) {
      return;
    }
    e.preventDefault();
    setIsDragOver(false);
    onDrop(draggedAtom.atom, draggedAtom.cardId);
  };

  const getSlideTitle = () => {
    if (card.moleculeTitle) {
      return card.atoms.length > 0 ? `${card.moleculeTitle}` : card.moleculeTitle;
    }
    return card.atoms.length > 0 ? card.atoms[0].title : 'Untitled Slide';
  };

  const getSlideDescription = () => {
    if (card.atoms.length > 0) {
      return `Explore ${card.atoms.length} ${
        card.atoms.length === 1 ? 'component' : 'components'
      } with our comprehensive analysis and insights. Stay organized and focused on key findings and activities.`;
    }
    return 'Add components from the catalogue to build your presentation slide.';
  };

  const cardColorClasses = {
    default: 'from-purple-500 via-pink-500 to-orange-400',
    blue: 'from-blue-500 via-cyan-500 to-teal-400',
    purple: 'from-violet-500 via-purple-500 to-fuchsia-400',
    green: 'from-emerald-500 via-green-500 to-lime-400',
    orange: 'from-orange-500 via-amber-500 to-yellow-400',
  };

  const alignmentClasses = {
    top: 'justify-start',
    center: 'justify-center',
    bottom: 'justify-end',
  };

  return (
    <div className="flex-1 h-full bg-muted/20 overflow-auto">
      <div
        className={cn(
          'mx-auto transition-all duration-300 p-8',
          settings.cardWidth === 'M' ? 'max-w-4xl' : 'max-w-6xl'
        )}
      >
        <div
          className={cn(
            'bg-card shadow-2xl transition-all duration-300 relative',
            settings.fullBleed ? 'rounded-none' : 'rounded-2xl border-2 border-border',
            isDragOver && canEdit && draggedAtom ? 'scale-[0.98] ring-4 ring-primary/20' : undefined,
            !canEdit && 'opacity-90'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragOver && canEdit && draggedAtom && (
            <div
              className={cn(
                'absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary/60 bg-primary/10 text-primary font-semibold uppercase tracking-wide pointer-events-none',
                settings.fullBleed ? 'rounded-none' : 'rounded-2xl'
              )}
            >
              Drop to add component
            </div>
          )}
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
            <Button
              size="icon"
              variant="secondary"
              className="w-8 h-8 bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg"
              onClick={() => setShowFormatPanel(!showFormatPanel)}
              disabled={!canEdit}
              type="button"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg"
              type="button"
              disabled={!canEdit}
            >
              <Sparkles className="w-4 h-4" />
            </Button>
          </div>

          {showFormatPanel && (
            <div className="absolute top-14 right-3 w-80 bg-background border-2 border-border rounded-xl shadow-2xl z-20 p-4">
              <h3 className="text-sm font-semibold mb-4">Card Formatting</h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Layout</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant={settings.cardLayout === 'blank' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => updateSettings({ cardLayout: 'blank' })}
                      type="button"
                      disabled={!canEdit}
                    >
                      <div className="w-6 h-6 border-2 border-current rounded" />
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.cardLayout === 'horizontal-split' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => updateSettings({ cardLayout: 'horizontal-split' })}
                      type="button"
                      disabled={!canEdit}
                    >
                      <div className="flex flex-col gap-0.5 w-6 h-6">
                        <div className="h-2 border-2 border-current rounded-sm" />
                        <div className="h-3 border-2 border-current rounded-sm bg-current/20" />
                      </div>
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.cardLayout === 'vertical-split' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => updateSettings({ cardLayout: 'vertical-split' })}
                      type="button"
                      disabled={!canEdit}
                    >
                      <div className="flex gap-0.5 w-6 h-6">
                        <div className="w-2 border-2 border-current rounded-sm" />
                        <div className="w-3 border-2 border-current rounded-sm bg-current/20" />
                      </div>
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.cardLayout === 'content-right' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => updateSettings({ cardLayout: 'content-right' })}
                      type="button"
                      disabled={!canEdit}
                    >
                      <div className="flex gap-0.5 w-6 h-6">
                        <div className="w-2 border-2 border-current rounded-sm" />
                        <div className="flex-1 border-2 border-current rounded-sm bg-current/20" />
                      </div>
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.cardLayout === 'full' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => updateSettings({ cardLayout: 'full' })}
                      type="button"
                      disabled={!canEdit}
                    >
                      <div className="w-6 h-6 border-2 border-current rounded bg-current/20" />
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Accent image</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-primary">
                    Edit
                  </Button>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Card color</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs capitalize"
                        disabled={!canEdit}
                      >
                        {settings.cardColor}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-background">
                      <DropdownMenuItem onClick={() => updateSettings({ cardColor: 'default' })}>Default</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateSettings({ cardColor: 'blue' })}>Blue</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateSettings({ cardColor: 'purple' })}>Purple</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateSettings({ cardColor: 'green' })}>Green</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateSettings({ cardColor: 'orange' })}>Orange</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layout className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Full-bleed card</span>
                  </div>
                  <Switch
                    checked={settings.fullBleed}
                    onCheckedChange={value => updateSettings({ fullBleed: value })}
                    disabled={!canEdit}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlignCenter className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Content alignment</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant={settings.contentAlignment === 'top' ? 'default' : 'outline'}
                      className="h-7 w-7"
                      onClick={() => updateSettings({ contentAlignment: 'top' })}
                      disabled={!canEdit}
                    >
                      <AlignLeft className="w-3 h-3 rotate-90" />
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.contentAlignment === 'center' ? 'default' : 'outline'}
                      className="h-7 w-7"
                      onClick={() => updateSettings({ contentAlignment: 'center' })}
                      disabled={!canEdit}
                    >
                      <AlignCenter className="w-3 h-3 rotate-90" />
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.contentAlignment === 'bottom' ? 'default' : 'outline'}
                      className="h-7 w-7"
                      onClick={() => updateSettings({ contentAlignment: 'bottom' })}
                      disabled={!canEdit}
                    >
                      <AlignRight className="w-3 h-3 rotate-90" />
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Maximize2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Card width</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={settings.cardWidth === 'M' ? 'default' : 'outline'}
                      className="h-7 px-3 text-xs"
                      onClick={() => updateSettings({ cardWidth: 'M' })}
                      disabled={!canEdit}
                    >
                      M
                    </Button>
                    <Button
                      size="sm"
                      variant={settings.cardWidth === 'L' ? 'default' : 'outline'}
                      className="h-7 px-3 text-xs"
                      onClick={() => updateSettings({ cardWidth: 'L' })}
                      disabled={!canEdit}
                    >
                      L
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <span className="text-sm">Backdrop</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-primary">
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <span className="text-sm">Card headers & footers</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-primary">
                    Edit
                  </Button>
                </div>

                <Separator />

                <Button
                  variant="outline"
                  className="w-full justify-start text-sm"
                  onClick={resetSettings}
                  type="button"
                  disabled={!canEdit}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset styling
                </Button>
              </div>
            </div>
          )}

          <div
            className={cn(
              'relative h-64 overflow-hidden bg-gradient-to-br',
              cardColorClasses[settings.cardColor],
              settings.fullBleed ? 'rounded-none' : 'rounded-t-2xl'
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-transparent to-black/20 backdrop-blur-sm" />
            {card.atoms.length > 0 && (
              <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium">
                {card.atoms.length} {card.atoms.length === 1 ? 'Component' : 'Components'}
              </div>
            )}
          </div>

          <div className={cn('flex flex-col', layoutConfig.wrapper)}>
            <div
              className={cn(
                'p-8 flex flex-col',
                alignmentClasses[settings.contentAlignment],
                'min-h-[300px]',
                layoutConfig.contentClass
              )}
            >
              <h1 className="text-4xl font-bold text-foreground mb-4">{getSlideTitle()}</h1>

              <p className="text-muted-foreground mb-6 leading-relaxed max-w-3xl">
                {getSlideDescription()}
              </p>

              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <span className="font-medium">Exhibition Presenter</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Last edited recently</span>
                </div>
              </div>

              {card.atoms.length === 0 && canEdit && (
                <div className="mt-6 rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  Drag atoms from the catalogue to start building this slide.
                </div>
              )}
            </div>

            {showOverview && (
              <div className={cn('px-8 pb-8', layoutConfig.overviewOuterClass)}>
                <div className="bg-muted/30 rounded-xl border border-border p-6 h-full">
                  <h2 className="text-2xl font-bold text-foreground mb-6">Components Overview</h2>

                  <div className={cn('grid gap-4', layoutConfig.gridClass)}>
                    {card.atoms.map(atom => (
                      <div
                        key={atom.id}
                        className="relative group p-6 border-2 border-border bg-card rounded-xl hover:shadow-lg hover:border-primary/50 transition-all duration-300"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-3 h-3 ${atom.color} rounded-full flex-shrink-0`} />
                          <h3 className="font-semibold text-foreground text-lg group-hover:text-primary transition-colors">
                            {atom.title}
                          </h3>
                        </div>
                        <div className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full mb-3">
                          {atom.category}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-3">
                          {atom.atomId === 'text-box' ? (
                            <div className="p-3 bg-muted/40 rounded-lg border border-border">
                              <TextBoxDisplay textId={atom.id} />
                            </div>
                          ) : (
                            <p>Component visualization and analysis results</p>
                          )}
                        </div>

                        {canEdit && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-3 right-3 h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleAtomRemove(atom.id)}
                            type="button"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <span className="inline-block px-4 py-2 bg-muted rounded-full text-sm font-medium text-muted-foreground">
            Slide {slideNumber} of {totalSlides}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SlideCanvas;
