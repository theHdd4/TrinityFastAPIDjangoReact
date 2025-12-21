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
import { Loader2 } from 'lucide-react';

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

  // Option C (UX): keep previous table content mounted while refreshing
  const [stickyData, setStickyData] = React.useState(data);

  React.useEffect(() => {
    // Only update the displayed dataset once a request has settled.
    // While loading, keep prior data to avoid a "loading screen" flash.
    if (!loading) {
      setStickyData(data);
    }
  }, [data, loading]);

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

  const hasStickyData = Array.isArray(stickyData) && stickyData.length > 0;

  // Keep the table visible when refreshing or when a refresh errors out.
  const effectiveData = loading && hasStickyData ? stickyData : data;
  const effectiveLoading = loading && !hasStickyData;
  const effectiveError = hasStickyData ? null : error;

  const mergedControls = React.useMemo(() => {
    if (!controls && !loading && !(error && hasStickyData)) return controls;
    return (
      <div className="flex items-center gap-2">
        {controls}
        {loading && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Refreshing
          </span>
        )}
        {!loading && error && hasStickyData && (
          <span className="text-xs text-red-600">Refresh failed</span>
        )}
      </div>
    );
  }, [controls, error, hasStickyData, loading]);

  return (
    <DataSummaryTable
      data={effectiveData}
      loading={effectiveLoading}
      error={effectiveError}
      metadataAvailable={metadataAvailable}
      borderColor={resolvedBorderColor}
      title={title}
      subtitle={subtitle}
      subtitleClickable={subtitleClickable}
      onSubtitleClick={onSubtitleClick}
      controls={mergedControls}
      defaultMinimized={defaultMinimized}
    />
  );
};

// Export types for external use
export type { DataSummaryViewProps, ColumnInfo, ColumnMetadata } from './types';
export { useDataSummary } from './useDataSummary';