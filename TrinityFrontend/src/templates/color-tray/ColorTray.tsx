import React, { useEffect, useMemo, useState } from 'react';
import { Droplet, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { ColorTrayOption, ColorTraySection, ColorTraySwatchSize } from './types';

export interface ColorTrayProps {
  options?: readonly ColorTrayOption[];
  sections?: readonly ColorTraySection[];
  selectedId?: string | null;
  onSelect?: (option: ColorTrayOption) => void;
  columns?: number;
  className?: string;
  optionClassName?: string;
  disabled?: boolean;
  swatchSize?: ColorTraySwatchSize;
  defaultSectionId?: string;
  emptyState?: React.ReactNode;
}

const swatchSizeMap: Record<ColorTraySwatchSize, string> = {
  sm: 'h-8 w-8 rounded-[14px]',
  md: 'h-9 w-9 rounded-[16px]',
  lg: 'h-11 w-11 rounded-[20px]',
};

export const ColorTray: React.FC<ColorTrayProps> = ({
  options: legacyOptions,
  sections,
  selectedId,
  onSelect,
  columns,
  className,
  optionClassName,
  disabled = false,
  swatchSize = 'md',
  defaultSectionId,
  emptyState,
}) => {
  const gridTemplate = columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined;
  const resolvedSelectedId = selectedId?.toLowerCase() ?? null;

  const [searchQuery, setSearchQuery] = useState('');

  const resolvedSections = useMemo(() => {
    if (!sections || sections.length === 0) {
      return null;
    }
    return sections.map(section => ({
      ...section,
      id: section.id,
      options: section.options ?? [],
    }));
  }, [sections]);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(() => {
    if (!resolvedSections) {
      return null;
    }
    if (defaultSectionId) {
      const match = resolvedSections.find(
        section => section.id.toLowerCase() === defaultSectionId.toLowerCase(),
      );
      if (match) {
        return match.id;
      }
    }
    return resolvedSections[0]?.id ?? null;
  });

  useEffect(() => {
    if (!resolvedSections) {
      if (activeSectionId !== null) {
        setActiveSectionId(null);
      }
      return;
    }

    const normalizedDefault = defaultSectionId?.toLowerCase() ?? '';
    const fallbackId = resolvedSections[0]?.id ?? null;
    const hasActiveSelection =
      !!activeSectionId && resolvedSections.some(section => section.id === activeSectionId);

    if (!hasActiveSelection) {
      if (normalizedDefault) {
        const match = resolvedSections.find(
          section => section.id.toLowerCase() === normalizedDefault,
        );
        if (match && match.id !== activeSectionId) {
          setActiveSectionId(match.id);
          return;
        }
      }

      if (fallbackId && fallbackId !== activeSectionId) {
        setActiveSectionId(fallbackId);
      }
    }
  }, [activeSectionId, defaultSectionId, resolvedSections]);

  useEffect(() => {
    setSearchQuery('');
  }, [activeSectionId]);

  const activeSection = useMemo(() => {
    if (!resolvedSections || !activeSectionId) {
      return null;
    }
    return (
      resolvedSections.find(section => section.id === activeSectionId) ??
      resolvedSections[0] ??
      null
    );
  }, [activeSectionId, resolvedSections]);

  const resolvedOptions = useMemo(() => {
    if (resolvedSections) {
      return activeSection?.options ?? [];
    }
    return legacyOptions ?? [];
  }, [activeSection?.options, legacyOptions, resolvedSections]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return resolvedOptions;
    }

    return resolvedOptions.filter(option => {
      const sources: readonly (string | undefined)[] = [
        option.label,
        option.value,
        option.id,
        ...(option.keywords ?? []),
      ];

      return sources.some(source => source?.toLowerCase().includes(normalizedQuery));
    });
  }, [normalizedQuery, resolvedOptions]);

  const effectiveColumns = useMemo(() => {
    if (columns) {
      return columns;
    }
    if (resolvedSections) {
      return 8;
    }
    return undefined;
  }, [columns, resolvedSections]);

  const gridClassName = useMemo(() => {
    if (effectiveColumns) {
      return 'auto-rows-fr';
    }
    if (resolvedSections) {
      return 'grid-cols-8';
    }
    return 'grid-cols-6';
  }, [effectiveColumns, resolvedSections]);

  const allOptions = useMemo(() => {
    if (resolvedSections) {
      return resolvedSections.flatMap(section => section.options ?? []);
    }
    return legacyOptions ?? [];
  }, [legacyOptions, resolvedSections]);

  const selectedOption = useMemo(() => {
    if (!resolvedSelectedId) {
      return null;
    }
    return (
      allOptions.find(option => option.id.toLowerCase() === resolvedSelectedId) ?? null
    );
  }, [allOptions, resolvedSelectedId]);

  const selectedSwatchStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!selectedOption) {
      return undefined;
    }
    if (selectedOption.swatchStyle) {
      return selectedOption.swatchStyle;
    }
    if (selectedOption.value) {
      return { background: selectedOption.value };
    }
    return undefined;
  }, [selectedOption]);

  const renderSwatch = (option: ColorTrayOption) => {
    const optionId = option.id.toLowerCase();
    const isSelected = resolvedSelectedId === optionId;
    const isDisabled = disabled || option.disabled;
    const ariaLabel = option.ariaLabel ?? option.label ?? option.value ?? option.id;
    const tooltip = option.tooltip ?? ariaLabel;

    return (
      <button
        key={option.id}
        type="button"
        aria-label={ariaLabel}
        title={tooltip}
        onClick={() => {
          if (!isDisabled) {
            onSelect?.(option);
          }
        }}
        className={cn(
          'group relative inline-flex items-center justify-center rounded-[18px] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'before:absolute before:-inset-[3px] before:-z-10 before:rounded-[inherit] before:bg-gradient-to-br before:from-white/60 before:via-white/20 before:to-white/60 before:opacity-0 before:transition-opacity before:duration-300',
          'after:absolute after:inset-0 after:-z-10 after:rounded-[inherit] after:bg-gradient-to-br after:from-border/40 after:via-border/10 after:to-transparent after:opacity-0 after:transition-opacity after:duration-300',
          isSelected
            ? 'z-20 -rotate-3 scale-[1.08] before:opacity-100 after:opacity-100 shadow-xl'
            : 'hover:-translate-y-0.5 hover:-rotate-2 hover:before:opacity-100 hover:after:opacity-100 hover:shadow-lg',
          isDisabled &&
            'cursor-not-allowed opacity-60 hover:translate-y-0 hover:rotate-0 hover:shadow-none before:opacity-0 after:opacity-0',
          optionClassName,
        )}
        disabled={isDisabled}
      >
        <span
          className={cn(
            'relative flex aspect-square items-center justify-center overflow-hidden rounded-[inherit] bg-white/70 shadow-sm transition-all duration-300',
            'ring-1 ring-border/30',
            isSelected
              ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background'
              : 'group-hover:ring-border/50',
            swatchSizeMap[swatchSize],
            option.swatchClassName,
          )}
          style={option.swatchStyle}
        >
          {option.preview ?? null}
          <span className="pointer-events-none absolute inset-0 rounded-[inherit] border border-white/40 opacity-0 transition-opacity duration-300 group-hover:opacity-70" />
          {isSelected && (
            <span className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-white/80 shadow-[0_12px_20px_rgba(15,23,42,0.25)]" />
          )}
        </span>
      </button>
    );
  };

  const renderOptionsGrid = (optionsToRender: readonly ColorTrayOption[]) => {
    if (optionsToRender.length === 0) {
      return (
        <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-background/80 via-background/60 to-background/80 p-6">
          {emptyState ?? (
            <div className="text-center text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              No options available
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-border/30 bg-gradient-to-br from-background/90 via-background/70 to-background/90 p-3 shadow-inner">
        <div
          className={cn(
            'grid gap-2 sm:gap-3',
            gridClassName,
          )}
          style={
            effectiveColumns
              ? { gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))` }
              : gridTemplate
          }
        >
          {optionsToRender.map(renderSwatch)}
        </div>
      </div>
    );
  };

  const renderSearch = () => (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={searchQuery}
        onChange={event => setSearchQuery(event.target.value)}
        placeholder="Search colors or hex codes"
        className="h-10 rounded-xl border border-border/40 bg-gradient-to-r from-background/90 via-background/70 to-background/90 pl-11 text-xs font-semibold uppercase tracking-[0.2em] text-foreground/80 shadow-inner transition-all focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/60"
      />
    </div>
  );

  return (
    <div
      className={cn(
        'w-full max-w-[360px] rounded-2xl border border-border/50 bg-gradient-to-br from-background via-background/95 to-card shadow-2xl backdrop-blur-xl',
        className,
      )}
    >
      <div className="relative overflow-hidden border-b border-border/30 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 px-5 py-4">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent" />
        <div className="relative flex items-center gap-3">
          <div className="relative group">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/20 to-primary/40 opacity-75 blur-sm transition-opacity group-hover:opacity-100" />
            <div
              className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary/30 shadow-lg ring-2 ring-background"
              style={selectedSwatchStyle}
            >
              {selectedOption?.preview ? (
                selectedOption.preview
              ) : (
                <span className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-muted/40 via-muted/20 to-muted/40" />
              )}
            </div>
          </div>
          <div className="flex flex-1 flex-col">
            <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-xs font-bold uppercase tracking-[0.2em] text-transparent">
              Color Palette
            </span>
            {selectedOption?.label ? (
              <span className="text-sm font-semibold text-foreground/90">{selectedOption.label}</span>
            ) : selectedOption?.value ? (
              <span className="text-sm font-semibold text-foreground/90">{selectedOption.value}</span>
            ) : (
              <span className="text-sm font-semibold text-foreground/80">Choose a color</span>
            )}
          </div>
          <Droplet className="h-4 w-4 text-primary/60" />
        </div>
      </div>

      {resolvedSections ? (
        <Tabs
          value={activeSectionId ?? resolvedSections[0]?.id ?? ''}
          onValueChange={setActiveSectionId}
          className="w-full"
        >
          <div className="px-4 pt-4">
            <TabsList className="grid w-full grid-cols-1 gap-2 bg-gradient-to-br from-muted/60 via-muted/40 to-muted/60 p-1.5 rounded-xl backdrop-blur-sm border border-border/30 shadow-lg">
              {resolvedSections.map(section => (
                <TabsTrigger
                  key={section.id}
                  value={section.id}
                  className="relative data-[state=active]:bg-gradient-to-br data-[state=active]:from-background data-[state=active]:to-card data-[state=active]:shadow-lg data-[state=active]:border data-[state=active]:border-primary/20 transition-all duration-300 data-[state=active]:scale-[0.98] rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground data-[state=active]:text-foreground"
                >
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {resolvedSections.map(section => (
            <TabsContent key={section.id} value={section.id} className="mt-0 p-4">
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-xl bg-gradient-to-br from-muted/20 to-transparent p-3 border border-border/20">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/80">{section.label}</span>
                    <div className="h-px flex-1 bg-gradient-to-r from-border/40 via-border/20 to-transparent" />
                  </div>
                  {section.description ? (
                    <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-[0.2em]">{section.description}</p>
                  ) : null}
                  {renderSearch()}
                </div>

                <ScrollArea className="h-[320px] pr-2">
                  {renderOptionsGrid(
                    section.id === activeSectionId ? filteredOptions : section.options ?? [],
                  )}
                </ScrollArea>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="p-4 space-y-4">
          <div className="rounded-xl bg-gradient-to-br from-muted/20 to-transparent p-3 border border-border/20 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/80">Palette</span>
              <div className="h-px flex-1 bg-gradient-to-r from-border/40 via-border/20 to-transparent" />
            </div>
            {renderSearch()}
          </div>

          <ScrollArea className="h-[320px] pr-2">
            {renderOptionsGrid(filteredOptions)}
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

export default ColorTray;
