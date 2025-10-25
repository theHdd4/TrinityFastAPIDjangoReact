import React, { useEffect, useMemo, useState } from 'react';
import { Check, Droplet, Search, Sparkles } from 'lucide-react';
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
  customColorValue?: string | null;
  onCustomColorChange?: (hex: string) => void;
  customColorLabel?: string;
  customColorPlaceholder?: string;
  customColorHelperText?: string;
}

const swatchSizeMap: Record<ColorTraySwatchSize, string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
};

interface ColorTrayGroup {
  id: string;
  label: string;
  order: number;
  options: ColorTrayOption[];
}

const DEFAULT_HEADER_GRADIENT = 'linear-gradient(135deg, #a855f7 0%, #ec4899 45%, #f97316 100%)';
const DEFAULT_CUSTOM_COLOR_HEX = '#7c3aed';

const sanitizeHexTextInput = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  const filtered = withoutHash.replace(/[^0-9a-f]/gi, '').slice(0, 6);

  if (!filtered) {
    return '#';
  }

  return `#${filtered}`;
};

const normaliseHexForChange = (value: string): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === '#') {
    return null;
  }
  if (!trimmed.startsWith('#')) {
    return null;
  }

  const hex = trimmed.slice(1).replace(/[^0-9a-f]/gi, '');
  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map(character => character.repeat(2))
      .join('')
      .toLowerCase()}`;
  }
  if (hex.length === 6) {
    return `#${hex.toLowerCase()}`;
  }
  if (hex.length > 6) {
    return `#${hex.slice(0, 6).toLowerCase()}`;
  }

  return null;
};

