import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Sparkles, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { TEMPLATE_DEFINITIONS } from './constants';
import type { TemplateDefinition } from './types';

interface TemplatesPanelProps {
  onApplyTemplate: (template: TemplateDefinition) => void;
  onClose: () => void;
  canEdit?: boolean;
  currentApp?: string | null;
}

type TemplateTab = 'current' | 'others';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

export const TemplatesPanel: React.FC<TemplatesPanelProps> = ({
  onApplyTemplate,
  onClose,
  canEdit = true,
  currentApp = null,
}) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TemplateTab | null>(() => (currentApp ? 'current' : 'others'));

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

  const appSlug = useMemo(() => slugify(currentApp ?? ''), [currentApp]);

  const templateMatchesApp = useCallback(
    (template: TemplateDefinition) => {
      if (!appSlug) {
        return false;
      }

      const candidates = [
        template.id,
        template.name,
        template.category,
        ...(template.aliases ?? []),
        ...template.tags,
      ];
      return candidates.some(candidate => slugify(candidate) === appSlug);
    },
    [appSlug],
  );

  const { currentTemplates, otherTemplates } = useMemo(() => {
    const primary = filteredTemplates.filter(templateMatchesApp);
    const secondary = filteredTemplates.filter(template => !templateMatchesApp(template));
    return { currentTemplates: primary, otherTemplates: secondary };
  }, [filteredTemplates, templateMatchesApp]);

  useEffect(() => {
    if (currentTemplates.length === 0 && activeTab === 'current') {
      setActiveTab('others');
    }
    if (otherTemplates.length === 0 && activeTab === 'others') {
      setActiveTab(currentTemplates.length > 0 ? 'current' : null);
    }
  }, [activeTab, currentTemplates.length, otherTemplates.length]);

  const renderTemplates = useCallback(
    (templatesToRender: TemplateDefinition[], emptyMessage: { title: string; description: string }) => {
      if (templatesToRender.length === 0) {
        return (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Sparkles className="h-10 w-10 opacity-40" />
            <p className="text-sm font-semibold">{emptyMessage.title}</p>
            <p className="text-xs text-muted-foreground/80">{emptyMessage.description}</p>
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-2.5 pb-4">
          {templatesToRender.map(template => {
            const slides = template.slides.length;
            const Icon = template.icon;

            return (
              <article
                key={template.id}
                className="group flex h-full flex-col justify-between rounded-xl border border-border/40 bg-card/70 px-4 py-3 transition-all duration-200 hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-foreground transition-colors duration-200 group-hover:text-primary">
                          {template.name}
                        </h4>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                          {template.category}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary shadow-none"
                    >
                      {slides} {slides === 1 ? 'slide' : 'slides'}
                    </Badge>
                  </div>
                  <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground/90">
                    {template.description}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {template.tags.map(tag => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="rounded-full border-border/40 px-2 py-[2px] text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={cn(
                      'group/button h-8 gap-1 rounded-full px-3 text-xs font-semibold text-primary transition-colors duration-200',
                      'hover:bg-primary/10 hover:text-primary',
                      !canEdit && 'opacity-60 hover:bg-transparent hover:text-primary',
                    )}
                    disabled={!canEdit}
                    onClick={() => onApplyTemplate(template)}
                  >
                    Use
                    <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/button:translate-x-0.5" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      );
    },
    [canEdit, onApplyTemplate],
  );

  return (
    <div className="w-full shrink-0 rounded-2xl border border-border/60 bg-background/95 shadow-xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 via-violet-50 to-indigo-500 text-white shadow-lg">
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

        <Accordion
          type="single"
          collapsible
          value={activeTab ?? undefined}
          onValueChange={value =>
            setActiveTab(value ? (value as TemplateTab) : null)
          }
          className="flex flex-1 flex-col overflow-hidden"
        >
          <AccordionItem value="current" className="border-b border-border/50">
            <AccordionTrigger className="px-5 py-4 text-left">
              <div className="flex w-full flex-col items-start gap-1 text-sm font-semibold uppercase tracking-wider text-foreground">
                <span>Current app</span>
                {currentApp && (
                  <span className="text-[11px] font-medium capitalize text-muted-foreground">{currentApp}</span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="border-t border-border/40">
              <ScrollArea className="h-full max-h-[480px] px-5 py-5 pr-3">
                {renderTemplates(currentTemplates, {
                  title: currentApp ? `No templates for ${currentApp}` : 'No current app template',
                  description: query
                    ? 'Try adjusting your search to find templates for this app.'
                    : 'Templates for this app will appear here when available.',
                })}
              </ScrollArea>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="others" className="border-b border-border/50">
            <AccordionTrigger className="px-5 py-4 text-left">
              <div className="flex w-full items-start text-sm font-semibold uppercase tracking-wider text-foreground">
                <span>Other templates</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="border-t border-border/40">
              <ScrollArea className="h-full max-h-[480px] px-5 py-5 pr-3">
                {renderTemplates(otherTemplates, {
                  title: 'No templates found',
                  description: 'Try a different search term to discover more use cases.',
                })}
              </ScrollArea>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default TemplatesPanel;
