import React, { useEffect, useMemo, useState } from 'react';
import { Check, Droplet, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-2xl',
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

  return (
    <div
      className={cn(
        'w-full max-w-md rounded-3xl border border-border/50 bg-gradient-to-br from-background via-background/95 to-card p-4 shadow-2xl backdrop-blur-xl',
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 px-5 py-4 shadow-inner">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent opacity-70" />
        <div className="relative flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/40 opacity-70 blur-sm" />
            <div
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border-2 border-primary/30 shadow-lg ring-2 ring-background"
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
          <Droplet className="h-4 w-4 text-primary/70" />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {resolvedSections ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-1 flex-wrap gap-2 rounded-2xl border border-border/30 bg-gradient-to-br from-muted/60 via-muted/40 to-muted/50 p-1.5 shadow-lg">
                {resolvedSections.map(section => {
                  const isActive = section.id === activeSectionId;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={cn(
                        'relative flex flex-1 items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-300',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        isActive
                          ? 'bg-gradient-to-br from-background via-card to-background text-foreground shadow-lg'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => setActiveSectionId(section.id)}
                      aria-pressed={isActive}
                      style={{ minWidth: '6.5rem' }}
                    >
                      {section.label}
                    </button>
                  );
                })}
              </div>
              {activeSection?.description ? (
                <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/80">
                  {activeSection.description}
                </span>
              ) : null}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search colors or hex codes"
                className="h-10 rounded-2xl border border-border/50 bg-gradient-to-r from-background/90 via-background/70 to-background/90 pl-11 text-sm shadow-inner transition-all focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            </div>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search colors or hex codes"
              className="h-10 rounded-2xl border border-border/50 bg-gradient-to-r from-background/90 via-background/70 to-background/90 pl-11 text-sm shadow-inner transition-all focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/60"
            />
          </div>
        )}

        <ScrollArea className="max-h-[22rem] pr-2">
          <div
            className={cn('grid gap-3 pr-1', gridClassName)}
            style={effectiveColumns ? { gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))` } : gridTemplate}
          >
            {filteredOptions.map(option => {
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
                    'group relative inline-flex items-center justify-center rounded-2xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    'before:absolute before:-inset-1 before:-z-10 before:rounded-[1.25rem] before:bg-gradient-to-br before:from-primary/10 before:via-primary/0 before:to-primary/20 before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100',
                    isSelected
                      ? 'z-10 scale-105 ring-2 ring-primary/50 shadow-2xl'
                      : 'hover:z-10 hover:scale-105 hover:-rotate-1 hover:shadow-xl',
                    isDisabled && 'cursor-not-allowed opacity-60 hover:scale-100 hover:shadow-none before:opacity-0',
                    optionClassName,
                  )}
                  disabled={isDisabled}
                >
                  <span
                    className={cn(
                      'relative flex items-center justify-center rounded-[inherit] border border-border/40 bg-background shadow-inner transition-all duration-300',
                      swatchSizeMap[swatchSize],
                      option.swatchClassName,
                    )}
                    style={option.swatchStyle}
                  >
                    {option.preview ?? null}
                    {isSelected && (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/25 backdrop-blur-sm">
                        <Check className="h-4 w-4 text-white drop-shadow" />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {filteredOptions.length === 0 && (emptyState ?? (
              <div className="col-span-full flex h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-gradient-to-br from-muted/20 via-transparent to-muted/10 text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                No options available
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default ColorTray;