const getOptionSwatchStyle = (option: ColorTrayOption): React.CSSProperties | undefined => {
  if (option.swatchStyle) {
    return { ...option.swatchStyle };
  }
  if (option.value) {
    return { background: option.value };
  }
  return undefined;
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
  customColorValue,
  onCustomColorChange,
  customColorLabel = 'Custom',
  customColorPlaceholder = '#000000',
  customColorHelperText = '',
}) => {
  const resolvedSelectedId = selectedId?.toLowerCase() ?? null;

  const [searchQuery, setSearchQuery] = useState('');
  const showCustomColorSection = Boolean(onCustomColorChange);

  const sanitisedCustomPropValue = useMemo(() => {
    if (!showCustomColorSection) {
      return '';
    }
    if (typeof customColorValue !== 'string') {
      return '';
    }
    return sanitizeHexTextInput(customColorValue).toUpperCase();
  }, [customColorValue, showCustomColorSection]);

  const derivedCustomHex = useMemo(() => {
    if (!showCustomColorSection) {
      return DEFAULT_CUSTOM_COLOR_HEX;
    }
    const normalised = normaliseHexForChange(sanitisedCustomPropValue);
    return normalised ?? DEFAULT_CUSTOM_COLOR_HEX;
  }, [sanitisedCustomPropValue, showCustomColorSection]);

  const [customInputValue, setCustomInputValue] = useState<string>(() => {
    if (!showCustomColorSection) {
      return '';
    }
    if (!sanitisedCustomPropValue || sanitisedCustomPropValue === '#') {
      return DEFAULT_CUSTOM_COLOR_HEX.toUpperCase();
    }
    return sanitisedCustomPropValue;
  });

  useEffect(() => {
    if (!showCustomColorSection) {
      return;
    }
    if (!sanitisedCustomPropValue || sanitisedCustomPropValue === '#') {
      setCustomInputValue(DEFAULT_CUSTOM_COLOR_HEX.toUpperCase());
      return;
    }
    setCustomInputValue(sanitisedCustomPropValue);
  }, [sanitisedCustomPropValue, showCustomColorSection]);

  const handleCustomPickerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }
    const value = event.target.value;
    setCustomInputValue(value.toUpperCase());
    onCustomColorChange?.(value);
  };

  const handleCustomTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }
    const sanitised = sanitizeHexTextInput(event.target.value).toUpperCase();
    setCustomInputValue(sanitised);
    const normalised = normaliseHexForChange(sanitised);
    if (normalised) {
      onCustomColorChange?.(normalised);
    }
  };

  const customPickerValue = useMemo(() => {
    const normalised = normaliseHexForChange(customInputValue);
    return normalised ?? derivedCustomHex;
  }, [customInputValue, derivedCustomHex]);

  const hasExplicitSections = Boolean(sections && sections.length > 0);

  const resolvedSections = useMemo(() => {
    if (hasExplicitSections) {
      return sections!.map(section => ({
        ...section,
        id: section.id,
        options: section.options ?? [],
      }));
    }
    const fallbackOptions = legacyOptions ?? [];
    if (fallbackOptions.length === 0) {
      return [] as ColorTraySection[];
    }
    return [
      {
        id: 'all',
        label: 'Colors',
        options: fallbackOptions,
      },
    ];
  }, [hasExplicitSections, legacyOptions, sections]);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(() => {
    if (resolvedSections.length === 0) {
      return null;
    }
    if (hasExplicitSections && defaultSectionId) {
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
    if (resolvedSections.length === 0) {
      if (activeSectionId !== null) {
        setActiveSectionId(null);
      }
      return;
    }

    setActiveSectionId(current => {
      if (current && resolvedSections.some(section => section.id === current)) {
        return current;
      }
      if (hasExplicitSections && defaultSectionId) {
        const match = resolvedSections.find(
          section => section.id.toLowerCase() === defaultSectionId.toLowerCase(),
        );
        if (match) {
          return match.id;
        }
      }
      return resolvedSections[0]?.id ?? null;
    });
  }, [defaultSectionId, hasExplicitSections, resolvedSections]);

  useEffect(() => {
    setSearchQuery('');
  }, [activeSectionId]);

  const activeSection = useMemo(() => {
    if (!activeSectionId) {
      return null;
    }
    return (
      resolvedSections.find(section => section.id === activeSectionId) ??
      resolvedSections[0] ??
      null
    );
  }, [activeSectionId, resolvedSections]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredOptions = useMemo(() => {
    const source = activeSection?.options ?? [];
    if (!normalizedQuery) {
      return source;
    }

    return source.filter(option => {
      const sources: readonly (string | undefined)[] = [
        option.label,
        option.value,
        option.id,
        ...(option.keywords ?? []),
      ];

      return sources.some(entry => entry?.toLowerCase().includes(normalizedQuery));
    });
  }, [activeSection?.options, normalizedQuery]);

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

  const isGradientSection = useMemo(() => {
    if (!activeSection) {
      return false;
    }
    if (activeSection.id.toLowerCase().includes('gradient')) {
      return true;
    }
    if (filteredOptions.length === 0) {
      return false;
    }
    return filteredOptions.every(option => {
      const style = option.swatchStyle;
      if (style?.backgroundImage) {
        return true;
      }
      const value = option.value ?? '';
      return value.startsWith('linear-gradient');
    });
  }, [activeSection, filteredOptions]);

  const effectiveColumns = columns ?? (resolvedSections.length > 0 ? 8 : 6);

  const allOptions = useMemo(
    () => resolvedSections.flatMap(section => section.options ?? []),
    [resolvedSections],
  );

  const fallbackCustomOption = useMemo(() => {
    if (!showCustomColorSection) {
      return null;
    }
    const customHex = normaliseHexForChange(customInputValue) ?? derivedCustomHex;
    return {
      id: resolvedSelectedId ?? customHex,
      value: customHex,
      label: customColorLabel,
      swatchStyle: { background: customHex },
    } satisfies ColorTrayOption;
  }, [customColorLabel, customInputValue, derivedCustomHex, resolvedSelectedId, showCustomColorSection]);

  const selectedOption = useMemo(() => {
    if (resolvedSelectedId) {
      const match = allOptions.find(option => option.id.toLowerCase() === resolvedSelectedId);
      if (match) {
        return match;
      }
    }
    return fallbackCustomOption;
  }, [allOptions, fallbackCustomOption, resolvedSelectedId]);

  const headerPreviewStyle = useMemo<React.CSSProperties>(() => {
    if (!selectedOption) {
      return { backgroundImage: DEFAULT_HEADER_GRADIENT };
    }
    const style = getOptionSwatchStyle(selectedOption) ?? {};
    if (Object.keys(style).length === 0) {
      return { backgroundImage: DEFAULT_HEADER_GRADIENT };
    }
    return style;
  }, [selectedOption]);

  const renderColorOption = (option: ColorTrayOption) => {
    const optionId = option.id.toLowerCase();
    const isSelected = resolvedSelectedId === optionId;
    const isDisabled = disabled || option.disabled;
    const ariaLabel = option.ariaLabel ?? option.label ?? option.value ?? option.id;
    const tooltip = option.tooltip ?? ariaLabel;
    const swatchStyle = getOptionSwatchStyle(option);

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
          'group relative flex items-center justify-center rounded-2xl p-[3px] transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isSelected
            ? 'scale-110 shadow-xl ring-2 ring-primary/60 ring-offset-2 ring-offset-background'
            : 'hover:scale-110 hover:shadow-lg',
          isDisabled && 'cursor-not-allowed opacity-60 hover:scale-100 hover:shadow-none',
          optionClassName,
        )}
        disabled={isDisabled}
      >
        <span
          className={cn(
            'relative flex items-center justify-center rounded-2xl border border-white/50 bg-white/80 shadow-inner transition-all duration-200',
            swatchSizeMap[swatchSize],
            option.swatchClassName,
          )}
          style={swatchStyle}
        >
          {option.preview ?? null}
          {isSelected && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/30 backdrop-blur-sm">
              <Check className="h-4 w-4 text-white drop-shadow" />
            </span>
          )}
        </span>
      </button>
    );
  };

  const renderGradientOption = (option: ColorTrayOption) => {
    const optionId = option.id.toLowerCase();
    const isSelected = resolvedSelectedId === optionId;
    const isDisabled = disabled || option.disabled;
    const ariaLabel = option.ariaLabel ?? option.label ?? option.value ?? option.id;
    const tooltip = option.tooltip ?? ariaLabel;
    const swatchStyle = getOptionSwatchStyle(option);

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
          'group relative flex h-28 w-full flex-col overflow-hidden rounded-[1.75rem] border border-border/40 bg-white/10 text-left transition-all duration-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isSelected
            ? 'scale-[1.02] border-primary/50 shadow-2xl'
            : 'hover:-translate-y-1 hover:shadow-xl',
          isDisabled && 'cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-none',
          optionClassName,
        )}
        disabled={isDisabled}
      >
        <span className="absolute inset-0" style={swatchStyle} />
        <span className="absolute inset-0 bg-gradient-to-br from-black/15 via-transparent to-black/35 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        {isSelected && (
          <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Check className="h-4 w-4 text-primary" />
          </span>
        )}
        <span className="relative mt-auto p-4">
          <span className="block rounded-xl bg-white/90 px-3 py-1.5 text-center text-xs font-semibold text-foreground shadow-md">
            {option.label ?? option.value ?? option.id}
          </span>
        </span>
      </button>
    );
  };

  const sectionValue = activeSectionId ?? resolvedSections[0]?.id ?? 'default';
  const showTabs = resolvedSections.length > 1;
  const selectedTitle = selectedOption?.label ?? selectedOption?.value ?? 'Choose a color';

  return (
    <div
      className={cn(
        'w-[360px] rounded-[2.25rem] border border-border/50 bg-gradient-to-br from-background via-background/95 to-card shadow-[0_35px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur-2xl',
        className,
      )}
    >
      <div className="space-y-5 p-5">
        <div className="relative overflow-hidden rounded-[1.75rem] border border-white/30 bg-gradient-to-r from-[#a855f7]/25 via-[#ec4899]/20 to-[#f97316]/25 p-[1px] shadow-inner">
          <div className="relative rounded-[inherit] bg-white/80 px-5 py-4 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center">
                <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/70 via-white/20 to-white/80" />
                <div
                  className="relative flex h-9 w-9 items-center justify-center rounded-xl border-2 border-white/70 bg-white/60 shadow-lg"
                  style={headerPreviewStyle}
                >
                  {selectedOption?.preview ? (
                    selectedOption.preview
                  ) : (
                    <span className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/30 via-transparent to-white/40" />
                  )}
                </div>
              </div>
              <div className="flex flex-1 flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                  Color Palette
                </span>
                <span className="text-base font-semibold text-foreground">{selectedTitle}</span>
              </div>
              <Droplet className="h-5 w-5 text-[#a855f7]" />
            </div>
          </div>
        </div>

        <Tabs value={sectionValue} onValueChange={setActiveSectionId} className="w-full">
          {showTabs ? (
            <div className="px-1">
              <TabsList className="grid w-full grid-cols-2 gap-2 rounded-xl border border-border/30 bg-gradient-to-br from-muted/60 via-muted/40 to-muted/60 p-1.5 shadow-lg backdrop-blur">
                {resolvedSections.map(section => {
                  const isGradient = section.id.toLowerCase().includes('gradient');
                  return (
                    <TabsTrigger
                      key={section.id}
                      value={section.id}
                      className="relative flex items-center justify-center rounded-lg px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground transition-all duration-300 data-[state=active]:scale-[0.98] data-[state=active]:border data-[state=active]:border-primary/20 data-[state=active]:bg-gradient-to-br data-[state=active]:from-background data-[state=active]:to-card data-[state=active]:text-foreground data-[state=active]:shadow-lg"
                    >
                      {isGradient ? (
                        <Sparkles className="mr-2 h-3.5 w-3.5" />
                      ) : (
                        <Droplet className="mr-2 h-3.5 w-3.5" />
                      )}
                      {section.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>
          ) : null}

          <TabsContent value={sectionValue} className="mt-4 px-0">
            <div className="space-y-4">
              {activeSection?.description ? (
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground/80">
                  {activeSection.description}
                </p>
              ) : null}
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="Search colors or hex codes"
                  className="h-11 rounded-2xl border border-border/40 bg-gradient-to-r from-white/90 via-white/70 to-white/90 pl-11 text-sm shadow-inner transition-all focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/60"
                />
              </div>

              <ScrollArea className="h-[320px] pr-2">
                {hasGroupedOptions ? (
                  <div className="space-y-5 pr-1">
                    {groupedOptions?.map(group => (
                      <div key={group.id} className="space-y-3">
                        <div className="flex items-center gap-3 px-1">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.45em] text-muted-foreground">
                            {group.label}
                          </span>
                          <span className="flex-1 border-t border-dashed border-border/40" />
                        </div>
                        <div className="grid grid-cols-10 gap-2">
                          {group.options.map(renderColorOption)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : isGradientSection ? (
                  <div className="grid grid-cols-1 gap-4 pr-1 sm:grid-cols-2">
                    {filteredOptions.map(renderGradientOption)}
                    {filteredOptions.length === 0 && (emptyState ?? (
                      <div className="col-span-full flex h-32 flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-gradient-to-br from-muted/20 via-transparent to-muted/10 text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                        No options available
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="grid gap-3 pr-1"
                    style={{ gridTemplateColumns: `repeat(${Math.max(1, effectiveColumns)}, minmax(0, 1fr))` }}
                  >
                    {filteredOptions.map(renderColorOption)}
                    {filteredOptions.length === 0 && (emptyState ?? (
                      <div className="col-span-full flex h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-gradient-to-br from-muted/20 via-transparent to-muted/10 text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                        No options available
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {showCustomColorSection ? (
                <div className="relative overflow-hidden rounded-[1.75rem] border border-white/40 bg-gradient-to-r from-white/80 via-white/60 to-white/80 p-[1px] shadow-inner">
                  <div className="flex w-full flex-col items-center gap-4 rounded-[inherit] bg-white/80 px-5 py-5 text-center backdrop-blur-xl">
                    <input
                      type="color"
                      value={customPickerValue}
                      onChange={handleCustomPickerChange}
                      disabled={disabled}
                      className="h-14 w-full cursor-pointer rounded-2xl border-2 border-border/40 bg-white/90 p-0 shadow-inner transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <input
                      type="text"
                      value={customInputValue}
                      onChange={handleCustomTextChange}
                      disabled={disabled}
                      placeholder={customColorPlaceholder}
                      maxLength={7}
                      className="h-11 w-full rounded-2xl border border-border/40 bg-gradient-to-r from-white/90 via-white/70 to-white/90 px-4 text-center text-sm font-mono uppercase tracking-[0.35em] text-foreground shadow-inner transition-all focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.45em] text-muted-foreground/80">
                        {customColorLabel}
                      </span>
                      {customColorHelperText ? (
                        <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-muted-foreground/60">
                          {customColorHelperText}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ColorTray;
