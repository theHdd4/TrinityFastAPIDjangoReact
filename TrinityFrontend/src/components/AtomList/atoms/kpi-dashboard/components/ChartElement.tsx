import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { ChartMakerConfig } from '@/components/LaboratoryMode/store/laboratoryStore';
import { BarChart3 } from 'lucide-react';
import ChartNoteEditor from '@/components/AtomList/atoms/chart-maker/components/rich-text-note/ChartNoteEditor';
import { TextBoxToolbar } from '@/components/LaboratoryMode/components/CanvasArea/text-box/TextBoxToolbar';
import { DEFAULT_CHART_NOTE_FORMATTING } from '@/components/AtomList/atoms/chart-maker/components/rich-text-note/types';
import type { TextAlignOption } from '@/components/LaboratoryMode/components/CanvasArea/text-box/types';
import { TEXT_STYLE_PRESETS } from '@/components/LaboratoryMode/components/CanvasArea/text-box/constants';

interface ChartElementProps {
  chartConfig?: ChartMakerConfig;
  width?: number;
  height?: number;
  onNoteChange?: (note: string, noteHtml?: string, noteFormatting?: any, filterKey?: string) => void;
}

// Helper function to generate a filter key from chart filters
const generateFilterKey = (filters?: Record<string, string[]>): string => {
  if (!filters || Object.keys(filters).length === 0) {
    return 'no-filters';
  }
  // Sort filter keys and values to ensure consistent key generation
  const sortedEntries = Object.entries(filters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => {
      const sortedValues = Array.isArray(values) ? [...values].sort().join(',') : '';
      return `${key}:${sortedValues}`;
    });
  return sortedEntries.join('|');
};

