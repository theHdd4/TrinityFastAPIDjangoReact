import React from 'react';
import PivotTableCanvas from './components/PivotTableCanvas';
import PivotTableProperties from './components/PivotTableProperties';
import {
  useLaboratoryStore,
  PivotTableSettings,
  DEFAULT_PIVOT_TABLE_SETTINGS,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { PIVOT_API } from '@/lib/api';

interface PivotTableAtomProps {
  atomId: string;
}

const PivotTableAtom: React.FC<PivotTableAtomProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: PivotTableSettings = {
    ...DEFAULT_PIVOT_TABLE_SETTINGS,
    ...(atom?.settings as PivotTableSettings),
  };

  const [isComputing, setIsComputing] = React.useState(false);
  const [computeError, setComputeError] = React.useState<string | null>(null);
  const [manualRefreshToken, setManualRefreshToken] = React.useState(0);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const optionsMap = settings.pivotFilterOptions ?? {};
    const selectionsMap = settings.pivotFilterSelections ?? {};
    let updated = false;
    const nextSelections: Record<string, string[]> = { ...selectionsMap };

    const normalize = (field: string) => field.toLowerCase();

    settings.filterFields.forEach((field) => {
      const key = normalize(field);
      const existing = selectionsMap[field] ?? selectionsMap[key];
      if (!existing || existing.length === 0) {
        const options = optionsMap[field] ?? optionsMap[key] ?? [];
        nextSelections[field] = options;
        nextSelections[key] = options;
        updated = true;
      }
    });

    Object.keys(nextSelections).forEach((key) => {
      const canonicalField = settings.filterFields.find(
        (field) => key === field || key === field.toLowerCase()
      );
      if (!canonicalField) {
        delete nextSelections[key];
        updated = true;
      }
    });

    if (updated) {
      updateSettings(atomId, { pivotFilterSelections: nextSelections });
    }
  }, [atomId, settings.filterFields, settings.pivotFilterOptions, updateSettings]);

  React.useEffect(() => {
    if (!atom?.settings) {
      updateSettings(atomId, { ...DEFAULT_PIVOT_TABLE_SETTINGS });
    }
  }, [atom?.settings, atomId, updateSettings]);

  const handleDataChange = React.useCallback(
    (newData: Partial<PivotTableSettings>) => {
      const latestAtom = useLaboratoryStore.getState().getAtom(atomId);
      const latestSettings: PivotTableSettings = {
        ...DEFAULT_PIVOT_TABLE_SETTINGS,
        ...(latestAtom?.settings as PivotTableSettings),
      };

      updateSettings(atomId, {
        ...latestSettings,
        ...newData,
      });
    },
    [atomId, updateSettings]
  );

  const computeSignature = React.useMemo(() => {
    const selectionsSnapshot = settings.filterFields.reduce<Record<string, string[]>>((acc, field) => {
      const key = field.toLowerCase();
      const selection =
        settings.pivotFilterSelections?.[field] ??
        settings.pivotFilterSelections?.[key];
      if (selection) {
        acc[field] = [...selection].sort();
      }
      return acc;
    }, {});
    const payload = {
      dataSource: settings.dataSource,
      rows: settings.rowFields,
      columns: settings.columnFields,
      values: settings.valueFields,
      filters: settings.filterFields,
      selections: selectionsSnapshot,
      grandTotals: settings.grandTotalsMode,
    };
    return JSON.stringify(payload);
  }, [
    settings.dataSource,
    settings.rowFields,
    settings.columnFields,
    settings.valueFields,
    settings.filterFields,
    settings.pivotFilterSelections,
    settings.grandTotalsMode,
  ]);

  React.useEffect(() => {
    setSaveMessage(null);
    setSaveError(null);

    const readyForCompute =
      !!settings.dataSource &&
      Array.isArray(settings.valueFields) &&
      settings.valueFields.length > 0;

    if (!readyForCompute) {
      setIsComputing(false);
      setComputeError(null);
      return;
    }

    const controller = new AbortController();

    const runCompute = async () => {
      setIsComputing(true);
      setComputeError(null);
      updateSettings(atomId, {
        pivotStatus: 'pending',
        pivotError: null,
      });

      try {
        const payload = {
          data_source: settings.dataSource,
          rows: settings.rowFields.filter(Boolean),
          columns: settings.columnFields.filter(Boolean),
          values: settings.valueFields
            .filter((item) => item?.field)
            .map((item) => ({
              field: item.field,
              aggregation: item.aggregation || 'sum',
            })),
          filters: settings.filterFields.filter(Boolean).map((field) => {
            const key = field.toLowerCase();
            const selections =
              settings.pivotFilterSelections?.[field] ??
              settings.pivotFilterSelections?.[key] ?? [];
            const options =
              settings.pivotFilterOptions?.[field] ??
              settings.pivotFilterOptions?.[key] ?? [];

            const includeValues =
              selections.length > 0 && selections.length !== options.length
                ? selections
                : undefined;

            return includeValues
              ? { field, include: includeValues }
              : { field };
          }),
          grand_totals: settings.grandTotalsMode || 'both',
        };

        const response = await fetch(
          `${PIVOT_API}/${encodeURIComponent(atomId)}/compute`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Pivot compute failed (${response.status})`);
        }

        const result = await response.json();
        updateSettings(atomId, {
          pivotResults: result?.data ?? [],
          pivotStatus: result?.status ?? 'success',
          pivotError: null,
          pivotUpdatedAt: result?.updated_at,
          pivotRowCount: result?.rows,
          pivotHierarchy: Array.isArray(result?.hierarchy) ? result.hierarchy : [],
          collapsedKeys: [],
        });
        setIsComputing(false);
        setComputeError(null);
      } catch (error) {
        if ((error as any)?.name === 'AbortError') {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : 'Pivot computation failed. Please try again.';
        setIsComputing(false);
        setComputeError(message);
        updateSettings(atomId, {
          pivotStatus: 'failed',
          pivotError: message,
        });
      }
    };

    runCompute();

    return () => {
      controller.abort();
    };
  }, [atomId, computeSignature, manualRefreshToken, settings.valueFields, settings.dataSource, settings.rowFields, settings.columnFields, settings.filterFields, updateSettings]);

  const handleRefresh = React.useCallback(() => {
    setManualRefreshToken((prev) => prev + 1);
  }, []);

  const handleSave = React.useCallback(async () => {
    if (!settings.dataSource || !(settings.pivotResults?.length ?? 0)) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const response = await fetch(
        `${PIVOT_API}/${encodeURIComponent(atomId)}/save`,
        {
          method: 'POST',
        }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Pivot save failed (${response.status})`);
      }
      const result = await response.json();
      const message = result?.object_name
        ? `Saved pivot to ${result.object_name}`
        : 'Pivot table saved successfully';
      setSaveMessage(message);
      updateSettings(atomId, {
        pivotLastSavedPath: result?.object_name ?? null,
        pivotLastSavedAt: result?.updated_at ?? null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save pivot table. Please try again.';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }, [atomId, settings.dataSource, settings.pivotResults, updateSettings]);

  const readinessMessage = React.useMemo(() => {
    if (!settings.dataSource) {
      return 'Select a data source from the Input Files tab to generate a pivot table.';
    }
    if (!settings.valueFields || settings.valueFields.length === 0) {
      return 'Add at least one field to the Values area to compute the pivot table.';
    }
    return null;
  }, [settings.dataSource, settings.valueFields]);

  const handleReportLayoutChange = React.useCallback(
    (layout: 'compact' | 'outline' | 'tabular') => {
      handleDataChange({ reportLayout: layout });
    },
    [handleDataChange],
  );

  const handleToggleCollapse = React.useCallback(
    (key: string) => {
      const current = new Set(settings.collapsedKeys ?? []);
      if (current.has(key)) {
        current.delete(key);
      } else {
        current.add(key);
      }
      handleDataChange({ collapsedKeys: Array.from(current) });
    },
    [handleDataChange, settings.collapsedKeys],
  );

  return (
    <div className="w-full h-full">
      <PivotTableCanvas
        data={settings}
        onDataChange={handleDataChange}
        isLoading={isComputing}
        error={computeError}
        infoMessage={readinessMessage}
        isSaving={isSaving}
        saveError={saveError}
        saveMessage={
          saveMessage ||
          (settings.pivotLastSavedPath
            ? `Last saved: ${settings.pivotLastSavedPath}`
            : null)
        }
        onRefresh={handleRefresh}
        onSave={handleSave}
        filterOptions={settings.pivotFilterOptions ?? {}}
        filterSelections={settings.pivotFilterSelections ?? {}}
        onGrandTotalsChange={(mode) =>
          handleDataChange({ grandTotalsMode: mode })
        }
        onStyleChange={(styleId) =>
          handleDataChange({ pivotStyleId: styleId })
        }
        onStyleOptionsChange={(options) =>
          handleDataChange({ pivotStyleOptions: options })
        }
        reportLayout={settings.reportLayout ?? 'compact'}
        onReportLayoutChange={handleReportLayoutChange}
        collapsedKeys={settings.collapsedKeys ?? []}
        onToggleCollapse={handleToggleCollapse}
      />
    </div>
  );
};

export { PivotTableProperties };
export default PivotTableAtom;

