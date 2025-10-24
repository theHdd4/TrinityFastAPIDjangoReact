import React, { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
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

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {resolvedSections ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 p-1 shadow-sm">
              {resolvedSections.map(section => {
                const isActive = section.id === activeSectionId;
                return (
                  <button
                    key={section.id}
                    type="button"
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all duration-150',
                      isActive
                        ? 'bg-background text-foreground shadow'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setActiveSectionId(section.id)}
                    aria-pressed={isActive}
                  >
                    {section.label}
                  </button>
                );
              })}
            </div>
            {activeSection?.description ? (
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {activeSection.description}
              </span>
            ) : null}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search colors or hex codes"
              className="h-9 rounded-full border border-border/60 bg-background pl-9 text-sm shadow-sm focus-visible:ring-0"
            />
          </div>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search colors or hex codes"
            className="h-9 rounded-full border border-border/60 bg-background pl-9 text-sm shadow-sm focus-visible:ring-0"
          />
        </div>
      )}

      <div className="max-h-[22rem] overflow-y-auto pr-1">
        <div
          className={cn('grid gap-2', gridClassName)}
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
                'group relative inline-flex items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                isSelected && 'ring-2 ring-primary/40',
                isDisabled && 'cursor-not-allowed opacity-60',
                optionClassName,
              )}
              disabled={isDisabled}
            >
              <span
                className={cn(
                  'relative flex items-center justify-center border border-border/40 bg-background shadow-inner transition-all',
                  swatchSizeMap[swatchSize],
                  option.swatchClassName,
                )}
                style={option.swatchStyle}
              >
                {option.preview ?? null}
                {isSelected && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/20">
                    <Check className="h-4 w-4 text-white" />
                  </span>
                )}
              </span>
            </button>
          );
        })}
          {filteredOptions.length === 0 && (emptyState ?? (
            <div className="col-span-full flex h-24 items-center justify-center rounded-xl border border-dashed border-border/60 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              No options available
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ColorTray;
