import React from 'react';
import clsx from 'clsx';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { atomCategories } from '@/components/AtomCategory/data/atomCategories';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, ChevronLeft, FolderKanban, GalleryHorizontal, Image } from 'lucide-react';
import {
  buildBaseDescriptor,
  buildDefaultHighlightedName,
  buildPrefixedDescriptor,
  sanitizeSegment,
} from '@/components/AtomList/atoms/feature-overview/utils/exhibitionLabels';
import ExhibitionFeatureOverview from '@/components/ExhibitionMode/components/atoms/FeatureOverview';
import type { FeatureOverviewExhibitionComponentType } from '@/components/LaboratoryMode/store/laboratoryStore';
import { DroppedAtom, LayoutCard } from '../store/exhibitionStore';

type SlideIndexLookup = ReadonlyMap<string, number> | Record<string, number>;

interface ExhibitionCatalogueProps {
  cards: LayoutCard[];
  currentSlide: number;
  onSlideSelect?: (index: number) => void;
  slideIndexByCardId?: SlideIndexLookup;
  onDragStart?: (atom: DroppedAtom, cardId: string, origin: 'catalogue' | 'slide') => void;
  onDragEnd?: () => void;
  enableDragging?: boolean;
  onCollapse?: () => void;
}

interface AtomInfo {
  title: string;
  icon: LucideIcon;
  color: string;
}

interface CatalogueAtomEntry {
  atom: DroppedAtom;
  cardId: string;
}

interface CatalogueAtomGroup {
  key: string;
  info: AtomInfo;
  entries: CatalogueAtomEntry[];
}

const resolveSlideIndexFromLookup = (lookup: SlideIndexLookup | undefined, cardId: string): number | undefined => {
  if (!lookup) {
    return undefined;
  }

  if (lookup instanceof Map) {
    const mapped = lookup.get(cardId);
    return typeof mapped === 'number' ? mapped : undefined;
  }

  const mapped = lookup[cardId];
  return typeof mapped === 'number' ? mapped : undefined;
};

const getComponentTypeFromMetadata = (metadata: Record<string, any> | undefined): FeatureOverviewExhibitionComponentType => {
  const viewType = typeof metadata?.viewType === 'string' ? metadata.viewType : undefined;
  return viewType === 'trend_analysis' ? 'trend_analysis' : 'statistical_summary';
};

