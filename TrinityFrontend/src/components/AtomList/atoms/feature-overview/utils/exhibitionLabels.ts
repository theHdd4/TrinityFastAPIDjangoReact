import type {
  FeatureOverviewExhibitionComponentType,
  FeatureOverviewExhibitionSelectionChartState,
  FeatureOverviewExhibitionSelectionDimension,
} from '@/components/LaboratoryMode/store/laboratoryStore';

export type ExhibitionComponentTypeLike = FeatureOverviewExhibitionComponentType | undefined;

export interface ExhibitionDescriptorInput {
  metric?: string | null;
  dimensions?: Array<FeatureOverviewExhibitionSelectionDimension | null | undefined> | null;
  chartState?: FeatureOverviewExhibitionSelectionChartState | null | undefined;
}

export const sanitizeSegment = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

export const buildBaseDescriptor = ({
  metric,
  dimensions,
  chartState,
}: ExhibitionDescriptorInput): string => {
  const dimensionSegments = Array.isArray(dimensions)
    ? dimensions
        .map(dimension => {
          if (!dimension) {
            return '';
          }
          return sanitizeSegment(dimension.value) || sanitizeSegment(dimension.name);
        })
        .filter(Boolean)
    : [];

  const yAxisSegment =
    sanitizeSegment(chartState?.yAxisLabel) ||
    sanitizeSegment(chartState?.yAxisField) ||
    sanitizeSegment(metric);

  const segments = [...dimensionSegments, yAxisSegment].filter(Boolean);

  return segments.join(' - ');
};

export const buildDefaultEditableName = (input: ExhibitionDescriptorInput): string => {
  const baseDescriptor = buildBaseDescriptor(input);
  return baseDescriptor ? `The component details: ${baseDescriptor}` : 'The component details';
};

export const getComponentPrefix = (
  componentType?: ExhibitionComponentTypeLike,
): string => (componentType === 'trend_analysis' ? 'Trend Analysis' : 'SKU Stats');

export const buildDefaultHighlightedName = (
  input: ExhibitionDescriptorInput,
  componentType?: ExhibitionComponentTypeLike,
): string => {
  const defaultEditableName = buildDefaultEditableName(input);
  const prefix = getComponentPrefix(componentType);
  if (!prefix) {
    return defaultEditableName;
  }
  return defaultEditableName ? `${prefix} - ${defaultEditableName}` : prefix;
};

export const buildPrefixedDescriptor = (
  input: ExhibitionDescriptorInput,
  componentType?: ExhibitionComponentTypeLike,
): string => {
  const baseDescriptor = buildBaseDescriptor(input);
  const prefix = getComponentPrefix(componentType);
  if (!baseDescriptor) {
    return prefix;
  }
  return prefix ? `${prefix} - ${baseDescriptor}` : baseDescriptor;
};
