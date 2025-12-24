import React, { useEffect, useState } from 'react';
import { Pencil, History, RotateCcw, Lightbulb, Trash2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UPLOAD_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow, ColumnNameEdit } from '../useGuidedUploadFlow';
import { useGuidedFlowFootprints } from '@/components/LaboratoryMode/hooks/useGuidedFlowFootprints';

interface U3ReviewColumnNamesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
  isMaximized?: boolean;
}

interface ColumnInfo {
  originalName: string;
  editedName: string;
  sampleValues: string[];
  ruleBasedSuggestion?: string;
  historicalMatch?: string;
  suggestionReason?: string;
  keep: boolean;
  tag?: 'previously_used' | 'ai_suggestion' | 'edited_by_user';
}

// Generate rule-based suggestion for column name cleaning
function generateRuleBasedSuggestion(columnName: string): { cleaned: string; reason: string } {
  let cleaned = String(columnName).trim();
  const original = cleaned;
  
  // Remove special characters (keep alphanumeric, underscores, spaces)
  cleaned = cleaned.replace(/[^a-zA-Z0-9_\s]/g, '_');
  
  // Remove leading/trailing underscores
  cleaned = cleaned.trim().replace(/^_+|_+$/g, '');
  
  // Convert to snake_case if contains spaces or camelCase
  if (/\s/.test(cleaned) || /[a-z][A-Z]/.test(cleaned)) {
    // Convert camelCase to snake_case
    cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1_$2');
    // Replace spaces with underscores
    cleaned = cleaned.replace(/\s+/g, '_');
    // Convert to lowercase
    cleaned = cleaned.toLowerCase();
  }
  
  // Ensure it starts with a letter
  if (cleaned && /^\d/.test(cleaned)) {
    cleaned = 'col_' + cleaned;
  }
  
  // If empty after cleaning, use default
  if (!cleaned || cleaned === '_') {
    cleaned = 'unnamed_column';
  }
  
  // Remove multiple consecutive underscores
  cleaned = cleaned.replace(/_+/g, '_');
  
  const reason = cleaned !== original 
    ? `Cleaned: removed special characters, converted to snake_case`
    : `No changes needed`;
  
  return { cleaned, reason };
}

