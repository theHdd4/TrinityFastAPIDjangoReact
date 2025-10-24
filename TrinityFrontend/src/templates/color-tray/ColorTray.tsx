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
  sm: 'h-9 w-9 rounded-xl',
  md: 'h-11 w-11 rounded-2xl',
  lg: 'h-14 w-14 rounded-[1.75rem]',
};

interface ColorTrayGroup {
  id: string;
  label: string;
  order: number;
  options: ColorTrayOption[];
}

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

  const groupedOptions = useMemo(() => {
    if (filteredOptions.length === 0) {
      return [] as ColorTrayGroup[];
    }

    const optionsWithGroups = filteredOptions.filter(
      option => option.groupId && option.groupLabel,
    );

    if (optionsWithGroups.length !== filteredOptions.length) {
      return null;
    }

    const groups = new Map<string, ColorTrayGroup>();

    optionsWithGroups.forEach(option => {
      const id = option.groupId!;
      const label = option.groupLabel!;
      const existing = groups.get(id);
      if (existing) {
        existing.order = Math.min(existing.order, option.groupOrder ?? existing.order);
        existing.options.push(option);
        return;
      }
      groups.set(id, {
        id,
        label,
        order: option.groupOrder ?? Number.MAX_SAFE_INTEGER,
        options: [option],
      });
    });

    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.label.localeCompare(b.label);
    });

    sortedGroups.forEach(group => {
      group.options = [...group.options].sort((a, b) => {
        const toneA = a.toneOrder ?? Number.MAX_SAFE_INTEGER;
        const toneB = b.toneOrder ?? Number.MAX_SAFE_INTEGER;
        if (toneA !== toneB) {
          return toneA - toneB;
        }
        const labelA = a.label ?? a.ariaLabel ?? a.id;
        const labelB = b.label ?? b.ariaLabel ?? b.id;
        return labelA.localeCompare(labelB);
      });
    });

    return sortedGroups;
  }, [filteredOptions]);

  const hasGroupedOptions = Array.isArray(groupedOptions) && groupedOptions.length > 0;

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

  const renderOption = (option: ColorTrayOption) => {
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
          'group relative flex items-center justify-center rounded-2xl border border-border/40 bg-gradient-to-br from-white/80 via-white/70 to-white/90 p-1.5 shadow-sm transition-all duration-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isSelected
            ? 'z-10 scale-105 border-primary/60 bg-white shadow-xl'
            : 'hover:-translate-y-0.5 hover:shadow-lg',
          isDisabled && 'cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-none',
          optionClassName,
        )}
        disabled={isDisabled}
      >
        <span
          className={cn(
            'relative flex items-center justify-center rounded-[inherit] border border-white/40 bg-white/70 shadow-inner transition-all duration-300',
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
  };

  return (
    <div
      className={cn(
        'w-full max-w-[26rem] rounded-[2.25rem] border border-border/60 bg-gradient-to-b from-background/95 via-background/90 to-card p-5 shadow-[0_35px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl',
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-r from-[#ff8dc7] via-[#a855f7] to-[#f97316] p-[1px] shadow-inner">
        <div className="rounded-[inherit] bg-white/75 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center">
              <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/70 via-white/20 to-white/80" />
              <div
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border-2 border-white/70 bg-white/60 shadow-lg"
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
              <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">
                Color Palette
              </span>
              {selectedOption?.label ? (
                <span className="text-base font-semibold text-slate-900">{selectedOption.label}</span>
              ) : selectedOption?.value ? (
                <span className="text-base font-semibold text-slate-900">{selectedOption.value}</span>
              ) : (
                <span className="text-base font-semibold text-slate-800">Choose a color</span>
              )}
            </div>
            <Droplet className="h-5 w-5 text-[#a855f7]" />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {resolvedSections ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-1 flex-wrap gap-2 rounded-2xl border border-border/40 bg-gradient-to-r from-white/70 via-white/50 to-white/70 p-1.5 shadow-sm">
                {resolvedSections.map(section => {
                  const isActive = section.id === activeSectionId;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={cn(
                        'relative flex flex-1 items-center justify-center rounded-xl px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] transition-all duration-300',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        isActive
                          ? 'bg-gradient-to-r from-[#fef4ff] via-white to-[#fef9f4] text-foreground shadow-md'
                          : 'text-muted-foreground hover:bg-white/60 hover:text-foreground',
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
                className="h-11 rounded-2xl border border-border/50 bg-gradient-to-r from-white/90 via-white/70 to-white/90 pl-11 text-sm shadow-inner transition-all focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/60"
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
              className="h-11 rounded-2xl border border-border/50 bg-gradient-to-r from-white/90 via-white/70 to-white/90 pl-11 text-sm shadow-inner transition-all focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/60"
            />
          </div>
        )}

        <ScrollArea className="max-h-[22rem] pr-2">
          {hasGroupedOptions ? (
            <div className="space-y-4 pr-1">
              {groupedOptions?.map(group => (
                <div key={group.id} className="grid grid-cols-[6rem,1fr] items-start gap-4">
                  <div className="pt-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                    {group.label}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.options.map(renderOption)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className={cn('grid gap-3 pr-1', gridClassName)}
              style={effectiveColumns ? { gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))` } : gridTemplate}
            >
              {filteredOptions.map(renderOption)}
              {filteredOptions.length === 0 && (emptyState ?? (
                <div className="col-span-full flex h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-gradient-to-br from-muted/20 via-transparent to-muted/10 text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                  No options available
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

export default ColorTray;