const ChartElement: React.FC<ChartElementProps> = ({ 
  chartConfig, 
  width, 
  height = 300,
  onNoteChange
}) => {
  // If no chart config or chart not rendered, show placeholder
  if (!chartConfig || !chartConfig.chartRendered || !chartConfig.chartConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 space-y-3">
        <BarChart3 className="w-8 h-8 text-blue-500" />
        <p className="text-sm font-medium text-foreground">Chart</p>
        <p className="text-xs text-muted-foreground text-center px-4">
          Configure and render a chart in the Charts tab to visualize data
        </p>
      </div>
    );
  }

  // Get chart data from rendered chart config
  const chartData = useMemo(() => {
    if (!chartConfig.chartConfig || !chartConfig.chartConfig.data) {
      return [];
    }
    return chartConfig.chartConfig.data;
  }, [chartConfig.chartConfig]);

  // Convert chart type from laboratory format to RechartsChartRenderer format
  const chartType = useMemo(() => {
    const type = chartConfig.type || 'line';
    const typeMap: Record<string, 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart'> = {
      'bar': 'bar_chart',
      'line': 'line_chart',
      'pie': 'pie_chart',
      'area': 'area_chart',
      'scatter': 'scatter_chart',
      'stacked_bar': 'stacked_bar_chart',
    };
    return typeMap[type] || 'line_chart';
  }, [chartConfig.type]);

  // Determine yFields for dual axis support
  let yFields: string[] | undefined = undefined;
  let yAxisLabels: string[] | undefined = undefined;

  // PRIORITY: If secondYAxis exists, use dual-axis mode
  if (chartConfig.secondYAxis) {
    const yAxis = chartConfig.yAxis ? String(chartConfig.yAxis).trim() : '';
    const secondYAxis = String(chartConfig.secondYAxis).trim();
    
    if (yAxis && secondYAxis) {
      yFields = [yAxis, secondYAxis];
      yAxisLabels = [yAxis, secondYAxis];
    }
  }
  // Use traces if explicitly in advanced mode AND secondYAxis is NOT set
  else if (chartConfig.isAdvancedMode && chartConfig.traces && chartConfig.traces.length > 0) {
    yFields = chartConfig.traces.map((t: any) => t.dataKey || t.yAxis);
    yAxisLabels = chartConfig.traces.map((t: any) => t.name || t.dataKey || t.yAxis);
  }

  // Determine if we should force single axis rendering
  const shouldForceSingleAxis = chartConfig.dualAxisMode === 'single' && chartConfig.secondYAxis && String(chartConfig.secondYAxis || '').trim().length > 0;

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 space-y-3">
        <BarChart3 className="w-8 h-8 text-blue-500" />
        <p className="text-sm font-medium text-foreground">No Chart Data</p>
        <p className="text-xs text-muted-foreground text-center px-4">
          Chart data is not available. Please import a chart with data.
        </p>
      </div>
    );
  }

  // Get saved chart configuration from rendered chart config
  const renderedChartConfig = chartConfig.chartConfig;
  
  // Map yFields to actual column names in the data
  let mappedYFields = yFields;
  if (yFields && yFields.length > 1 && chartData.length > 0) {
    const firstRow = chartData[0];
    const dataKeys = firstRow ? Object.keys(firstRow) : [];
    
    mappedYFields = yFields.map((yField) => {
      if (dataKeys.includes(yField)) {
        return yField;
      }
      const matchingKey = dataKeys.find(key => key.startsWith(yField + '_') || key === yField);
      if (matchingKey) {
        return matchingKey;
      }
      return yField;
    });
  }
  
  const finalYFields = mappedYFields || yFields;
  const finalYField = finalYFields && finalYFields.length > 0 ? finalYFields[0] : chartConfig.yAxis;
  
  const rendererProps = {
    type: chartType,
    data: chartData,
    xField: chartConfig.xAxis,
    yField: finalYField,
    yFields: finalYFields,
    title: chartConfig.title,
    xAxisLabel: chartConfig.xAxis,
    yAxisLabel: chartConfig.yAxis,
    yAxisLabels: yAxisLabels,
    legendField: chartConfig.legendField && chartConfig.legendField !== 'aggregate' ? chartConfig.legendField : undefined,
    colors: renderedChartConfig?.colors || ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ef4444'],
    width: 0, // Use 0 to make chart responsive to container width
    height: height,
    theme: renderedChartConfig?.theme,
    showLegend: renderedChartConfig?.showLegend,
    showXAxisLabels: renderedChartConfig?.showXAxisLabels,
    showYAxisLabels: renderedChartConfig?.showYAxisLabels,
    showDataLabels: renderedChartConfig?.showDataLabels,
    showGrid: renderedChartConfig?.showGrid,
    sortOrder: renderedChartConfig?.sortOrder || null,
    sortColumn: renderedChartConfig?.sortColumn,
    enableScroll: renderedChartConfig?.enableScroll,
    chartsPerRow: renderedChartConfig?.chartsPerRow,
    forceSingleAxis: shouldForceSingleAxis,
    seriesSettings: renderedChartConfig?.seriesSettings,
    showNote: false, // Note box is rendered in ChartElement, not RechartsChartRenderer
  };

  const showNote = chartConfig.showNote || false;
  
  // Generate filter key from current filters
  const currentFilterKey = useMemo(() => {
    return generateFilterKey(chartConfig.filters);
  }, [chartConfig.filters]);
  
  // Get notesByFilter structure (initialize if needed)
  const notesByFilter = useMemo(() => {
    return (chartConfig as any).notesByFilter || {};
  }, [chartConfig]);
  
  // Get note for current filter combination
  const getNoteForCurrentFilter = useCallback(() => {
    return notesByFilter[currentFilterKey] || {
      note: '',
      noteHtml: undefined,
      noteFormatting: DEFAULT_CHART_NOTE_FORMATTING
    };
  }, [notesByFilter, currentFilterKey]);
  
  // State for rich text note editing
  const [editingNote, setEditingNote] = useState(false);
  const [showNoteToolbar, setShowNoteToolbar] = useState(false);
  
  // Local state for note editing - prevents lag by not saving on every keystroke
  const [localNoteState, setLocalNoteState] = useState<{ value: string; html?: string } | null>(null);
  
  // Get current note value - use local state if editing, otherwise use persisted state
  const getNoteValue = useCallback(() => {
    if (editingNote && localNoteState) {
      return localNoteState.value;
    }
    return getNoteForCurrentFilter().note || '';
  }, [editingNote, localNoteState, getNoteForCurrentFilter]);
  
  // Get current note HTML - use local state if editing, otherwise use persisted state
  const getNoteHtml = useCallback(() => {
    if (editingNote && localNoteState) {
      return localNoteState.html;
    }
    return getNoteForCurrentFilter().noteHtml;
  }, [editingNote, localNoteState, getNoteForCurrentFilter]);
  
  // Get current note formatting
  const getNoteFormatting = useCallback(() => {
    if (editingNote && localNoteState) {
      // Use formatting from current filter's note
      return getNoteForCurrentFilter().noteFormatting || DEFAULT_CHART_NOTE_FORMATTING;
    }
    return getNoteForCurrentFilter().noteFormatting || DEFAULT_CHART_NOTE_FORMATTING;
  }, [editingNote, localNoteState, getNoteForCurrentFilter]);
  
  // Reset local state when filter changes (if not editing)
  useEffect(() => {
    if (!editingNote) {
      setLocalNoteState(null);
    }
  }, [currentFilterKey, editingNote]);
  
  // Handle note input change - update LOCAL state only (no store update = no lag)
  const handleNoteChange = useCallback((value: string, html?: string) => {
    setLocalNoteState({ value, html });
  }, []);
  
  // Handle note commit - save to store on blur/commit
  const handleNoteCommit = useCallback((value: string, html: string) => {
    const formatting = getNoteFormatting();
    if (onNoteChange) {
      // Pass the filter key so the note can be saved per filter combination
      onNoteChange(value, html, formatting, currentFilterKey);
    }
    
    // Clear local state
    setLocalNoteState(null);
    setEditingNote(false);
    setShowNoteToolbar(false);
  }, [onNoteChange, getNoteFormatting, currentFilterKey]);
  
  // Handle note cancel - discard local changes
  const handleNoteCancel = useCallback(() => {
    setLocalNoteState(null);
    setEditingNote(false);
    setShowNoteToolbar(false);
  }, []);
  
  // Helper to check if editor has selection
  const hasNoteEditorSelection = useCallback((): boolean => {
    if (!editingNote) return false;
    const editorElement = document.querySelector('[data-chart-note-editor="true"]') as HTMLElement;
    if (!editorElement) return false;
    const selection = window.getSelection();
    return !!(selection && selection.rangeCount > 0 && !selection.isCollapsed);
  }, [editingNote]);
  
  // Helper to run execCommand on note editor
  const runNoteEditorCommand = useCallback((command: string, value?: string): boolean => {
    if (!editingNote) return false;
    const editorElement = document.querySelector('[data-chart-note-editor="true"]') as HTMLElement;
    if (!editorElement) return false;
    
    editorElement.focus();
    try {
      return document.execCommand(command, false, value);
    } catch (e) {
      return false;
    }
  }, [editingNote]);
  
  // Sync HTML after formatting command
  const syncNoteHtmlAfterFormatting = useCallback(() => {
    if (editingNote) {
      setTimeout(() => {
        const editorElement = document.querySelector('[data-chart-note-editor="true"]') as HTMLElement;
        if (editorElement && localNoteState) {
          const updatedHtml = editorElement.innerHTML;
          setLocalNoteState(prev => prev ? { ...prev, html: updatedHtml } : null);
        }
      }, 0);
    }
  }, [editingNote, localNoteState]);
  
  // Handle note formatting change
  const handleNoteFormattingChange = useCallback((updates: {
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    textColor?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
  }) => {
    const currentFormatting = getNoteFormatting();
    const updatedFormatting = { ...currentFormatting, ...updates };
    
    // If editor is active, capture current HTML
    if (editingNote) {
      const editorElement = document.querySelector('[data-chart-note-editor="true"]') as HTMLElement;
      if (editorElement && localNoteState) {
        const updatedHtml = editorElement.innerHTML;
        setLocalNoteState(prev => prev ? { ...prev, html: updatedHtml } : null);
      }
    }
    
    // Save formatting with filter key
    if (onNoteChange) {
      const currentValue = getNoteValue();
      const currentHtml = getNoteHtml();
      onNoteChange(currentValue, currentHtml, updatedFormatting, currentFilterKey);
    }
  }, [editingNote, localNoteState, getNoteFormatting, getNoteValue, getNoteHtml, onNoteChange, currentFilterKey]);
  
  // TextBoxToolbar handlers for chart notes
  const handleNoteFontFamilyChange = useCallback((font: string) => {
    const hasSelection = hasNoteEditorSelection();
    if (hasSelection) {
      runNoteEditorCommand('fontName', font);
      syncNoteHtmlAfterFormatting();
    }
    handleNoteFormattingChange({ fontFamily: font });
  }, [hasNoteEditorSelection, runNoteEditorCommand, syncNoteHtmlAfterFormatting, handleNoteFormattingChange]);
  
  const handleNoteIncreaseFontSize = useCallback(() => {
    const formatting = getNoteFormatting();
    const newSize = Math.min(formatting.fontSize + 1, 72);
    handleNoteFormattingChange({ fontSize: newSize });
  }, [getNoteFormatting, handleNoteFormattingChange]);
  
  const handleNoteDecreaseFontSize = useCallback(() => {
    const formatting = getNoteFormatting();
    const newSize = Math.max(formatting.fontSize - 1, 8);
    handleNoteFormattingChange({ fontSize: newSize });
  }, [getNoteFormatting, handleNoteFormattingChange]);
  
  const handleNoteToggleBold = useCallback(() => {
    const formatting = getNoteFormatting();
    const newBold = !formatting.bold;
    const hasSelection = hasNoteEditorSelection();
    if (hasSelection) {
      runNoteEditorCommand('bold');
      syncNoteHtmlAfterFormatting();
    }
    handleNoteFormattingChange({ bold: newBold });
  }, [getNoteFormatting, hasNoteEditorSelection, runNoteEditorCommand, syncNoteHtmlAfterFormatting, handleNoteFormattingChange]);
  
  const handleNoteToggleItalic = useCallback(() => {
    const formatting = getNoteFormatting();
    const newItalic = !formatting.italic;
    const hasSelection = hasNoteEditorSelection();
    if (hasSelection) {
      runNoteEditorCommand('italic');
      syncNoteHtmlAfterFormatting();
    }
    handleNoteFormattingChange({ italic: newItalic });
  }, [getNoteFormatting, hasNoteEditorSelection, runNoteEditorCommand, syncNoteHtmlAfterFormatting, handleNoteFormattingChange]);
  
  const handleNoteToggleUnderline = useCallback(() => {
    const formatting = getNoteFormatting();
    const newUnderline = !formatting.underline;
    const hasSelection = hasNoteEditorSelection();
    if (hasSelection) {
      runNoteEditorCommand('underline');
      syncNoteHtmlAfterFormatting();
    }
    handleNoteFormattingChange({ underline: newUnderline });
  }, [getNoteFormatting, hasNoteEditorSelection, runNoteEditorCommand, syncNoteHtmlAfterFormatting, handleNoteFormattingChange]);
  
  const handleNoteToggleStrikethrough = useCallback(() => {
    const formatting = getNoteFormatting();
    const newStrikethrough = !formatting.strikethrough;
    const hasSelection = hasNoteEditorSelection();
    if (hasSelection) {
      runNoteEditorCommand('strikeThrough');
      syncNoteHtmlAfterFormatting();
    }
    handleNoteFormattingChange({ strikethrough: newStrikethrough });
  }, [getNoteFormatting, hasNoteEditorSelection, runNoteEditorCommand, syncNoteHtmlAfterFormatting, handleNoteFormattingChange]);
  
  const handleNoteAlign = useCallback((align: TextAlignOption) => {
    const hasSelection = hasNoteEditorSelection();
    if (hasSelection) {
      const command = align === 'center' ? 'justifyCenter' : align === 'right' ? 'justifyRight' : 'justifyLeft';
      runNoteEditorCommand(command);
      syncNoteHtmlAfterFormatting();
    }
    handleNoteFormattingChange({ textAlign: align });
  }, [hasNoteEditorSelection, runNoteEditorCommand, syncNoteHtmlAfterFormatting, handleNoteFormattingChange]);
  
  const handleNoteColorChange = useCallback((color: string) => {
    const hasSelection = hasNoteEditorSelection();
    if (hasSelection) {
      runNoteEditorCommand('foreColor', color);
      syncNoteHtmlAfterFormatting();
    }
    handleNoteFormattingChange({ textColor: color });
  }, [hasNoteEditorSelection, runNoteEditorCommand, syncNoteHtmlAfterFormatting, handleNoteFormattingChange]);
  
  const handleNoteBackgroundColorChange = useCallback((color: string) => {
    const hasSelection = hasNoteEditorSelection();
    if (hasSelection) {
      runNoteEditorCommand('backColor', color) || runNoteEditorCommand('hiliteColor', color);
      syncNoteHtmlAfterFormatting();
    }
    handleNoteFormattingChange({ backgroundColor: color });
  }, [hasNoteEditorSelection, runNoteEditorCommand, syncNoteHtmlAfterFormatting, handleNoteFormattingChange]);
  
  const handleNoteApplyTextStyle = useCallback((preset: typeof TEXT_STYLE_PRESETS[number]) => {
    const hasSelection = hasNoteEditorSelection();
    if (hasSelection) {
      if (preset.bold) runNoteEditorCommand('bold');
      if (preset.italic) runNoteEditorCommand('italic');
      if (preset.underline) runNoteEditorCommand('underline');
      if (preset.strikethrough) runNoteEditorCommand('strikeThrough');
      syncNoteHtmlAfterFormatting();
    }
    handleNoteFormattingChange({
      bold: preset.bold,
      italic: preset.italic,
      underline: preset.underline,
      strikethrough: preset.strikethrough,
    });
  }, [hasNoteEditorSelection, runNoteEditorCommand, syncNoteHtmlAfterFormatting, handleNoteFormattingChange]);
  
  // Initialize local state when starting to edit
  useEffect(() => {
    if (editingNote && !localNoteState) {
      setLocalNoteState({
        value: chartConfig.note || '',
        html: (chartConfig as any).noteHtml
      });
    }
  }, [editingNote, chartConfig, localNoteState]);
  
  return (
    <div className={`w-full h-full flex flex-col`} style={{ maxHeight: '100%', maxWidth: '100%', padding: '8px', minWidth: 0, minHeight: 0 }}>
      {/* Chart Title */}
      {chartConfig.title && (
        <div className="flex items-center mb-2 flex-shrink-0 relative">
          <BarChart3 className="w-5 h-5 mr-2 text-gray-900" />
          <h3 className="font-bold text-lg text-gray-900">{chartConfig.title}</h3>
        </div>
      )}
      {/* Space for filter display - increased gap between title and chart */}
      <div className="mb-4 flex-shrink-0 relative" style={{ minHeight: '40px' }}>
        {/* This space is reserved for filter display from parent component */}
      </div>
      <div className={`w-full ${showNote ? 'flex-1 min-h-0' : 'h-full'}`} style={{ maxWidth: '100%', maxHeight: showNote ? '100%' : '100%', overflow: 'hidden', minWidth: 0, minHeight: 0, width: '100%' }}>
        <RechartsChartRenderer {...rendererProps} />
      </div>
      {showNote && (
        <div 
          className="mt-2 w-full flex-shrink-0 relative" 
          onClick={(e) => e.stopPropagation()}
          onFocusCapture={() => {
            if (editingNote) {
              setShowNoteToolbar(true);
            }
          }}
          onBlurCapture={(e) => {
            const relatedTarget = e.relatedTarget as HTMLElement;
            // Don't hide toolbar if focus is moving to toolbar
            if (relatedTarget && (
              relatedTarget.closest('[data-text-toolbar-root]') ||
              relatedTarget.closest('[role="popover"]') ||
              relatedTarget.closest('[data-radix-popover-content]')
            )) {
              return;
            }
            // Delay to allow toolbar interactions
            setTimeout(() => {
              if (!document.activeElement || !document.activeElement.closest('[data-chart-note-editor="true"]')) {
                setShowNoteToolbar(false);
              }
            }, 200);
          }}
        >
          {showNoteToolbar && editingNote && (
            <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full mb-2">
              <TextBoxToolbar
                fontFamily={getNoteFormatting().fontFamily}
                onFontFamilyChange={handleNoteFontFamilyChange}
                fontSize={getNoteFormatting().fontSize}
                onIncreaseFontSize={handleNoteIncreaseFontSize}
                onDecreaseFontSize={handleNoteDecreaseFontSize}
                onApplyTextStyle={handleNoteApplyTextStyle}
                bold={getNoteFormatting().bold}
                italic={getNoteFormatting().italic}
                underline={getNoteFormatting().underline}
                strikethrough={getNoteFormatting().strikethrough}
                onToggleBold={handleNoteToggleBold}
                onToggleItalic={handleNoteToggleItalic}
                onToggleUnderline={handleNoteToggleUnderline}
                onToggleStrikethrough={handleNoteToggleStrikethrough}
                align={getNoteFormatting().textAlign as TextAlignOption}
                onAlign={handleNoteAlign}
                color={getNoteFormatting().textColor}
                onColorChange={handleNoteColorChange}
                backgroundColor={getNoteFormatting().backgroundColor}
                onBackgroundColorChange={handleNoteBackgroundColorChange}
              />
            </div>
          )}
          <ChartNoteEditor
            value={getNoteValue()}
            html={getNoteHtml()}
            formatting={getNoteFormatting()}
            isEditing={editingNote}
            onValueChange={handleNoteChange}
            onCommit={handleNoteCommit}
            onCancel={handleNoteCancel}
            onFormattingChange={handleNoteFormattingChange}
            onClick={() => {
              setEditingNote(true);
              setShowNoteToolbar(true);
              // Initialize local state with current note for current filter when starting to edit
              if (!localNoteState) {
                const currentNote = getNoteForCurrentFilter();
                setLocalNoteState({
                  value: currentNote.note || '',
                  html: currentNote.noteHtml
                });
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

export default ChartElement;

