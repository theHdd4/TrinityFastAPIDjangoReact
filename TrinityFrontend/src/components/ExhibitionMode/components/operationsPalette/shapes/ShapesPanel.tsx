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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categoryLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    SHAPE_CATEGORIES.forEach(category => {
      lookup.set(category.id, category.label);
    });
    return lookup;
  }, []);

  const availableCategories = useMemo(
    () =>
      SHAPE_CATEGORIES.map(category => ({
        ...category,
        count: SHAPE_DEFINITIONS.filter(shape => shape.categoryId === category.id).length,
      })).filter(category => category.count > 0),
    [],
  );

  const filteredShapes = useMemo(() => {
    const normalisedQuery = searchQuery.trim();

    return SHAPE_DEFINITIONS.filter(shape => {
      if (selectedCategory && shape.categoryId !== selectedCategory) {
        return false;
      }

      return matchesShapeQuery(shape, normalisedQuery);
    });
  }, [searchQuery, selectedCategory]);

  const handleCategorySelect = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
  };

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

        <div className="space-y-4 border-b border-border/60 px-5 py-5">
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

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={selectedCategory === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleCategorySelect(null)}
              className="rounded-full"
            >
              All Shapes
            </Button>
            {availableCategories.map(category => {
              const isActive = selectedCategory === category.id;
              return (
                <Button
                  key={category.id}
                  type="button"
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleCategorySelect(category.id)}
                  className="rounded-full"
                >
                  <span className={cn('mr-1 text-xs', CATEGORY_COLOR_MAP[category.id] ?? 'text-muted-foreground')}>●</span>
                  {category.label}
                </Button>
              );
            })}
          </div>
        </div>

        <ScrollArea className="flex-1 px-5 py-6 pr-3">
          {filteredShapes.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {filteredShapes.map(shape => {
                const categoryLabel = categoryLookup.get(shape.categoryId);
                return (
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
                        className="h-16 w-16 text-foreground transition-colors duration-300 group-hover:text-primary"
                      />
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-xs font-semibold text-foreground/80 group-hover:text-foreground leading-tight">
                        {shape.label}
                      </span>
                      {categoryLabel && (
                        <span
                          className={cn(
                            'text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground/80',
                            CATEGORY_COLOR_MAP[shape.categoryId] ?? 'text-muted-foreground',
                          )}
                        >
                          {categoryLabel}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
              <Shapes className="h-12 w-12 opacity-40" />
              <p className="text-sm font-semibold">No shapes found</p>
              <p className="text-xs">Try a different search term or category.</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

export default ShapesPanel;