export const U3ReviewColumnNames: React.FC<U3ReviewColumnNamesProps> = ({ flow, onNext, onBack, isMaximized = false }) => {
  const { state, setColumnNameEdits } = flow;
  const { uploadedFiles, columnNameEdits, selectedFileIndex } = state;
  const { trackEvent } = useGuidedFlowFootprints();
  const chosenIndex = selectedFileIndex !== undefined && selectedFileIndex < uploadedFiles.length ? selectedFileIndex : 0;
  const currentFile = uploadedFiles[chosenIndex];
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deletedColumns, setDeletedColumns] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchColumnNames = async () => {
      if (!currentFile) return;

      setLoading(true);
      try {
        const envStr = localStorage.getItem('env');
        let query = '';
        if (envStr) {
          try {
            const env = JSON.parse(envStr);
            query = '?' + new URLSearchParams({
              object_name: currentFile.path,
              client_id: env.CLIENT_ID || '',
              app_id: env.APP_ID || '',
              project_id: env.PROJECT_ID || '',
            }).toString();
          } catch {
            query = `?object_name=${encodeURIComponent(currentFile.path)}`;
          }
        } else {
          query = `?object_name=${encodeURIComponent(currentFile.path)}`;
        }

        // Fetch column names and sample data
        const res = await fetch(`${UPLOAD_API}/file-columns${query}`, {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          const existingEdits = columnNameEdits[currentFile.name] || [];
          
          const columnInfos: ColumnInfo[] = (data.columns || []).map((col: string, idx: number) => {
            const edit = existingEdits.find(e => e.originalName === col);
            const suggestion = generateRuleBasedSuggestion(col);
            
            // Determine tag and default edited name
            let tag: 'previously_used' | 'ai_suggestion' | 'edited_by_user' | undefined;
            let defaultEditedName = col;
            
            if (data.historical_matches?.[idx]) {
              defaultEditedName = data.historical_matches[idx];
              tag = 'previously_used';
            } else if (suggestion.cleaned !== col) {
              defaultEditedName = suggestion.cleaned;
              tag = 'ai_suggestion';
            }
            
            if (edit?.editedName && edit.editedName !== col) {
              defaultEditedName = edit.editedName;
              tag = 'edited_by_user';
            }
            
            return {
              originalName: col,
              editedName: edit?.editedName || defaultEditedName,
              sampleValues: data.sample_values?.[idx] || [],
              ruleBasedSuggestion: suggestion.cleaned,
              suggestionReason: suggestion.reason,
              historicalMatch: data.historical_matches?.[idx],
              keep: edit?.keep !== undefined ? edit.keep : true,
              tag,
            };
          });
          setColumns(columnInfos);
        } else {
          // Fallback: try to get from preview data
          const previewRes = await fetch(`${UPLOAD_API}/file-preview${query}`, {
            credentials: 'include',
          });
          if (previewRes.ok) {
            const previewData = await previewRes.json();
            const headerRow = previewData.data_rows?.[0]?.cells || [];
            const columnInfos: ColumnInfo[] = headerRow.map((col: string) => {
              const suggestion = generateRuleBasedSuggestion(col);
              return {
                originalName: col,
                editedName: suggestion.cleaned,
                sampleValues: [],
                ruleBasedSuggestion: suggestion.cleaned,
                suggestionReason: suggestion.reason,
                keep: true,
                tag: suggestion.cleaned !== col ? 'ai_suggestion' : undefined,
              };
            });
            setColumns(columnInfos);
          }
        }
      } catch (error) {
        console.error('Failed to fetch column names:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchColumnNames();
  }, [currentFile, columnNameEdits]);

  const handleNameChange = (index: number, newName: string) => {
    const column = columns[index];
    if (column) {
      // Track column name edit
      trackEvent({
        event_type: 'edit',
        stage: 'U3',
        action: 'column_name_edit',
        target: `column_${column.originalName}`,
        details: {
          file_name: currentFile?.name,
          column_index: index,
          original_name: column.originalName,
        },
        before_value: column.editedName,
        after_value: newName,
      });
    }
    setColumns(prev => prev.map((col, idx) =>
      idx === index ? { ...col, editedName: newName, tag: 'edited_by_user' as const } : col
    ));
  };

  const handleKeepToggle = (index: number, keep: boolean) => {
    console.log('handleKeepToggle called:', index, keep);
    const column = columns[index];
    if (column) {
      // Track column keep/remove toggle
      trackEvent({
        event_type: 'click',
        stage: 'U3',
        action: keep ? 'column_keep' : 'column_remove',
        target: `column_${column.originalName}`,
        details: {
          file_name: currentFile?.name,
          column_index: index,
          column_name: column.originalName,
        },
        before_value: column.keep,
        after_value: keep,
      });
    }
    setColumns(prev => {
      const updated = prev.map((col, idx) =>
        idx === index ? { ...col, keep } : col
      );
      console.log('Updated columns:', updated);
      
      // Save immediately with updated columns
      if (currentFile) {
        const edits: ColumnNameEdit[] = updated.map(col => ({
          originalName: col.originalName,
          editedName: col.editedName,
          aiSuggested: col.tag === 'ai_suggestion',
          historicalMatch: col.tag === 'previously_used',
          keep: col.keep,
        }));
        setColumnNameEdits(currentFile.name, edits);
      }
      
      return updated;
    });
    if (!keep) {
      setDeletedColumns(prev => new Set(prev).add(index));
    } else {
      setDeletedColumns(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const handleSave = () => {
    if (currentFile) {
      const edits: ColumnNameEdit[] = columns.map(col => ({
        originalName: col.originalName,
        editedName: col.editedName,
        aiSuggested: col.tag === 'ai_suggestion',
        historicalMatch: col.tag === 'previously_used',
        keep: col.keep,
      }));
      setColumnNameEdits(currentFile.name, edits);
    }
  };

  const handleApplyRuleBasedSuggestions = () => {
    console.log('handleApplyRuleBasedSuggestions called');
    setColumns(prev => {
      const updated = prev.map(col => ({
        ...col,
        editedName: col.ruleBasedSuggestion || col.editedName,
        tag: col.ruleBasedSuggestion && col.ruleBasedSuggestion !== col.originalName ? 'ai_suggestion' as const : col.tag,
      }));
      console.log('Updated columns:', updated);
      
      // Save immediately
      if (currentFile) {
        const edits: ColumnNameEdit[] = updated.map(col => ({
          originalName: col.originalName,
          editedName: col.editedName,
          aiSuggested: col.tag === 'ai_suggestion',
          historicalMatch: col.tag === 'previously_used',
          keep: col.keep,
        }));
        setColumnNameEdits(currentFile.name, edits);
      }
      
      return updated;
    });
  };

  const handleApplyHistorical = () => {
    console.log('handleApplyHistorical called');
    setColumns(prev => {
      const updated = prev.map(col => ({
        ...col,
        editedName: col.historicalMatch || col.editedName,
        tag: col.historicalMatch ? 'previously_used' as const : col.tag,
      }));
      console.log('Updated columns:', updated);
      
      // Save immediately
      if (currentFile) {
        const edits: ColumnNameEdit[] = updated.map(col => ({
          originalName: col.originalName,
          editedName: col.editedName,
          aiSuggested: col.tag === 'ai_suggestion',
          historicalMatch: col.tag === 'previously_used',
          keep: col.keep,
        }));
        setColumnNameEdits(currentFile.name, edits);
      }
      
      return updated;
    });
  };

  const handleReset = () => {
    console.log('handleReset called');
    setColumns(prev => {
      const updated = prev.map(col => ({
        ...col,
        editedName: col.originalName,
        tag: undefined,
        keep: true,
      }));
      console.log('Updated columns:', updated);
      
      // Save immediately
      if (currentFile) {
        const edits: ColumnNameEdit[] = updated.map(col => ({
          originalName: col.originalName,
          editedName: col.editedName,
          aiSuggested: col.tag === 'ai_suggestion',
          historicalMatch: col.tag === 'previously_used',
          keep: col.keep,
        }));
        setColumnNameEdits(currentFile.name, edits);
      }
      
      return updated;
    });
    setDeletedColumns(new Set());
  };

  // Bulk removal actions
  const handleRemoveEmptyColumns = () => {
    console.log('handleRemoveEmptyColumns called');
    setColumns(prev => {
      const updated = prev.map((col, idx) => ({
        ...col,
        keep: col.sampleValues.length > 0 ? col.keep : false,
      }));
      console.log('Updated columns:', updated);
      
      // Save immediately
      if (currentFile) {
        const edits: ColumnNameEdit[] = updated.map(col => ({
          originalName: col.originalName,
          editedName: col.editedName,
          aiSuggested: col.tag === 'ai_suggestion',
          historicalMatch: col.tag === 'previously_used',
          keep: col.keep,
        }));
        setColumnNameEdits(currentFile.name, edits);
      }
      
      return updated;
    });
  };

  const handleRemoveHighMissingColumns = () => {
    console.log('handleRemoveHighMissingColumns called');
    // This would need backend support to calculate missing percentage
    // For now, just mark columns with no sample values
    setColumns(prev => {
      const updated = prev.map(col => ({
        ...col,
        keep: col.sampleValues.length > 0 ? col.keep : false,
      }));
      console.log('Updated columns:', updated);
      
      // Save immediately
      if (currentFile) {
        const edits: ColumnNameEdit[] = updated.map(col => ({
          originalName: col.originalName,
          editedName: col.editedName,
          aiSuggested: col.tag === 'ai_suggestion',
          historicalMatch: col.tag === 'previously_used',
          keep: col.keep,
        }));
        setColumnNameEdits(currentFile.name, edits);
      }
      
      return updated;
    });
  };

  const handleNext = () => {
    handleSave();
    onNext();
  };

  // Check for duplicate names
  const duplicateNames = columns
    .filter(col => col.keep)
    .map(col => col.editedName)
    .filter((name, idx, arr) => arr.indexOf(name) !== idx);

  if (loading) {
    return (
      <StageLayout
        title=""
        explanation="Loading column names for review..."
      >
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#458EE2]"></div>
          <p className="mt-4 text-sm text-gray-600">Loading column names...</p>
        </div>
      </StageLayout>
    );
  }

  const hasRuleBasedSuggestions = columns.some(col => col.ruleBasedSuggestion && col.ruleBasedSuggestion !== col.originalName);
  const hasHistoricalMatches = columns.some(col => col.historicalMatch);
  const keptColumns = columns.filter(col => col.keep);

  return (
    <StageLayout
      title=""
      explanation=""
    >
      <div className="space-y-2">
        {/* Bulk Actions */}
        <div className="flex flex-wrap gap-2 pb-2 border-b">
          {hasHistoricalMatches && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Apply Historical button clicked');
                handleApplyHistorical();
              }}
              className="flex items-center gap-1.5 text-xs h-7"
              type="button"
            >
              <History className="w-3.5 h-3.5" />
              Use Historical Names
            </Button>
          )}
          {hasRuleBasedSuggestions && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Apply AI Suggestions button clicked');
                handleApplyRuleBasedSuggestions();
              }}
              className="flex items-center gap-1.5 text-xs h-7"
              type="button"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              Apply AI Suggestions
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Remove Empty Columns button clicked');
              handleRemoveEmptyColumns();
            }}
            className="flex items-center gap-1.5 text-xs h-7"
            type="button"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove Empty Columns
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Remove High Missing Columns button clicked');
              handleRemoveHighMissingColumns();
            }}
            className="flex items-center gap-1.5 text-xs h-7"
            type="button"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove Columns with &gt;95% Missing
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Reset All button clicked');
              handleReset();
            }}
            className="flex items-center gap-1.5 text-xs h-7"
            type="button"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset All
          </Button>
        </div>

        {/* Warnings */}
        {duplicateNames.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-yellow-800">
                Two columns now share the same name: {Array.from(new Set(duplicateNames)).join(', ')}. Please rename one.
              </p>
            </div>
          </div>
        )}

        {/* Column Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div 
            className="overflow-x-auto" 
            style={{ 
              maxHeight: isMaximized ? 'calc(100vh - 300px)' : '8.75rem',
              overflowY: 'auto',
              scrollbarGutter: 'stable'
            }}
          >
            <table className="text-[10px] table-fixed w-full">
              <colgroup>
                <col style={{ width: '120px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '130px' }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="bg-gray-50" style={{ height: '1.75rem' }}>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Original Name
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Auto-Classified Name
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Sample Values
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Keep and Drop
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Tags
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {columns.map((column, index) => {
                  const isDeleted = !column.keep;
                  const selectValue = column.keep ? 'keep' : 'delete';
                  const maxSampleValues = isMaximized ? 20 : 5;
                  const sampleValuesText = Array.from(new Set(column.sampleValues)).slice(0, maxSampleValues).join(', ');
                  const fullSampleValuesText = Array.from(new Set(column.sampleValues)).join(', ');
                  return (
                    <tr
                      key={`${column.originalName}-${index}`}
                      className={isDeleted ? 'bg-gray-50 opacity-60 hover:bg-gray-50' : 'hover:bg-gray-50'}
                      style={{ height: '1.75rem' }}
                    >
                      <td className="px-0.5 py-0 text-gray-600 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden" title={column.originalName}>
                        <div className="truncate">
                          {column.originalName}
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        {editingIndex === index ? (
                          <Input
                            value={column.editedName}
                            onChange={(e) => handleNameChange(index, e.target.value)}
                            onBlur={() => {
                              setEditingIndex(null);
                              handleSave();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setEditingIndex(null);
                                handleSave();
                              }
                              if (e.key === 'Escape') {
                                setEditingIndex(null);
                              }
                            }}
                            className="w-full text-[10px] h-5"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-1 overflow-hidden">
                            <span className="text-gray-700 text-[10px] leading-tight truncate flex-1 whitespace-nowrap" title={column.editedName}>
                              {column.editedName}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingIndex(index)}
                              className="h-4 w-4 p-0 flex-shrink-0"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden" title={fullSampleValuesText}>
                        <div className="truncate">
                          {column.sampleValues.length === 0 ? (
                            <span className="text-gray-400">No samples</span>
                          ) : (
                            <>
                              {sampleValuesText}
                              {Array.from(new Set(column.sampleValues)).length > maxSampleValues && '...'}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div 
                          className="relative inline-block w-full max-w-[90px]" 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={selectValue}
                            onChange={(e) => {
                              e.stopPropagation();
                              const value = e.target.value;
                              console.log('Native select changed:', value, 'for index:', index);
                              const newKeep = value === 'keep';
                              handleKeepToggle(index, newKeep);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                              className={`w-full h-5 px-1 py-0 text-[10px] rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none ${
                              isDeleted ? 'text-red-600' : 'text-gray-900'
                            }`}
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                              backgroundSize: '1em 1em',
                              backgroundPosition: 'right 0.25rem center',
                              backgroundRepeat: 'no-repeat',
                              paddingRight: '1.5rem'
                            }}
                          >
                            <option value="keep">Keep</option>
                            <option value="delete">Drop</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div className="flex gap-0.5 flex-wrap overflow-hidden">
                          {column.tag === 'previously_used' && (
                            <Badge className="bg-[#41C185] text-white text-[9px] flex items-center px-1 py-0 leading-tight flex-shrink-0 whitespace-nowrap truncate max-w-full">
                              <History className="w-2 h-2 mr-0.5 flex-shrink-0" />
                              <span className="truncate">Previously Used</span>
                            </Badge>
                          )}
                          {column.tag === 'ai_suggestion' && (
                            <Badge className="bg-[#FFBD59] text-white text-[9px] flex items-center px-1 py-0 leading-tight flex-shrink-0 whitespace-nowrap truncate max-w-full">
                              <Lightbulb className="w-2 h-2 mr-0.5 flex-shrink-0" />
                              <span className="truncate">AI Suggestion</span>
                            </Badge>
                          )}
                          {column.tag === 'edited_by_user' && (
                            <Badge className="bg-[#458EE2] text-white text-[9px] flex items-center px-1 py-0 leading-tight flex-shrink-0 whitespace-nowrap truncate max-w-full">
                              <Pencil className="w-2 h-2 mr-0.5 flex-shrink-0" />
                              <span className="truncate">Edited by User</span>
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-0 -mt-1">
          <p className="text-xs text-gray-700">
            <strong>{keptColumns.length}</strong> column{keptColumns.length !== 1 ? 's' : ''} will be kept,{' '}
            <strong>{columns.length - keptColumns.length}</strong> column{columns.length - keptColumns.length !== 1 ? 's' : ''} marked for removal.
          </p>
        </div>
      </div>
    </StageLayout>
  );
};

