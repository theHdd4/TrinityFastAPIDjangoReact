import React, { useEffect, useState } from 'react';
import { Pencil, History, RotateCcw, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { VALIDATE_API, DATAFRAME_VALIDATION_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow, ColumnNameEdit } from '../useGuidedUploadFlow';

interface U4ReviewColumnNamesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
}

interface ColumnInfo {
  originalName: string;
  editedName: string;
  sampleValues: string[];
  ruleBasedSuggestion?: string;
  historicalMatch?: string;
  suggestionReason?: string;
}

export const U4ReviewColumnNames: React.FC<U4ReviewColumnNamesProps> = ({ flow, onNext }) => {
  const { state, setColumnNameEdits } = flow;
  const { uploadedFiles, columnNameEdits } = state;
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const currentFile = uploadedFiles[currentFileIndex];

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
        const res = await fetch(`${VALIDATE_API}/file-columns${query}`, {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          const columnInfos: ColumnInfo[] = (data.columns || []).map((col: string, idx: number) => {
            const existingEdits = columnNameEdits[currentFile.name] || [];
            const edit = existingEdits.find(e => e.originalName === col);
            
            // Generate rule-based suggestion
            const suggestion = generateRuleBasedSuggestion(col);
            
            return {
              originalName: col,
              editedName: edit?.editedName || col,
              sampleValues: data.sample_values?.[idx] || [],
              ruleBasedSuggestion: suggestion.cleaned,
              suggestionReason: suggestion.reason,
              historicalMatch: data.historical_matches?.[idx],
            };
          });
          setColumns(columnInfos);
        } else {
          // Fallback: try to get from preview data
          const previewRes = await fetch(`${VALIDATE_API}/file-preview${query}`, {
            credentials: 'include',
          });
          if (previewRes.ok) {
            const previewData = await previewRes.json();
          const headerRow = previewData.rows?.[0] || [];
          const columnInfos: ColumnInfo[] = headerRow.map((col: string) => {
            const suggestion = generateRuleBasedSuggestion(col);
            return {
              originalName: col,
              editedName: col,
              sampleValues: [],
              ruleBasedSuggestion: suggestion.cleaned,
              suggestionReason: suggestion.reason,
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
    setColumns(prev => prev.map((col, idx) =>
      idx === index ? { ...col, editedName: newName } : col
    ));
  };

  const handleSave = () => {
    if (currentFile) {
      const edits: ColumnNameEdit[] = columns.map(col => ({
        originalName: col.originalName,
        editedName: col.editedName,
        aiSuggested: false, // Not using AI, using rule-based
        historicalMatch: col.editedName === col.historicalMatch,
      }));
      setColumnNameEdits(currentFile.name, edits);
    }
  };

  const handleApplyRuleBasedSuggestions = () => {
    setColumns(prev => prev.map(col => ({
      ...col,
      editedName: col.ruleBasedSuggestion || col.editedName,
    })));
  };

  const handleApplyHistorical = () => {
    setColumns(prev => prev.map(col => ({
      ...col,
      editedName: col.historicalMatch || col.editedName,
    })));
  };

  const handleReset = () => {
    setColumns(prev => prev.map(col => ({
      ...col,
      editedName: col.originalName,
    })));
  };

  const handleNext = () => {
    handleSave();
    if (currentFileIndex < uploadedFiles.length - 1) {
      setCurrentFileIndex(currentFileIndex + 1);
    } else {
      onNext();
    }
  };

  if (loading) {
    return (
      <StageLayout
        title="Review Column Names"
        explanation="What Trinity needs: Loading column names for review..."
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

  return (
    <StageLayout
      title="Review Column Names"
      explanation={`What Trinity needs: Review and edit column names if needed. File ${currentFileIndex + 1} of ${uploadedFiles.length}: ${currentFile.name}`}
      helpText="You can edit column names individually, or use the bulk actions below to apply rule-based suggestions or historical names."
      aiInsight={hasRuleBasedSuggestions ? "Rule-based suggestions are available to clean column names (remove special characters, convert to snake_case)." : undefined}
    >
      <div className="space-y-4">
        {/* Bulk Actions */}
        <div className="flex gap-2 pb-4 border-b">
          {hasHistoricalMatches && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyHistorical}
              className="flex items-center gap-2"
            >
              <History className="w-4 h-4" />
              Use Historical Names
            </Button>
          )}
          {hasRuleBasedSuggestions && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyRuleBasedSuggestions}
              className="flex items-center gap-2"
            >
              <Lightbulb className="w-4 h-4" />
              Apply Rule-Based Suggestions
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset All
          </Button>
        </div>

        {/* Column List - Single Key Action: Edit Names */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
        {columns.map((column, index) => (
          <div
            key={index}
            className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
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
                      }}
                      className="flex-1"
                      autoFocus
                    />
                  ) : (
                    <>
                      <span className="font-medium text-gray-900">{column.editedName}</span>
                      {column.editedName !== column.originalName && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-xs">
                                Original: {column.originalName}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Original column name: {column.originalName}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {column.ruleBasedSuggestion && column.editedName === column.ruleBasedSuggestion && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge className="bg-[#FFBD59] text-white text-xs flex items-center gap-1">
                                <Lightbulb className="w-3 h-3" />
                                Rule-Based
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{column.suggestionReason || 'Cleaned using naming rules'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {column.historicalMatch && column.editedName === column.historicalMatch && (
                        <Badge className="bg-[#41C185] text-white text-xs flex items-center gap-1">
                          <History className="w-3 h-3" />
                          Previously Used
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingIndex(index)}
                        className="ml-auto"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
                {column.sampleValues.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1">
                    Sample: {column.sampleValues.slice(0, 3).join(', ')}
                    {column.sampleValues.length > 3 && '...'}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        </div>
      </div>

      {uploadedFiles.length > 1 && (
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => {
              if (currentFileIndex > 0) {
                handleSave();
                setCurrentFileIndex(currentFileIndex - 1);
              }
            }}
            disabled={currentFileIndex === 0}
          >
            Previous File
          </Button>
          <span className="text-sm text-gray-600">
            {currentFileIndex + 1} / {uploadedFiles.length}
          </span>
          <Button
            variant="outline"
            onClick={handleNext}
            disabled={currentFileIndex === uploadedFiles.length - 1}
          >
            Next File
          </Button>
        </div>
      )}
    </StageLayout>
  );
};