const CatalogueComponentCard: React.FC<{
  entry: CatalogueAtomEntry;
  enableDragging: boolean;
  onDragStart?: (atom: DroppedAtom, cardId: string, origin: 'catalogue' | 'slide') => void;
  onDragEnd?: () => void;
  onSelectSlide?: () => void;
  isActive?: boolean;
}> = ({ entry, enableDragging, onDragStart, onDragEnd, onSelectSlide, isActive }) => {
  const { atom, cardId } = entry;
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);

  const metadata = React.useMemo(() => {
    if (!atom || typeof atom !== 'object') {
      return undefined;
    }
    return (atom.metadata && typeof atom.metadata === 'object' ? atom.metadata : undefined) as
      | Record<string, any>
      | undefined;
  }, [atom]);

  const componentType = getComponentTypeFromMetadata(metadata);
  const descriptorInput = {
    metric: metadata?.metric,
    dimensions: Array.isArray(metadata?.dimensions) ? metadata?.dimensions : undefined,
    chartState: metadata?.chartState,
  };

  const defaultHighlightedName = buildDefaultHighlightedName(descriptorInput, componentType);
  const highlightedName = sanitizeSegment(typeof metadata?.label === 'string' ? metadata?.label : atom.title) || defaultHighlightedName;
  const baseDescriptor = buildBaseDescriptor(descriptorInput) || 'Not specified';
  const displayActualName = buildPrefixedDescriptor(descriptorInput, componentType);

  const highlightBackgroundClass =
    typeof atom.color === 'string' && atom.color.trim().length > 0 ? atom.color.trim() : 'bg-amber-100';

  const showComponentTitle = Boolean(metadata?.exhibitionControls?.enableComponentTitle);

  const handleTogglePreview = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsPreviewOpen(prev => !prev);
  };

  const handleSelectSlide = () => {
    if (onSelectSlide) {
      onSelectSlide();
    }
  };

  const handleDragStartInternal = (event: React.DragEvent<HTMLDivElement>) => {
    if (!enableDragging || !onDragStart) {
      return;
    }

    try {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/json', JSON.stringify({ atomId: atom.id }));
    } catch {
      /* ignore dataTransfer issues */
    }

    onDragStart(atom, cardId, 'catalogue');
  };

  const handleDragEndInternal = () => {
    if (enableDragging) {
      onDragEnd?.();
    }
  };

  const cardClasses = clsx(
    'rounded-lg border border-gray-200 bg-white/80 px-3 py-3 shadow-sm space-y-3 transition-colors',
    enableDragging && onDragStart ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
    isActive && 'border-emerald-300 ring-2 ring-emerald-200',
  );

  return (
    <div
      className={cardClasses}
      draggable={enableDragging && Boolean(onDragStart)}
      onDragStart={handleDragStartInternal}
      onDragEnd={handleDragEndInternal}
      onClick={handleSelectSlide}
      role={onSelectSlide ? 'button' : undefined}
      tabIndex={onSelectSlide ? 0 : undefined}
      onKeyDown={event => {
        if (!onSelectSlide) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectSlide();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className={clsx('flex w-full flex-wrap items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold text-black shadow-sm', highlightBackgroundClass, 'justify-between')}>
            <span className="truncate">{highlightedName}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            onClick={handleTogglePreview}
            aria-expanded={isPreviewOpen}
            aria-label="Toggle preview"
          >
            <ChevronDown className={clsx('h-4 w-4 transition-transform', isPreviewOpen && 'rotate-180')} />
          </button>
        </div>
      </div>

      <p className="text-xs font-medium text-gray-700">{displayActualName || baseDescriptor}</p>

      {isPreviewOpen && (
        <div className="space-y-4 border-t border-gray-200 pt-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
              <Image className="h-3.5 w-3.5" />
              Preview snapshot
            </div>
            <div className="mt-2 rounded-md border border-gray-200 bg-white/80 p-2">
              <div className="pointer-events-none select-none">
                <div className="overflow-auto">
                  <ExhibitionFeatureOverview metadata={metadata} variant="full" />
                </div>
                {showComponentTitle && (
                  <p className="mt-3 text-center text-sm font-semibold text-gray-900">{displayActualName || baseDescriptor}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ExhibitionCatalogue: React.FC<ExhibitionCatalogueProps> = ({
  cards,
  currentSlide,
  onSlideSelect,
  slideIndexByCardId,
  onDragStart,
  onDragEnd,
  enableDragging = true,
  onCollapse,
}) => {
  const fallbackAtomInfo = React.useMemo<AtomInfo>(
    () => ({ title: 'Atom', icon: FolderKanban, color: 'bg-slate-500' }),
    [],
  );

  const atomInfoMap = React.useMemo(() => {
    const map = new Map<string, AtomInfo>();
    atomCategories.forEach(category => {
      category.atoms.forEach(atom => {
        map.set(atom.id, { title: atom.title, icon: category.icon, color: category.color });
      });
    });
    return map;
  }, []);

  const groups = React.useMemo<CatalogueAtomGroup[]>(() => {
    const groupMap = new Map<string, CatalogueAtomGroup>();

    cards.forEach(card => {
      const availableAtoms = Array.isArray(card.catalogueAtoms) ? card.catalogueAtoms : [];

      availableAtoms.forEach(atom => {
        const metadata = (atom.metadata && typeof atom.metadata === 'object' ? atom.metadata : undefined) as
          | Record<string, any>
          | undefined;

        const rawTitle =
          typeof metadata?.sourceAtomTitle === 'string' && metadata.sourceAtomTitle.trim().length > 0
            ? metadata.sourceAtomTitle.trim()
            : typeof atom.title === 'string'
              ? atom.title.trim()
              : '';

        const typeId = typeof atom.atomId === 'string' && atom.atomId.trim().length > 0 ? atom.atomId.trim() : 'unknown';
        const info = atomInfoMap.get(typeId) ?? fallbackAtomInfo;
        const resolvedTitle = rawTitle || info.title;
        const key = `${typeId}::${resolvedTitle.toLowerCase()}`;

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            key,
            info: {
              title: resolvedTitle,
              icon: info.icon,
              color: info.color,
            },
            entries: [],
          });
        }

        groupMap.get(key)?.entries.push({ atom, cardId: card.id });
      });
    });

    return Array.from(groupMap.values());
  }, [atomInfoMap, cards, fallbackAtomInfo]);

  const totalComponents = React.useMemo(
    () => groups.reduce((acc, group) => acc + group.entries.length, 0),
    [groups],
  );

  const [expandedGroupKey, setExpandedGroupKey] = React.useState<string | null>(null);
  const hasInitialisedExpandedGroupRef = React.useRef(false);

  React.useEffect(() => {
    if (groups.length === 0) {
      if (expandedGroupKey !== null) {
        setExpandedGroupKey(null);
      }
      hasInitialisedExpandedGroupRef.current = false;
      return;
    }

    const hasActive = expandedGroupKey ? groups.some(group => group.key === expandedGroupKey) : false;
    if (expandedGroupKey && !hasActive) {
      setExpandedGroupKey(groups[0]?.key ?? null);
      return;
    }

    if (!hasInitialisedExpandedGroupRef.current) {
      hasInitialisedExpandedGroupRef.current = true;
      setExpandedGroupKey(current => {
        if (current && groups.some(group => group.key === current)) {
          return current;
        }

        return groups[0]?.key ?? null;
      });
    }
  }, [groups, expandedGroupKey]);

  return (
    <div className="w-80 h-full bg-white border-r border-gray-200 flex flex-col">
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GalleryHorizontal className="w-4 h-4 text-gray-700" />
          <h3 className="font-semibold text-gray-900">Exhibition Catalogue</h3>
          <Badge variant="secondary" className="ml-1">
            {totalComponents} {totalComponents === 1 ? 'item' : 'items'}
          </Badge>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Collapse catalogue"
            aria-label="Collapse catalogue"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {groups.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-xs text-gray-600">
              Stage feature overview components for exhibition to see them catalogued here.
            </div>
          ) : (
            groups.map(group => {
              const Icon = group.info.icon ?? FolderKanban;
              const isExpanded = expandedGroupKey === group.key;
              const totalLabel =
                group.entries.length === 1 ? '1 component' : `${group.entries.length} components`;

              return (
                <div
                  key={group.key}
                  className="rounded-xl border border-gray-200 bg-white/70 shadow-sm transition hover:border-gray-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-3 px-4 py-3 text-left"
                      onClick={() =>
                        setExpandedGroupKey(current => (current === group.key ? null : group.key))
                      }
                    >
                      <span
                        className={clsx(
                          'flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm',
                          group.info.color,
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-gray-900">{group.info.title}</span>
                        <span className="text-xs text-gray-500">{totalLabel}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      onClick={() =>
                        setExpandedGroupKey(current => (current === group.key ? null : group.key))
                      }
                      aria-expanded={isExpanded}
                      aria-controls={`${group.key}-catalogue-list`}
                    >
                      <ChevronDown
                        className={clsx('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
                      />
                      <span className="sr-only">Toggle {group.info.title} catalogue list</span>
                    </button>
                  </div>
                  <div
                    className={clsx(
                      'space-y-4 border-t border-gray-200 bg-white/80 px-4 py-4',
                      !isExpanded && 'hidden',
                    )}
                    id={`${group.key}-catalogue-list`}
                    aria-hidden={!isExpanded}
                  >
                    {group.entries.map(entry => {
                      const slideIndex = resolveSlideIndexFromLookup(slideIndexByCardId, entry.cardId);
                      const isLinkedToSlide = typeof slideIndex === 'number';
                      const isActive = isLinkedToSlide && slideIndex === currentSlide;

                      return (
                        <CatalogueComponentCard
                          key={`${entry.cardId}-${entry.atom.id}`}
                          entry={entry}
                          enableDragging={enableDragging}
                          onDragStart={onDragStart}
                          onDragEnd={onDragEnd}
                          onSelectSlide={
                            isLinkedToSlide && onSlideSelect
                              ? () => onSlideSelect(slideIndex)
                              : undefined
                          }
                          isActive={isActive}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ExhibitionCatalogue;
