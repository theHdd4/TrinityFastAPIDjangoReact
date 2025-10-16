import React, { useMemo, useState } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SHAPE_CATEGORIES,
  SHAPE_DEFINITIONS,
  matchesShapeQuery,
  type ShapeCategory,
  type ShapeDefinition,
} from './constants';
import { ShapeRenderer } from './ShapeRenderer';
import { cn } from '@/lib/utils';

interface ShapesPanelProps {
  onSelectShape: (shape: ShapeDefinition) => void;
  onClose: () => void;
  canEdit?: boolean;
}

interface CategorisedShapes extends ShapeCategory {
  shapes: ShapeDefinition[];
}

export const ShapesPanel: React.FC<ShapesPanelProps> = ({ onSelectShape, onClose, canEdit = true }) => {
  const [query, setQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const categorisedShapes = useMemo<CategorisedShapes[]>(() => {
    const normalisedQuery = query.trim().toLowerCase();

    if (normalisedQuery.length === 0) {
      return SHAPE_CATEGORIES.map(category => ({
        ...category,
        shapes: SHAPE_DEFINITIONS.filter(shape => shape.categoryId === category.id),
      })).filter(category => category.shapes.length > 0);
    }

    const matches = SHAPE_DEFINITIONS.filter(shape => matchesShapeQuery(shape, normalisedQuery));
    return matches.length > 0
      ? [
          {
            id: 'search',
            label: `Results (${matches.length})`,
            shapes: matches,
          },
        ]
      : [];
  }, [query]);

  const handleToggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  const renderCategoryHeader = (category: CategorisedShapes, displayCount: number, totalCount: number) => {
    const isSearchResults = category.id === 'search';
    if (isSearchResults || totalCount <= displayCount) {
      return (
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">{category.label}</h4>
          <span className="text-xs text-muted-foreground">{totalCount} shapes</span>
        </div>
      );
    }

    const isExpanded = expandedCategories[category.id];
    return (
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{category.label}</h4>
        <button
          type="button"
          onClick={() => handleToggleCategory(category.id)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {isExpanded ? 'Show less' : 'See all'}
        </button>
      </div>
    );
  };

  return (
    <div className="w-full shrink-0 rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Shapes</h3>
            <p className="text-xs text-muted-foreground">Add polished visuals to your slide.</p>
          </div>
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

      <div className="space-y-4 px-5 py-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search elements"
            className="pl-9"
            type="search"
            aria-label="Search shapes"
          />
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full justify-center gap-2 border-dashed"
          disabled
        >
          <Sparkles className="h-4 w-4" />
          Generate shapes
        </Button>

        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-6 pb-2">
            {categorisedShapes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                No shapes match your search.
              </div>
            ) : (
              categorisedShapes.map(category => {
                const isSearchResults = category.id === 'search';
                const totalCount = category.shapes.length;
                const limit = isSearchResults || expandedCategories[category.id] ? totalCount : Math.min(totalCount, 8);
                const displayShapes = category.shapes.slice(0, limit);

                return (
                  <section key={category.id} className="space-y-3">
                    {renderCategoryHeader(category, limit, totalCount)}
                    <div className="grid grid-cols-3 gap-3">
                      {displayShapes.map(shape => (
                        <button
                          key={shape.id}
                          type="button"
                          onClick={() => onSelectShape(shape)}
                          className={cn(
                            'group flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-muted/10 p-3 transition hover:border-primary/60 hover:bg-primary/5',
                            !canEdit && 'cursor-not-allowed opacity-60'
                          )}
                          disabled={!canEdit}
                          aria-label={`Add ${shape.label}`}
                        >
                          <div className="flex h-16 w-full items-center justify-center rounded-xl bg-background">
                            <ShapeRenderer definition={shape} className="h-14 w-14 text-foreground" />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground group-hover:text-primary text-center leading-tight">
                            {shape.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default ShapesPanel;
