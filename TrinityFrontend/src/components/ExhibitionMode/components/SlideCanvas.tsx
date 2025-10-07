import React, { useState } from 'react';
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

interface DroppedAtom {
  id: string;
  atomId: string;
  title: string;
  category: string;
  color: string;
}

interface LayoutCard {
  id: string;
  atoms: DroppedAtom[];
  isExhibited: boolean;
  moleculeId?: string;
  moleculeTitle?: string;
}

interface SlideCanvasProps {
  card: LayoutCard;
  slideNumber: number;
  totalSlides: number;
  onDrop: (atom: DroppedAtom, sourceCardId: string) => void;
  draggedAtom?: { atom: DroppedAtom; cardId: string } | null;
  canEdit?: boolean;
}

type CardColor = 'default' | 'blue' | 'purple' | 'green' | 'orange';
type CardWidth = 'M' | 'L';
type ContentAlignment = 'top' | 'center' | 'bottom';
type CardLayout = 'blank' | 'horizontal-split' | 'vertical-split' | 'content-right' | 'full';

export const SlideCanvas: React.FC<SlideCanvasProps> = ({
  card,
  slideNumber,
  totalSlides,
  onDrop,
  draggedAtom,
  canEdit = true,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [cardColor, setCardColor] = useState<CardColor>('default');
  const [fullBleed, setFullBleed] = useState(false);
  const [contentAlignment, setContentAlignment] = useState<ContentAlignment>('top');
  const [cardWidth, setCardWidth] = useState<CardWidth>('L');
  const [showFormatPanel, setShowFormatPanel] = useState(false);
  const [cardLayout, setCardLayout] = useState<CardLayout>('content-right');

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit || !draggedAtom) {
      return;
    }
    e.preventDefault();
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
          cardWidth === 'M' ? 'max-w-4xl' : 'max-w-6xl'
        )}
      >
        <div
          className={cn(
            'bg-card shadow-2xl transition-all duration-300 relative',
            fullBleed ? 'rounded-none' : 'rounded-2xl border-2 border-border',
            isDragOver && canEdit && draggedAtom ? 'scale-[0.98] ring-4 ring-primary/20' : undefined,
            !canEdit && 'opacity-90'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
            <Button
              size="icon"
              variant="secondary"
              className="w-8 h-8 bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg"
              onClick={() => setShowFormatPanel(!showFormatPanel)}
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg"
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
                      variant={cardLayout === 'blank' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => setCardLayout('blank')}
                    >
                      <div className="w-6 h-6 border-2 border-current rounded" />
                    </Button>
                    <Button
                      size="icon"
                      variant={cardLayout === 'horizontal-split' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => setCardLayout('horizontal-split')}
                    >
                      <div className="flex flex-col gap-0.5 w-6 h-6">
                        <div className="h-2 border-2 border-current rounded-sm" />
                        <div className="h-3 border-2 border-current rounded-sm bg-current/20" />
                      </div>
                    </Button>
                    <Button
                      size="icon"
                      variant={cardLayout === 'vertical-split' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => setCardLayout('vertical-split')}
                    >
                      <div className="flex gap-0.5 w-6 h-6">
                        <div className="w-2 border-2 border-current rounded-sm" />
                        <div className="w-3 border-2 border-current rounded-sm bg-current/20" />
                      </div>
                    </Button>
                    <Button
                      size="icon"
                      variant={cardLayout === 'content-right' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => setCardLayout('content-right')}
                    >
                      <div className="flex gap-0.5 w-6 h-6">
                        <div className="w-2 border-2 border-current rounded-sm" />
                        <div className="flex-1 border-2 border-current rounded-sm bg-current/20" />
                      </div>
                    </Button>
                    <Button
                      size="icon"
                      variant={cardLayout === 'full' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => setCardLayout('full')}
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
                      <Button size="sm" variant="outline" className="h-7 text-xs capitalize">
                        {cardColor}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-background">
                      <DropdownMenuItem onClick={() => setCardColor('default')}>Default</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setCardColor('blue')}>Blue</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setCardColor('purple')}>Purple</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setCardColor('green')}>Green</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setCardColor('orange')}>Orange</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layout className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Full-bleed card</span>
                  </div>
                  <Switch checked={fullBleed} onCheckedChange={setFullBleed} />
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
                      variant={contentAlignment === 'top' ? 'default' : 'outline'}
                      className="h-7 w-7"
                      onClick={() => setContentAlignment('top')}
                    >
                      <AlignLeft className="w-3 h-3 rotate-90" />
                    </Button>
                    <Button
                      size="icon"
                      variant={contentAlignment === 'center' ? 'default' : 'outline'}
                      className="h-7 w-7"
                      onClick={() => setContentAlignment('center')}
                    >
                      <AlignCenter className="w-3 h-3 rotate-90" />
                    </Button>
                    <Button
                      size="icon"
                      variant={contentAlignment === 'bottom' ? 'default' : 'outline'}
                      className="h-7 w-7"
                      onClick={() => setContentAlignment('bottom')}
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
                      variant={cardWidth === 'M' ? 'default' : 'outline'}
                      className="h-7 px-3 text-xs"
                      onClick={() => setCardWidth('M')}
                    >
                      M
                    </Button>
                    <Button
                      size="sm"
                      variant={cardWidth === 'L' ? 'default' : 'outline'}
                      className="h-7 px-3 text-xs"
                      onClick={() => setCardWidth('L')}
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
                  onClick={() => {
                    setCardColor('default');
                    setFullBleed(false);
                    setContentAlignment('top');
                    setCardWidth('L');
                    setCardLayout('content-right');
                  }}
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
              cardColorClasses[cardColor],
              fullBleed ? 'rounded-none' : 'rounded-t-2xl'
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-transparent to-black/20 backdrop-blur-sm" />
            {card.atoms.length > 0 && (
              <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium">
                {card.atoms.length} {card.atoms.length === 1 ? 'Component' : 'Components'}
              </div>
            )}
          </div>

          <div
            className={cn(
              'p-8 flex flex-col',
              alignmentClasses[contentAlignment],
              'min-h-[300px]'
            )}
          >
            <h1 className="text-4xl font-bold text-foreground mb-4">{getSlideTitle()}</h1>

            <p className="text-muted-foreground mb-6 leading-relaxed max-w-3xl">
              {getSlideDescription()}
            </p>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
          </div>

          {card.atoms.length > 0 && (
            <div className="px-8 pb-8">
              <div className="bg-muted/30 rounded-xl border border-border p-6">
                <h2 className="text-2xl font-bold text-foreground mb-6">Components Overview</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {card.atoms.map(atom => (
                    <div
                      key={atom.id}
                      className="group p-6 border-2 border-border bg-card rounded-xl hover:shadow-lg hover:border-primary/50 transition-all duration-300"
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
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
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
