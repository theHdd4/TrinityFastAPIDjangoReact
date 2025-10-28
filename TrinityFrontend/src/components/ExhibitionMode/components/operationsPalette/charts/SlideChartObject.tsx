import React, { useCallback, useEffect, useImperativeHandle, useMemo, useState, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ChartDataEditor } from './ChartDataEditor';
import { SlideChart as ChartDisplay } from './SlideChart';
import {
  DEFAULT_CHART_CONFIG,
  DEFAULT_CHART_DATA,
  normalizeChartType,
} from './constants';
import type { ChartConfig, ChartDataRow, ChartType } from './types';

interface SlideChartObjectProps {
  data?: ChartDataRow[];
  config?: ChartConfig;
  canEdit: boolean;
  className?: string;
  onUpdate: (updates: { data?: ChartDataRow[]; config?: ChartConfig }) => void;
  onInteract: () => void;
}

export interface SlideChartObjectHandle {
  openDataEditor: () => void;
  setColorScheme: (schemeId: string) => void;
  setAlignment: (alignment: ChartConfig['horizontalAlignment']) => void;
  setChartType: (type: ChartType) => void;
}

export const SlideChartObject = forwardRef<SlideChartObjectHandle, SlideChartObjectProps>(({ 
  data = DEFAULT_CHART_DATA,
  config = DEFAULT_CHART_CONFIG,
  canEdit,
  className,
  onUpdate,
  onInteract,
}, ref) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const coerceData = useCallback(
    (rows?: ChartDataRow[]): ChartDataRow[] =>
      (rows && rows.length > 0 ? rows : DEFAULT_CHART_DATA).map(entry => ({ ...entry })),
    [],
  );

  const coerceConfig = useCallback(
    (value?: ChartConfig): ChartConfig => {
      const merged = { ...DEFAULT_CHART_CONFIG, ...(value ?? {}) } as ChartConfig;
      return {
        ...merged,
        type: normalizeChartType(merged.type),
      };
    },
    [],
  );

  const [previewData, setPreviewData] = useState<ChartDataRow[]>(() => coerceData(data));
  const [previewConfig, setPreviewConfig] = useState<ChartConfig>(() => coerceConfig(config));

  const dataSetsEqual = useCallback((left: ChartDataRow[], right: ChartDataRow[]): boolean => {
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      const a = left[index];
      const b = right[index];
      if (a.label !== b.label || a.value !== b.value) {
        return false;
      }
    }

    return true;
  }, []);

  const configShallowEqual = useCallback((a: ChartConfig, b: ChartConfig): boolean => {
    return (
      a.type === b.type &&
      a.colorScheme === b.colorScheme &&
      a.showLabels === b.showLabels &&
      a.showValues === b.showValues &&
      a.horizontalAlignment === b.horizontalAlignment &&
      a.axisIncludesZero === b.axisIncludesZero
    );
  }, []);

  useEffect(() => {
    setPreviewData(coerceData(data));
  }, [coerceData, data]);

  useEffect(() => {
    setPreviewConfig(coerceConfig(config));
  }, [coerceConfig, config]);

  const pushUpdates = useCallback(
    (
      updates: { data?: ChartDataRow[]; config?: ChartConfig },
      options: { closeEditor?: boolean } = {},
    ) => {
      const { closeEditor = false } = options;
      if (!canEdit) {
        if (closeEditor) {
          setIsEditorOpen(false);
        }
        return;
      }

      const hasDataUpdate = Array.isArray(updates.data);
      const hasConfigUpdate = Boolean(updates.config);

      if (!hasDataUpdate && !hasConfigUpdate) {
        if (closeEditor) {
          setIsEditorOpen(false);
        }
        return;
      }

      let nextData: ChartDataRow[] | undefined;
      let nextConfig: ChartConfig | undefined;

      if (hasDataUpdate) {
        const candidate = coerceData(updates.data);
        if (!dataSetsEqual(previewData, candidate)) {
          nextData = candidate;
          setPreviewData(candidate);
        }
      }

      if (hasConfigUpdate) {
        const candidate = coerceConfig(updates.config);
        if (!configShallowEqual(previewConfig, candidate)) {
          nextConfig = candidate;
          setPreviewConfig(candidate);
        }
      }

      if (!nextData && !nextConfig) {
        if (closeEditor) {
          setIsEditorOpen(false);
        }
        return;
      }

      onInteract();
      onUpdate({
        data: nextData ? nextData.map(entry => ({ ...entry })) : undefined,
        config: nextConfig ? { ...nextConfig } : undefined,
      });

      if (closeEditor) {
        setIsEditorOpen(false);
      }
    },
    [
      canEdit,
      coerceConfig,
      coerceData,
      configShallowEqual,
      dataSetsEqual,
      onInteract,
      onUpdate,
      previewConfig,
      previewData,
    ],
  );

  const handleConfigChange = (partial: Partial<ChartConfig>) => {
    pushUpdates({
      config: {
        ...previewConfig,
        ...partial,
      },
    });
  };

  const handleTypeChange = (type: ChartType) => {
    handleConfigChange({ type });
  };

  const handleColorSchemeChange = (schemeId: string) => {
    handleConfigChange({ colorScheme: schemeId });
  };

  const handleAlignmentChange = (alignment: ChartConfig['horizontalAlignment']) => {
    handleConfigChange({ horizontalAlignment: alignment });
  };

  const handleDataEditorSave = (rows: ChartDataRow[], nextConfig: ChartConfig) => {
    pushUpdates(
      {
        data: rows,
        config: nextConfig,
      },
      { closeEditor: true },
    );
  };

  const handleDataEditorApply = (rows: ChartDataRow[], nextConfig: ChartConfig) => {
    pushUpdates({
      data: rows,
      config: nextConfig,
    });
  };

  const safeData = useMemo(() => previewData.map(entry => ({ ...entry })), [previewData]);
  const safeConfig = useMemo(() => ({ ...previewConfig }), [previewConfig]);

  useImperativeHandle(
    ref,
    () => ({
      openDataEditor: () => {
        if (canEdit) {
          setIsEditorOpen(true);
        }
      },
      setColorScheme: handleColorSchemeChange,
      setAlignment: handleAlignmentChange,
      setChartType: handleTypeChange,
    }),
    [canEdit, handleAlignmentChange, handleColorSchemeChange, handleTypeChange],
  );

  return (
    <>
      <div className={cn('h-full w-full', className)}>
        <ChartDisplay data={safeData} config={safeConfig} className="h-full w-full" />
      </div>

      <ChartDataEditor
        open={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleDataEditorSave}
        onApply={handleDataEditorApply}
        initialData={safeData}
        initialConfig={safeConfig}
      />
    </>
  );
});

SlideChartObject.displayName = 'SlideChartObject';

export default SlideChartObject;
