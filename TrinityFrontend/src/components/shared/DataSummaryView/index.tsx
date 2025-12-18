/**
 * Unified Data Summary View Component
 * Provides consistent cardinality data with metadata support across all atoms
 * Uses CARDINALITY_VIEW_API (unified API for all atoms)
 */
import React from 'react';
import { useDataSummary } from './useDataSummary';
import { DataSummaryTable } from './DataSummaryTable';
import { DataSummaryViewProps } from './types';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

export const DataSummaryView: React.FC<DataSummaryViewProps> = ({
  objectName,
  atomId,
  borderColor,
  includeMetadata = true,
  title = "Data Summary",
  subtitle = "Data in detail",
  subtitleClickable = false,
  onSubtitleClick,
  controls,
  defaultMinimized,
}) => {
  const { data, loading, error, metadataAvailable } = useDataSummary(objectName, {
    includeMetadata,
  });

  // Auto-detect atom theme color if atomId is provided and borderColor is not explicitly set
  const atom = atomId ? useLaboratoryStore(state => state.getAtom(atomId)) : undefined;
  const resolvedBorderColor = React.useMemo(() => {
    // If borderColor is explicitly provided, use it
    if (borderColor) return borderColor;
    
    // Otherwise, try to get from atom's color property
    if (atom?.color) {
      // Convert 'bg-blue-500' to 'border-blue-500'
      const colorStr = atom.color.replace('bg-', 'border-');
      return colorStr;
    }
    
    // Default fallback
    return "border-gray-500";
  }, [borderColor, atom?.color]);

  return (
    <DataSummaryTable
      data={data}
      loading={loading}
      error={error}
      metadataAvailable={metadataAvailable}
      borderColor={resolvedBorderColor}
      title={title}
      subtitle={subtitle}
      subtitleClickable={subtitleClickable}
      onSubtitleClick={onSubtitleClick}
      controls={controls}
      defaultMinimized={defaultMinimized}
    />
  );
};

// Export types for external use
export type { DataSummaryViewProps, ColumnInfo, ColumnMetadata } from './types';
export { useDataSummary } from './useDataSummary';