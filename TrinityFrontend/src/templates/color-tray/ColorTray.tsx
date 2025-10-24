import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Droplet, Search } from 'lucide-react';
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

const swatchDimensionMap: Record<ColorTraySwatchSize, string> = {
  sm: 'h-6 w-6',
  md: 'h-7 w-7',
  lg: 'h-9 w-9',
};

const swatchShapeMap: Record<ColorTraySwatchSize, string> = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
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

  const normalizedQuery = searchQuery.trim().toLowerCase();

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

  const filterOptions = useCallback(
    (options: readonly ColorTrayOption[] | undefined) => {
      if (!options) {
        return [] as readonly ColorTrayOption[];
      }
      if (!normalizedQuery) {
        return options;
      }

      return options.filter(option => {
        const sources: readonly (string | undefined)[] = [
          option.label,
          option.value,
          option.id,
          ...(option.keywords ?? []),
        ];

        return sources.some(source => source?.toLowerCase().includes(normalizedQuery));
      });
  }, [normalizedQuery]);

  const filteredSections = useMemo(() => {
    if (!resolvedSections) {
      return null;
    }

    return resolvedSections.map(section => ({
      ...section,
      options: filterOptions(section.options ?? []),
    }));
  }, [filterOptions, resolvedSections]);

  const filteredLegacyOptions = useMemo(() => {
    if (resolvedSections) {
      return [] as readonly ColorTrayOption[];
    }
    return filterOptions(legacyOptions ?? []);
  }, [filterOptions, legacyOptions, resolvedSections]);

  const activeTabValue =
    resolvedSections && resolvedSections.length > 0
      ? activeSectionId ?? resolvedSections[0]?.id ?? ''
      : '';

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
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search colors or hex codes"
            className="h-10 rounded-2xl border border-border/50 bg-gradient-to-r from-background/90 via-background/70 to-background/90 pl-11 text-sm shadow-inner transition-all focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/60"
          />
        </div>

        {resolvedSections ? (
          <Tabs value={activeTabValue} onValueChange={value => setActiveSectionId(value)} className="w-full">
            <div className="px-1 pt-1">
              <TabsList className="grid w-full grid-cols-2 bg-gradient-to-br from-muted/60 via-muted/40 to-muted/60 p-1.5 rounded-xl backdrop-blur-sm border border-border/30 shadow-lg">
                {resolvedSections.map(section => (
                  <TabsTrigger
                    key={section.id}
                    value={section.id}
                    className="relative data-[state=active]:bg-gradient-to-br data-[state=active]:from-background data-[state=active]:to-card data-[state=active]:shadow-lg data-[state=active]:border data-[state=active]:border-primary/20 transition-all duration-300 data-[state=active]:scale-[0.98] rounded-lg text-xs font-semibold"
                  >
                    {section.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {filteredSections?.map(section => {
              const options = section.options ?? [];
              const originalSection = resolvedSections.find(original => original.id === section.id);
              const description = originalSection?.description;

              return (
                <TabsContent key={section.id} value={section.id} className="mt-0 p-4">
                  {description ? (
                    <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.35em] text-muted-foreground/70 text-center">
                      {description}
                    </p>
                  ) : null}
                  <ScrollArea className="h-[320px] pr-2">
                    <div className="space-y-5 pr-1">
                      <div
                        className={cn(
                          'grid gap-2 p-2 rounded-xl bg-gradient-to-br from-muted/20 to-transparent border border-border/20',
                          !columns && 'grid-cols-10',
                        )}
                        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
                      >
                          {options.map(option => {
                            const optionId = option.id.toLowerCase();
                            const isSelected = resolvedSelectedId === optionId;
                            const isDisabled = disabled || option.disabled;
                            const ariaLabel = option.ariaLabel ?? option.label ?? option.value ?? option.id;
                            const tooltip = option.tooltip ?? ariaLabel;
                            const swatchStyle = option.swatchStyle ?? (option.value ? { background: option.value } : undefined);
                            const highlightShadow =
                              isSelected
                                ? {
                                    boxShadow:
                                      swatchStyle &&
                                      typeof swatchStyle.backgroundColor === 'string' &&
                                      swatchStyle.backgroundColor.startsWith('#')
                                        ? `0 8px 16px -4px ${swatchStyle.backgroundColor}80, 0 0 0 2px hsl(var(--primary))`
                                        : '0 8px 20px -6px rgba(15, 23, 42, 0.45), 0 0 0 2px hsl(var(--primary))',
                                  }
                                : undefined;

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
                                  'group relative inline-flex items-center justify-center transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                  swatchShapeMap[swatchSize],
                                  'before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-gradient-to-br before:from-primary/10 before:via-primary/0 before:to-primary/20 before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100',
                                  isSelected
                                    ? 'z-10 scale-125 ring-2 ring-primary shadow-2xl'
                                    : 'hover:z-20 hover:scale-125 hover:rotate-6 hover:shadow-2xl',
                                  isDisabled && 'cursor-not-allowed opacity-60 hover:scale-100 hover:shadow-none before:opacity-0',
                                  optionClassName,
                                )}
                                style={highlightShadow}
                                disabled={isDisabled}
                              >
                                <span
                                  className={cn(
                                    'relative flex items-center justify-center rounded-[inherit] shadow-md transition-all duration-300',
                                    swatchDimensionMap[swatchSize],
                                    option.swatchClassName,
                                  )}
                                  style={swatchStyle}
                                >
                                  {option.preview ?? null}
                                  {isSelected && (
                                    <span className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-background animate-pulse" />
                                  )}
                                  {isSelected && (
                                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/20 backdrop-blur-sm">
                                      <Check className="h-4 w-4 text-white drop-shadow" />
                                    </span>
                                  )}
                                </span>
                              </button>
                            );
                          })}
                          {options.length === 0 && (emptyState ?? (
                            <div className="col-span-full flex h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-gradient-to-br from-muted/20 via-transparent to-muted/10 text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                              No options available
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
              );
            })}
          </Tabs>
        ) : (
          <ScrollArea className="max-h-[22rem] pr-2">
            <div
              className={cn(
                'grid gap-2 p-2 pr-1 rounded-xl bg-gradient-to-br from-muted/20 to-transparent border border-border/20',
                !columns && 'grid-cols-10',
              )}
              style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
            >
              {filteredLegacyOptions.map(option => {
                const optionId = option.id.toLowerCase();
                const isSelected = resolvedSelectedId === optionId;
                const isDisabled = disabled || option.disabled;
                const ariaLabel = option.ariaLabel ?? option.label ?? option.value ?? option.id;
                const tooltip = option.tooltip ?? ariaLabel;
                const swatchStyle = option.swatchStyle ?? (option.value ? { background: option.value } : undefined);
                const highlightShadow =
                  isSelected
                    ? {
                        boxShadow:
                          swatchStyle &&
                          typeof swatchStyle.backgroundColor === 'string' &&
                          swatchStyle.backgroundColor.startsWith('#')
                            ? `0 8px 16px -4px ${swatchStyle.backgroundColor}80, 0 0 0 2px hsl(var(--primary))`
                            : '0 8px 20px -6px rgba(15, 23, 42, 0.45), 0 0 0 2px hsl(var(--primary))',
                      }
                    : undefined;

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
                      'group relative inline-flex items-center justify-center transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      swatchShapeMap[swatchSize],
                      'before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-gradient-to-br before:from-primary/10 before:via-primary/0 before:to-primary/20 before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100',
                      isSelected
                        ? 'z-10 scale-125 ring-2 ring-primary shadow-2xl'
                        : 'hover:z-20 hover:scale-125 hover:rotate-6 hover:shadow-2xl',
                      isDisabled && 'cursor-not-allowed opacity-60 hover:scale-100 hover:shadow-none before:opacity-0',
                      optionClassName,
                    )}
                    style={highlightShadow}
                    disabled={isDisabled}
                  >
                    <span
                      className={cn(
                        'relative flex items-center justify-center rounded-[inherit] shadow-md transition-all duration-300',
                        swatchDimensionMap[swatchSize],
                        option.swatchClassName,
                      )}
                      style={swatchStyle}
                    >
                      {option.preview ?? null}
                      {isSelected && (
                        <span className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-background animate-pulse" />
                      )}
                      {isSelected && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/20 backdrop-blur-sm">
                          <Check className="h-4 w-4 text-white drop-shadow" />
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              {filteredLegacyOptions.length === 0 && (emptyState ?? (
                <div className="col-span-full flex h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-gradient-to-br from-muted/20 via-transparent to-muted/10 text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                  No options available
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default ColorTray;
