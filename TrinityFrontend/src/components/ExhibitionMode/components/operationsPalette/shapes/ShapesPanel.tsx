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

const PREVIEW_VARIANTS = [
  {
    frame: 'bg-gradient-to-br from-[#4f46e5] via-[#8b5cf6] to-[#22d3ee]',
    panel: 'bg-gradient-to-br from-[#0f172a]/95 via-[#1e1b4b]/90 to-[#020617]/95',
    shape: 'text-slate-100',
    chip: 'bg-white/10 text-slate-100 group-hover:bg-white/20',
    dot: 'bg-[#a5b4fc]',
  },
  {
    frame: 'bg-gradient-to-br from-[#38bdf8] via-[#22d3ee] to-[#818cf8]',
    panel: 'bg-gradient-to-br from-[#082f49]/95 via-[#0f172a]/90 to-[#111827]/95',
    shape: 'text-slate-50',
    chip: 'bg-white/10 text-slate-50 group-hover:bg-white/20',
    dot: 'bg-[#38bdf8]',
  },
  {
    frame: 'bg-gradient-to-br from-[#fb7185] via-[#f97316] to-[#fde047]',
    panel: 'bg-gradient-to-br from-[#1f172a]/95 via-[#2e1065]/90 to-[#111827]/95',
    shape: 'text-slate-100',
    chip: 'bg-white/10 text-slate-100 group-hover:bg-white/20',
    dot: 'bg-[#fb7185]',
  },
  {
    frame: 'bg-gradient-to-br from-[#f472b6] via-[#c084fc] to-[#60a5fa]',
    panel: 'bg-gradient-to-br from-[#201C3A]/95 via-[#312e81]/90 to-[#0f172a]/95',
    shape: 'text-slate-100',
    chip: 'bg-white/10 text-slate-100 group-hover:bg-white/20',
    dot: 'bg-[#c084fc]',
  },
] as const;

const baseLabelClasses =
  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors';

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
                      {displayShapes.map((shape, index) => {
                        const variant = PREVIEW_VARIANTS[index % PREVIEW_VARIANTS.length];

                        return (
                          <button
                            key={shape.id}
                            type="button"
                            onClick={() => onSelectShape(shape)}
                            className={cn(
                            'group relative flex flex-col items-center gap-3 rounded-3xl border border-border/40 bg-background/80 p-3 transition-all hover:-translate-y-0.5 hover:border-transparent hover:shadow-[0_18px_40px_-18px_rgba(59,130,246,0.75)]',
                            !canEdit && 'cursor-not-allowed opacity-60'
                          )}
                          disabled={!canEdit}
                          aria-label={`Add ${shape.label}`}
                        >
                          <div
                            className={cn(
                              'relative flex h-16 w-full items-center justify-center rounded-2xl p-[1.5px]',
                              variant.frame
                            )}
                          >
                            <div
                              className={cn(
                                'relative flex h-full w-full items-center justify-center rounded-[18px] shadow-[0_12px_30px_-18px_rgba(15,23,42,0.65)]',
                                'bg-gradient-to-br',
                                variant.panel
                              )}
                            >
                              <ShapeRenderer
                                definition={shape}
                                className={cn(
                                  'h-14 w-14 drop-shadow-[0_12px_24px_rgba(15,23,42,0.55)] transition-transform duration-200 group-hover:scale-[1.04]',
                                  variant.shape
                                )}
                              />
                              <span className="pointer-events-none absolute inset-0 rounded-[18px] bg-white/5 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                            </div>
                          </div>
                          <span className={cn(baseLabelClasses, variant.chip)}>
                            <span className={cn('h-2 w-2 rounded-full', variant.dot)} />
                            <span className="leading-tight">{shape.label}</span>
                          </span>
                        </button>
                        );
                      })}
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
