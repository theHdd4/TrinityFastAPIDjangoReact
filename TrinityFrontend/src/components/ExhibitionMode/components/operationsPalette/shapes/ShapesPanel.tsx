import React, { useMemo, useState } from 'react';
import { Search, Shapes, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SHAPE_CATEGORIES,
  SHAPE_DEFINITIONS,
  matchesShapeQuery,
  type ShapeDefinition,
} from './constants';
import { ShapeRenderer } from './ShapeRenderer';
import { cn } from '@/lib/utils';

interface ShapesPanelProps {
  onSelectShape: (shape: ShapeDefinition) => void;
  onClose: () => void;
  canEdit?: boolean;
}

const CATEGORY_COLOR_MAP: Record<string, string> = {
  lines: 'text-sky-500',
  basic: 'text-blue-500',
  polygons: 'text-indigo-500',
  stars: 'text-yellow-500',
  arrows: 'text-emerald-500',
  flowchart: 'text-purple-500',
  bubbles: 'text-pink-500',
  clouds: 'text-orange-500',
};

export const ShapesPanel: React.FC<ShapesPanelProps> = ({ onSelectShape, onClose, canEdit = true }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const filteredCategories = useMemo(() => {
    const normalisedQuery = searchQuery.trim();

    return SHAPE_CATEGORIES.map(category => ({
      ...category,
      shapes: SHAPE_DEFINITIONS.filter(
        shape => shape.categoryId === category.id && matchesShapeQuery(shape, normalisedQuery),
      ),
    })).filter(category => category.shapes.length > 0);
  }, [searchQuery]);

  return (
    <div className="w-full shrink-0 rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-purple-500 text-white shadow-lg">
              <Shapes className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">Shape Library</h3>
              <p className="text-xs text-muted-foreground">Add polished visuals to your slide.</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="Close shapes panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b border-border/60 px-5 py-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search shapes..."
              className="pl-9"
              type="search"
              aria-label="Search shapes"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-5 py-6 pr-3">
          {filteredCategories.length > 0 ? (
            <div className="space-y-8">
              {filteredCategories.map(category => (
                <section key={category.id} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-xs font-semibold uppercase tracking-wide text-muted-foreground/80',
                        CATEGORY_COLOR_MAP[category.id] ?? 'text-muted-foreground',
                      )}
                    >
                      ●
                    </span>
                    <h4 className="text-sm font-semibold text-foreground">{category.label}</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {category.shapes.map(shape => (
                      <button
                        key={shape.id}
                        type="button"
                        onClick={() => onSelectShape(shape)}
                        className={cn(
                          'group relative flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 transition-all duration-300 hover:border-primary hover:bg-primary/5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                          !canEdit && 'cursor-not-allowed opacity-60 hover:border-border/60 hover:bg-card/40 hover:shadow-none',
                        )}
                        disabled={!canEdit}
                        aria-label={`Add ${shape.label}`}
                      >
                        <div className="flex h-20 w-full items-center justify-center rounded-xl bg-background">
                          <ShapeRenderer
                            definition={shape}
                            fill="currentColor"
                            className="h-16 w-16 text-foreground transition-colors duration-300 group-hover:text-yellow-400"
                          />
                        </div>
                        <span className="text-xs font-semibold leading-tight text-foreground/80 group-hover:text-foreground">
                          {shape.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
              <Shapes className="h-12 w-12 opacity-40" />
              <p className="text-sm font-semibold">No shapes found</p>
              <p className="text-xs">Try a different search term.</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

export default ShapesPanel;
