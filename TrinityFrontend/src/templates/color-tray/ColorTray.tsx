import React, { useEffect, useMemo, useState } from 'react';
import { Droplet, Sparkles } from 'lucide-react';
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
  sm: 'flex h-9 w-9 items-center justify-center rounded-xl',
  md: 'flex h-10 w-10 items-center justify-center rounded-[14px]',
  lg: 'flex h-12 w-12 items-center justify-center rounded-[16px]',
};

interface ParsedColor {
  hue: number;
  saturation: number;
  lightness: number;
}

interface SolidCategoryDefinition {
  id: string;
  label: string;
  icon: string;
  match: (color: ParsedColor | null, option: ColorTrayOption) => boolean;
}

interface SolidCategoryGroup {
  id: string;
  label: string;
  icon: string;
  options: ColorTrayOption[];
}

const SOLID_CATEGORY_DEFINITIONS: readonly SolidCategoryDefinition[] = [
  {
    id: 'monochrome',
    label: 'Monochrome',
    icon: '⚫',
    match: (color, option) => {
      const label = option.label?.toLowerCase() ?? '';
      if (label.match(/black|white|grey|gray|slate|graphite|smoke|silver|frost|mist|cloud/)) {
        return true;
      }
      return color ? color.saturation <= 0.08 : false;
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    icon: '🌫️',
    match: color => {
      if (!color) {
        return false;
      }
      return color.hue >= 205 && color.hue < 235 && color.lightness < 0.52;
    },
  },
  {
    id: 'sky',
    label: 'Sky',
    icon: '☁️',
    match: color => {
      if (!color) {
        return false;
      }
      return color.hue >= 205 && color.hue < 235 && color.lightness >= 0.52;
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    icon: '🌊',
    match: color => {
      if (!color) {
        return false;
      }
      return color.hue >= 185 && color.hue < 205;
    },
  },
  {
    id: 'forest',
    label: 'Forest',
    icon: '🌲',
    match: color => {
      if (!color) {
        return false;
      }
      return color.hue >= 95 && color.hue < 185;
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    icon: '🌅',
    match: color => {
      if (!color) {
        return false;
      }
      return color.hue >= 25 && color.hue < 45;
    },
  },
  {
    id: 'rose',
    label: 'Rose',
    icon: '🌹',
    match: color => {
      if (!color) {
        return false;
      }
      return color.hue >= 330 || color.hue < 25;
    },
  },
  {
    id: 'lavender',
    label: 'Lavender',
    icon: '💜',
    match: color => {
      if (!color) {
        return false;
      }
      return color.hue >= 235 && color.hue < 330;
    },
  },
  {
    id: 'amber',
    label: 'Amber',
    icon: '🔶',
    match: color => {
      if (!color) {
        return false;
      }
      return color.hue >= 45 && color.hue < 95;
    },
  },
];

const FALLBACK_SOLID_CATEGORY: SolidCategoryDefinition = {
  id: 'spectrum',
  label: 'Spectrum',
  icon: '🎨',
  match: () => true,
};

const parseHexToRgb = (hex: string): { red: number; green: number; blue: number } | null => {
  const normalised = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{3}$/.test(normalised) && !/^[0-9a-fA-F]{6}$/.test(normalised)) {
    return null;
  }

  const expanded = normalised.length === 3
    ? normalised
        .split('')
        .map(character => character.repeat(2))
        .join('')
    : normalised;

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return { red, green, blue };
};

const rgbToHsl = ({
  red,
  green,
  blue,
}: {
  red: number;
  green: number;
  blue: number;
}): ParsedColor => {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    switch (max) {
      case r:
        hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        hue = ((b - r) / delta + 2) * 60;
        break;
      default:
        hue = ((r - g) / delta + 4) * 60;
        break;
    }
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return { hue, saturation, lightness };
};

const extractHexFromOption = (option: ColorTrayOption): string | null => {
  if (typeof option.value === 'string') {
    if (option.value.startsWith('#')) {
      return option.value;
    }
    if (option.value.startsWith('solid-')) {
      return `#${option.value.slice(6)}`;
    }
  }

  const backgroundColor = option.swatchStyle?.backgroundColor;
  if (typeof backgroundColor === 'string') {
    return backgroundColor;
  }

  if (option.id.startsWith('solid-')) {
    return `#${option.id.slice(6)}`;
  }

  return null;
};

const parseColor = (option: ColorTrayOption): ParsedColor | null => {
  const hex = extractHexFromOption(option);
  if (!hex) {
    return null;
  }

  const rgb = parseHexToRgb(hex);
  if (!rgb) {
    return null;
  }

  return rgbToHsl(rgb);
};

const groupSolidOptions = (options: readonly ColorTrayOption[]): SolidCategoryGroup[] => {
  const grouped = new Map<string, SolidCategoryGroup>();

  const assignToDefinition = (definition: SolidCategoryDefinition, option: ColorTrayOption) => {
    const existing = grouped.get(definition.id);
    if (existing) {
      existing.options.push(option);
      return;
    }
    grouped.set(definition.id, {
      id: definition.id,
      label: definition.label,
      icon: definition.icon,
      options: [option],
    });
  };

  options.forEach(option => {
    const color = parseColor(option);
    const matchedDefinition = SOLID_CATEGORY_DEFINITIONS.find(definition => definition.match(color, option));
    if (matchedDefinition) {
      assignToDefinition(matchedDefinition, option);
      return;
    }
    assignToDefinition(FALLBACK_SOLID_CATEGORY, option);
  });

  const orderedGroups: SolidCategoryGroup[] = [];
  SOLID_CATEGORY_DEFINITIONS.forEach(definition => {
    const group = grouped.get(definition.id);
    if (group && group.options.length > 0) {
      orderedGroups.push(group);
    }
  });
  const fallbackGroup = grouped.get(FALLBACK_SOLID_CATEGORY.id);
  if (fallbackGroup && fallbackGroup.options.length > 0) {
    orderedGroups.push(fallbackGroup);
  }

  return orderedGroups;
};

const isGradientOption = (option: ColorTrayOption): boolean => {
  if (option.swatchStyle?.backgroundImage || option.swatchStyle?.background) {
    return true;
  }
  if (typeof option.value === 'string') {
    return option.value.startsWith('gradient-');
  }
  return option.id.startsWith('gradient-');
};

const resolveDisplayValue = (option: ColorTrayOption): string | null => {
  if (typeof option.value === 'string') {
    if (option.value.startsWith('#')) {
      return option.value.toLowerCase();
    }
    if (option.value.startsWith('solid-')) {
      return `#${option.value.slice(6)}`;
    }
    if (option.value.startsWith('gradient-')) {
      return option.label ?? option.value;
    }
    return option.value;
  }

  if (option.id.startsWith('solid-')) {
    return `#${option.id.slice(6)}`;
  }

  return option.label ?? option.id;
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
  const resolvedSections = useMemo(() => {
    if (!sections || sections.length === 0) {
      return null;
    }
    return sections.map(section => ({
      ...section,
      options: section.options ?? [],
    }));
  }, [sections]);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(() => {
    if (!resolvedSections) {
      return null;
    }
    if (defaultSectionId) {
      const match = resolvedSections.find(section => section.id.toLowerCase() === defaultSectionId.toLowerCase());
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
    const hasActiveSelection = !!activeSectionId && resolvedSections.some(section => section.id === activeSectionId);

    if (!hasActiveSelection) {
      if (normalizedDefault) {
        const match = resolvedSections.find(section => section.id.toLowerCase() === normalizedDefault);
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

  const resolvedOptions = useMemo(() => {
    if (resolvedSections) {
      return resolvedSections.flatMap(section => section.options ?? []);
    }
    return legacyOptions ?? [];
  }, [legacyOptions, resolvedSections]);

  const resolvedSelectedId = selectedId?.toLowerCase() ?? null;

  const selectedOption = useMemo(() => {
    if (!resolvedSelectedId) {
      return null;
    }
    return resolvedOptions.find(option => option.id.toLowerCase() === resolvedSelectedId) ?? null;
  }, [resolvedOptions, resolvedSelectedId]);

  const selectedSwatchStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!selectedOption) {
      return undefined;
    }
    if (selectedOption.swatchStyle) {
      return selectedOption.swatchStyle;
    }
    if (selectedOption.value?.startsWith('#')) {
      return { backgroundColor: selectedOption.value };
    }
    if (selectedOption.id.startsWith('solid-')) {
      return { backgroundColor: `#${selectedOption.id.slice(6)}` };
    }
    return undefined;
  }, [selectedOption]);

  const renderEmptyState = () => (
    <div className="rounded-3xl border border-border/40 bg-card/70 p-6 text-center text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
      {emptyState ?? 'No colors available'}
    </div>
  );

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
        disabled={isDisabled}
        className={cn(
          'group relative flex items-center justify-center rounded-2xl bg-transparent transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isSelected
            ? 'rotate-[6deg] scale-[1.05] shadow-[0_16px_30px_rgba(15,23,42,0.16)] focus-visible:ring-primary/50'
            : 'hover:-translate-y-0.5 hover:rotate-[3deg] hover:shadow-[0_12px_22px_rgba(15,23,42,0.14)]',
          isDisabled && 'cursor-not-allowed opacity-50 hover:translate-y-0 hover:rotate-0 hover:shadow-none',
          optionClassName,
        )}
      >
        <span
          className={cn(
            'relative overflow-hidden rounded-2xl border border-border/40 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-all duration-200 dark:bg-card',
            'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] before:opacity-0 before:transition-opacity before:duration-200 group-hover:before:opacity-100',
            isSelected
              ? 'ring-2 ring-white/90 dark:ring-white/50'
              : 'group-hover:ring-2 group-hover:ring-white/80 dark:group-hover:ring-white/40',
            swatchSizeMap[swatchSize],
            option.swatchClassName,
          )}
          style={option.swatchStyle}
        >
          {option.preview ?? null}
          {isSelected ? (
            <span className="pointer-events-none absolute inset-0 rounded-[inherit] border border-white/80 shadow-[0_14px_22px_rgba(15,23,42,0.18)]" />
          ) : null}
        </span>
      </button>
    );
  };

  const renderSolidContent = (optionsToRender: readonly ColorTrayOption[]) => {
    const groups = groupSolidOptions(optionsToRender);
    if (groups.length === 0) {
      return renderEmptyState();
    }

    return (
      <div className="space-y-5">
        {groups.map(group => (
          <div
            key={group.id}
            className="rounded-3xl border border-border/30 bg-white/80 p-4 shadow-[0_6px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:bg-card/80"
          >
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-base shadow-inner ring-1 ring-border/20 dark:bg-background">
                {group.icon}
              </span>
              <span className="text-sm font-semibold text-muted-foreground/80">{group.label}</span>
              <span className="ml-auto h-px flex-1 rounded-full bg-gradient-to-r from-border/60 via-border/20 to-transparent" />
            </div>
            <div className="flex flex-wrap gap-2.5">
              {group.options.map(renderSwatch)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderGradientContent = (optionsToRender: readonly ColorTrayOption[]) => {
    if (optionsToRender.length === 0) {
      return renderEmptyState();
    }

    return (
      <div className="grid grid-cols-2 gap-3">
        {optionsToRender.map(renderSwatch)}
      </div>
    );
  };

  const renderGenericContent = (optionsToRender: readonly ColorTrayOption[]) => {
    if (optionsToRender.length === 0) {
      return renderEmptyState();
    }

    if (optionsToRender.some(isGradientOption)) {
      return renderGradientContent(optionsToRender);
    }

    if (columns && columns > 0) {
      return (
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {optionsToRender.map(renderSwatch)}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-2.5">
        {optionsToRender.map(renderSwatch)}
      </div>
    );
  };

  const renderSectionContent = (
    section: ColorTraySection | null,
    optionsToRender: readonly ColorTrayOption[],
  ) => {
    if (optionsToRender.length === 0) {
      return renderEmptyState();
    }

    if (section) {
      if (section.id.toLowerCase().includes('gradient')) {
        return renderGradientContent(optionsToRender);
      }
      return renderSolidContent(optionsToRender);
    }

    return renderGenericContent(optionsToRender);
  };

  const shouldRenderCustomPreview = (
    section: ColorTraySection | null,
    optionsToRender: readonly ColorTrayOption[],
  ) => {
    if (!selectedOption) {
      return false;
    }
    if (section && section.id.toLowerCase().includes('gradient')) {
      return false;
    }
    return !optionsToRender.some(isGradientOption);
  };

  const renderCustomPreview = () => {
    if (!selectedOption || !selectedSwatchStyle) {
      return null;
    }

    const displayValue = resolveDisplayValue(selectedOption);
    if (!displayValue) {
      return null;
    }

    return (
      <div className="mt-5 rounded-3xl border border-border/30 bg-white/80 p-4 text-left shadow-[0_8px_26px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:bg-card/80">
        <div className="flex items-center gap-3">
          <div
            className="h-12 w-12 rounded-2xl border border-border/40 shadow-inner"
            style={selectedSwatchStyle}
          />
          <input
            readOnly
            value={displayValue}
            className="flex-1 rounded-2xl border border-border/40 bg-muted/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground/90"
          />
        </div>
        <p className="mt-2 text-center text-[10px] font-medium text-muted-foreground/70">Custom color picker</p>
      </div>
    );
  };

  const renderSectionTabs = () => {
    if (!resolvedSections || resolvedSections.length === 0) {
      return null;
    }

    return (
      <Tabs
        value={activeSectionId ?? resolvedSections[0]?.id ?? ''}
        onValueChange={setActiveSectionId}
        className="w-full"
      >
        <div className="px-5 pt-5">
          <TabsList
            className="grid w-full gap-2 rounded-full bg-muted/30 p-1 shadow-inner"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, resolvedSections.length)}, minmax(0, 1fr))` }}
          >
            {resolvedSections.map(section => {
              const Icon = section.id.toLowerCase().includes('gradient') ? Sparkles : Droplet;
              return (
                <TabsTrigger
                  key={section.id}
                  value={section.id}
                  className="flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-[0_6px_20px_rgba(15,23,42,0.12)]"
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {resolvedSections.map(section => {
          const optionsForSection = section.options ?? [];
          return (
            <TabsContent key={section.id} value={section.id} className="mt-0 px-5 pb-5 pt-4">
              <ScrollArea className="max-h-[320px] pr-1">
                <div className="space-y-5">
                  {renderSectionContent(section, optionsForSection)}
                </div>
              </ScrollArea>
              {shouldRenderCustomPreview(section, optionsForSection) ? renderCustomPreview() : null}
            </TabsContent>
          );
        })}
      </Tabs>
    );
  };

  return (
    <div
      className={cn(
        'w-full max-w-[360px] rounded-3xl border border-border/40 bg-card shadow-[0_28px_50px_rgba(15,23,42,0.12)] backdrop-blur-lg',
        className,
      )}
    >
      {resolvedSections ? (
        renderSectionTabs()
      ) : (
        <div className="space-y-5 p-5">
          <ScrollArea className="max-h-[320px] pr-1">
            <div className="space-y-5">{renderSectionContent(null, resolvedOptions)}</div>
          </ScrollArea>
          {shouldRenderCustomPreview(null, resolvedOptions) ? renderCustomPreview() : null}
        </div>
      )}
    </div>
  );
};

export default ColorTray;
