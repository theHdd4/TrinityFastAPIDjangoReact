import React from 'react';
import PivotTableCanvas from './components/PivotTableCanvas';
import PivotTableProperties from './components/PivotTableProperties';
import {
  useLaboratoryStore,
  PivotTableSettings,
  DEFAULT_PIVOT_TABLE_SETTINGS,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { PIVOT_API } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
  const [showSaveAsModal, setShowSaveAsModal] = React.useState(false);
  const [saveAsFileName, setSaveAsFileName] = React.useState('');

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

  // Clear column and value fields when rowFields becomes empty
  React.useEffect(() => {
    if (!settings.rowFields || settings.rowFields.length === 0) {
      const hasColumns = settings.columnFields && settings.columnFields.length > 0;
      const hasValues = settings.valueFields && settings.valueFields.length > 0;
      
      if (hasColumns || hasValues) {
        updateSettings(atomId, {
          columnFields: [],
          valueFields: [],
          pivotResults: [],
          pivotColumnHierarchy: [],
          pivotStatus: 'pending',
          pivotError: null,
        });
      }
    }
  }, [atomId, settings.rowFields, settings.columnFields, settings.valueFields, updateSettings]);

  // Clear column hierarchy when columnFields becomes empty
  React.useEffect(() => {
    if (!settings.columnFields || settings.columnFields.length === 0) {
      if (settings.pivotColumnHierarchy && settings.pivotColumnHierarchy.length > 0) {
        updateSettings(atomId, {
          pivotColumnHierarchy: [],
        });
      }
    }
  }, [atomId, settings.columnFields, settings.pivotColumnHierarchy, updateSettings]);

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
    // Collect filter selections from:
    // 1. Fields in filterFields (dedicated filter bucket)
    // 2. Row fields with filter selections
    // 3. Column fields with filter selections
    const fieldsToCheck = new Set<string>();
    settings.filterFields.filter(Boolean).forEach(field => fieldsToCheck.add(field));
    settings.rowFields.filter(Boolean).forEach(field => {
      const key = field.toLowerCase();
      const selections = settings.pivotFilterSelections?.[field] ?? settings.pivotFilterSelections?.[key] ?? [];
      if (selections.length > 0) {
        fieldsToCheck.add(field);
      }
    });
    settings.columnFields.filter(Boolean).forEach(field => {
      const key = field.toLowerCase();
      const selections = settings.pivotFilterSelections?.[field] ?? settings.pivotFilterSelections?.[key] ?? [];
      if (selections.length > 0) {
        fieldsToCheck.add(field);
      }
    });
    
    const selectionsSnapshot = Array.from(fieldsToCheck).reduce<Record<string, string[]>>((acc, field) => {
      const key = field.toLowerCase();
      const selection =
        settings.pivotFilterSelections?.[field] ??
        settings.pivotFilterSelections?.[key];
      if (selection) {
        acc[field] = [...selection].sort();
      }
      return acc;
    }, {});
    
    // Normalize sorting for signature (similar to how it's done in the API call)
    const sortingSnapshot: Record<string, { type: string; level?: number; preserve_hierarchy?: boolean }> = {};
    if (settings.pivotSorting) {
      Object.entries(settings.pivotSorting).forEach(([field, config]) => {
        if (config && typeof config === 'object' && 'type' in config) {
          // Use the exact field name from rowFields/columnFields to ensure case matching
          const exactField = settings.rowFields.find(f => f.toLowerCase() === field.toLowerCase()) ||
                            settings.columnFields.find(f => f.toLowerCase() === field.toLowerCase()) ||
                            field;
          
          // Determine hierarchy level for this field
          const fieldIndex = settings.rowFields.findIndex(f => f.toLowerCase() === field.toLowerCase());
          const level = fieldIndex >= 0 ? fieldIndex : undefined;
          
          sortingSnapshot[exactField] = {
            type: config.type,
            level: config.level !== undefined ? config.level : level,
            preserve_hierarchy: config.preserve_hierarchy !== undefined ? config.preserve_hierarchy : true,
          };
        }
      });
    }
    
    const payload = {
      dataSource: settings.dataSource,
      rows: settings.rowFields,
      columns: settings.columnFields,
      values: settings.valueFields,
      filters: settings.filterFields,
      selections: selectionsSnapshot,
      grandTotals: settings.grandTotalsMode,
      sorting: sortingSnapshot,
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
    settings.pivotSorting,
  ]);

  React.useEffect(() => {
    setSaveMessage(null);
    setSaveError(null);

    const readyForCompute =
      !!settings.dataSource &&
      Array.isArray(settings.rowFields) &&
      settings.rowFields.length > 0 &&
      Array.isArray(settings.valueFields) &&
      settings.valueFields.length > 0;

    if (!readyForCompute) {
      setIsComputing(false);
      setComputeError(null);
      updateSettings(atomId, {
        pivotResults: [],
        pivotStatus: 'pending',
        pivotError: null,
      });
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
        const sortingPayload: Record<string, { type: string; level?: number; preserve_hierarchy?: boolean }> = {};
        if (settings.pivotSorting) {
          Object.entries(settings.pivotSorting).forEach(([field, config]) => {
            if (config && typeof config === 'object' && 'type' in config) {
              // Use the exact field name from rowFields/columnFields to ensure case matching
              const exactField = settings.rowFields.find(f => f.toLowerCase() === field.toLowerCase()) ||
                                settings.columnFields.find(f => f.toLowerCase() === field.toLowerCase()) ||
                                field;
              
              // Determine hierarchy level for this field
              const fieldIndex = settings.rowFields.findIndex(f => f.toLowerCase() === field.toLowerCase());
              const level = fieldIndex >= 0 ? fieldIndex : undefined;
              
              sortingPayload[exactField] = {
                type: config.type,
                level: config.level !== undefined ? config.level : level,
                preserve_hierarchy: config.preserve_hierarchy !== undefined ? config.preserve_hierarchy : true,
              };
            }
          });
        }
        
        console.log('Sorting payload before send:', sortingPayload);
        console.log('Row fields:', settings.rowFields);
        console.log('Column fields:', settings.columnFields);

        const payload = {
          data_source: settings.dataSource,
          rows: settings.rowFields.filter(Boolean),
          columns: settings.columnFields.filter(Boolean),
          values: settings.valueFields
            .filter((item) => item?.field)
            .map((item) => ({
              field: item.field,
              aggregation: item.aggregation || 'sum',
              weight_column: item.weightColumn || undefined,
            })),
          filters: (() => {
            // Collect all fields that need filtering:
            // 1. Fields in filterFields (dedicated filter bucket)
            // 2. Row fields with filter selections
            // 3. Column fields with filter selections
            const fieldsToFilter = new Set<string>();
            
            // Add filterFields
            settings.filterFields.filter(Boolean).forEach(field => fieldsToFilter.add(field));
            
            // Add row fields that have filter selections
            settings.rowFields.filter(Boolean).forEach(field => {
              const key = field.toLowerCase();
              const selections = settings.pivotFilterSelections?.[field] ?? settings.pivotFilterSelections?.[key] ?? [];
              if (selections.length > 0) {
                fieldsToFilter.add(field);
              }
            });
            
            // Add column fields that have filter selections
            settings.columnFields.filter(Boolean).forEach(field => {
              const key = field.toLowerCase();
              const selections = settings.pivotFilterSelections?.[field] ?? settings.pivotFilterSelections?.[key] ?? [];
              if (selections.length > 0) {
                fieldsToFilter.add(field);
              }
            });
            
            return Array.from(fieldsToFilter).map((field) => {
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
            });
          })(),
          sorting: sortingPayload,
          grand_totals: settings.grandTotalsMode || 'off',
        };

        console.log('Pivot compute payload:', JSON.stringify(payload, null, 2));

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
          pivotColumnHierarchy: Array.isArray(result?.column_hierarchy)
            ? result.column_hierarchy
            : [],
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
      // Save without filename to overwrite existing file
      const response = await fetch(
        `${PIVOT_API}/${encodeURIComponent(atomId)}/save`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      if (!response.ok) {
        let errorMessage = `Pivot save failed (${response.status})`;
        try {
          const contentType = response.headers.get('content-type');
          const text = await response.text();
          
          if (contentType && contentType.includes('application/json')) {
            try {
              const errorData = JSON.parse(text);
              // Try to extract detailed error message from various possible formats
              errorMessage = errorData?.detail || 
                            errorData?.message || 
                            errorData?.error || 
                            (typeof errorData === 'string' ? errorData : JSON.stringify(errorData, null, 2)) ||
                            text ||
                            errorMessage;
            } catch {
              // If JSON parsing fails, use the text as-is
              errorMessage = text || errorMessage;
            }
          } else {
            errorMessage = text || errorMessage;
          }
        } catch (parseError) {
          // Keep default error message if we can't read the response
          errorMessage = `Pivot save failed (${response.status}). Unable to read error details.`;
        }
        throw new Error(errorMessage);
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

  const handleSaveAs = React.useCallback(() => {
    // Generate default filename based on config_id and timestamp
    const defaultFilename = `pivot_${atomId}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    setSaveAsFileName(defaultFilename);
    setShowSaveAsModal(true);
  }, [atomId]);

  const confirmSaveAs = React.useCallback(async () => {
    if (!settings.dataSource || !(settings.pivotResults?.length ?? 0)) {
      return;
    }
    if (!saveAsFileName.trim()) {
      setSaveError('Please enter a filename');
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: saveAsFileName.trim() }),
        }
      );
      if (!response.ok) {
        let errorMessage = `Pivot save failed (${response.status})`;
        try {
          const contentType = response.headers.get('content-type');
          const text = await response.text();
          
          if (contentType && contentType.includes('application/json')) {
            try {
              const errorData = JSON.parse(text);
              // Try to extract detailed error message from various possible formats
              errorMessage = errorData?.detail || 
                            errorData?.message || 
                            errorData?.error || 
                            (typeof errorData === 'string' ? errorData : JSON.stringify(errorData, null, 2)) ||
                            text ||
                            errorMessage;
            } catch {
              // If JSON parsing fails, use the text as-is
              errorMessage = text || errorMessage;
            }
          } else {
            errorMessage = text || errorMessage;
          }
        } catch (parseError) {
          // Keep default error message if we can't read the response
          errorMessage = `Pivot save failed (${response.status}). Unable to read error details.`;
        }
        throw new Error(errorMessage);
      }
      const result = await response.json();
      const message = result?.object_name
        ? `Saved pivot as ${result.object_name}`
        : 'Pivot table saved successfully';
      setSaveMessage(message);
      setShowSaveAsModal(false);
      setSaveAsFileName('');
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
  }, [atomId, settings.dataSource, settings.pivotResults, saveAsFileName, updateSettings]);

  const readinessMessage = React.useMemo(() => {
    if (!settings.dataSource) {
      return 'Select a data source from the Input Files tab to generate a pivot table.';
    }
    if (!settings.valueFields || settings.valueFields.length === 0) {
      return 'Add at least one field to the Values area to compute the pivot table.';
    }
    if (!settings.rowFields || settings.rowFields.length === 0) {
      return 'Add at least one field to the Rows area to generate the pivot table.';
    }
    return null;
  }, [settings.dataSource, settings.valueFields, settings.rowFields]);

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
        onSaveAs={handleSaveAs}
        filterOptions={settings.pivotFilterOptions ?? {}}
        filterSelections={settings.pivotFilterSelections ?? {}}
        onGrandTotalsChange={(mode) =>
          handleDataChange({ grandTotalsMode: mode })
        }
        onSubtotalsChange={(mode) =>
          handleDataChange({ subtotalsMode: mode })
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

      {/* Save As Modal */}
      <Dialog open={showSaveAsModal} onOpenChange={setShowSaveAsModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Save Pivot Table As</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              File Name
            </label>
            <Input
              value={saveAsFileName}
              onChange={(e) => setSaveAsFileName(e.target.value)}
              placeholder="Enter file name"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveAsFileName.trim()) {
                  confirmSaveAs();
                }
              }}
            />
            <p className="text-xs text-muted-foreground mt-2">
              The file will be saved as an Arrow (.arrow) file.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSaveAsModal(false);
                setSaveAsFileName('');
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveAs}
              disabled={isSaving || !saveAsFileName.trim()}
              className="bg-[#1A73E8] hover:bg-[#1455ad] text-white"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export { PivotTableProperties };
export default PivotTableAtom;

