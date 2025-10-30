import React, { useMemo, useState } from 'react';
import { Search, Sparkles, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TEMPLATE_DEFINITIONS } from './constants';
import type { TemplateDefinition } from './types';

interface TemplatesPanelProps {
  onApplyTemplate: (template: TemplateDefinition) => void;
  onClose: () => void;
  canEdit?: boolean;
}

export const TemplatesPanel: React.FC<TemplatesPanelProps> = ({
  onApplyTemplate,
  onClose,
  canEdit = true,
}) => {
  const [query, setQuery] = useState('');

  const filteredTemplates = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return TEMPLATE_DEFINITIONS;
    }
    const loweredQuery = trimmed.toLowerCase();

    return TEMPLATE_DEFINITIONS.filter(template => {
      const searchableFields = [
        template.name,
        template.description,
        template.category,
        ...template.tags,
      ]
        .join(' ')
        .toLowerCase();

      return searchableFields.includes(loweredQuery);
    });
  }, [query]);

  return (
    <div className="w-full shrink-0 rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 via-violet-500 to-indigo-500 text-white shadow-lg">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">Presentation Templates</h3>
              <p className="text-xs text-muted-foreground">Kick-start slides for every Trinity use case.</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="Close templates panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b border-border/60 px-5 py-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search templates..."
              className="pl-9"
              type="search"
              aria-label="Search templates"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-5 py-6 pr-3">
          {filteredTemplates.length > 0 ? (
            <div className="space-y-5">
              {filteredTemplates.map(template => {
                const slides = template.slides.length;
                const Icon = template.icon;
                return (
                  <article
                    key={template.id}
                    className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 transition-all duration-300 hover:border-primary hover:bg-primary/5 hover:shadow-xl"
                  >
                    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/10 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
                    <div className="relative grid gap-4 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/80 to-primary text-primary-foreground shadow-lg">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                              {template.name}
                            </h4>
                            <p className="text-xs uppercase tracking-wider text-muted-foreground">{template.category}</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                          {slides} {slides === 1 ? 'slide' : 'slides'}
                        </Badge>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">{template.description}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {template.tags.map(tag => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="border-border/50 text-[0.65rem] font-medium uppercase tracking-wide"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center justify-end">
                        <Button
                          type="button"
                          size="sm"
                          className={cn(
                            'group/button inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground shadow-md transition-all duration-300',
                            'hover:shadow-lg hover:shadow-primary/30',
                            !canEdit && 'opacity-60 hover:shadow-none',
                          )}
                          disabled={!canEdit}
                          onClick={() => onApplyTemplate(template)}
                        >
                          Use template
                          <ChevronRight className="h-4 w-4 transition-transform group-hover/button:translate-x-0.5" />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
              <Sparkles className="h-12 w-12 opacity-40" />
              <p className="text-sm font-semibold">No templates found</p>
              <p className="text-xs">Try a different search term.</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

export default TemplatesPanel;
