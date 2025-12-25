import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Check, Info, Eye, ChevronDown, ChevronUp, Plus, X, AlertTriangle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UnpivotSettings as UnpivotSettingsType, VariableDecoderConfig, VariableDecoderMapping } from '@/components/LaboratoryMode/store/laboratoryStore';
import { MultiSelectDropdown } from '@/templates/dropdown';

interface UnpivotSettingsProps {
  data: UnpivotSettingsType;
  onDataChange: (data: Partial<UnpivotSettingsType>) => void;
  onApply?: () => void;
  onPreview?: () => void;
  isComputing?: boolean;
}

// Pattern detection helper
const detectVariablePatterns = (variableValues: string[]): Array<{ type: 'delimiter' | 'regex'; delimiter?: string; regex?: string; suggestedMappings: Array<{ index: number; column: string; dtype: 'string' | 'int' | 'category' }> }> => {
  if (variableValues.length === 0) return [];
  
  const suggestions: Array<{ type: 'delimiter' | 'regex'; delimiter?: string; regex?: string; suggestedMappings: Array<{ index: number; column: string; dtype: 'string' | 'int' | 'category' }> }> = [];
  
  // Test common delimiters
  const delimiters = ['_', ' ', '-'];
  for (const delim of delimiters) {
    const segments = variableValues[0].split(delim);
    if (segments.length > 1 && segments.length <= 5) {
      // Check if most values have similar segment counts
      const segmentCounts = variableValues.map(v => v.split(delim).length);
      const avgSegments = segmentCounts.reduce((a, b) => a + b, 0) / segmentCounts.length;
      if (Math.abs(avgSegments - segments.length) < 0.5) {
        const mappings: Array<{ index: number; column: string; dtype: 'string' | 'int' | 'category' }> = [];
        segments.forEach((seg, idx) => {
          let dtype: 'string' | 'int' | 'category' = 'string';
          // Try to detect type
          if (/^\d+$/.test(seg.trim())) {
            dtype = 'int';
          } else if (seg.trim().length <= 20) {
            dtype = 'category';
          }
          mappings.push({
            index: idx,
            column: `segment_${idx + 1}`,
            dtype
          });
        });
        suggestions.push({
          type: 'delimiter',
          delimiter: delim === ' ' ? 'space' : delim === '_' ? 'underscore' : 'hyphen',
          suggestedMappings: mappings
        });
      }
    }
  }
  
  return suggestions;
};

const UnpivotSettings: React.FC<UnpivotSettingsProps> = ({ data, onDataChange, onApply, onPreview, isComputing = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [decoderSectionOpen, setDecoderSectionOpen] = useState(false);
  const [decoderConfig, setDecoderConfig] = useState<VariableDecoderConfig>(
    data.variableDecoder || {
      enabled: false,
      type: 'delimiter',
      mappings: []
    }
  );

  const fieldOptions = useMemo(() => {
    if (data.dataSourceColumns && data.dataSourceColumns.length > 0) {
      console.log('UnpivotSettings: Available columns:', data.dataSourceColumns.length);
      return data.dataSourceColumns;
    }
    console.log('UnpivotSettings: No columns available. dataSourceColumns:', data.dataSourceColumns);
    return [];
  }, [data.dataSourceColumns]);

  const filteredFields = useMemo(() => {
    if (!searchTerm.trim()) {
      return fieldOptions;
    }
    return fieldOptions.filter(field => field.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [fieldOptions, searchTerm]);

  const availableForIdVars = useMemo(() => {
    return filteredFields.filter(f => !data.valueVars.includes(f));
  }, [filteredFields, data.valueVars]);

  const availableForValueVars = useMemo(() => {
    return filteredFields.filter(f => !data.idVars.includes(f));
  }, [filteredFields, data.idVars]);

  // Convert string arrays to {value, label} format for MultiSelectDropdown
  const idVarOptions = useMemo(() => {
    return availableForIdVars.map(field => ({ value: field, label: field }));
  }, [availableForIdVars]);

  const valueVarOptions = useMemo(() => {
    return availableForValueVars.map(field => ({ value: field, label: field }));
  }, [availableForValueVars]);

  const handleIdVarToggle = (field: string, checked: boolean) => {
    if (checked) {
      if (data.idVars.includes(field)) return;
      onDataChange({
        idVars: [...data.idVars, field],
      });
    } else {
      onDataChange({
        idVars: data.idVars.filter(f => f !== field),
      });
    }
  };

  const handleValueVarToggle = (field: string, checked: boolean) => {
    if (checked) {
      if (data.valueVars.includes(field)) return;
      onDataChange({
        valueVars: [...data.valueVars, field],
      });
    } else {
      onDataChange({
        valueVars: data.valueVars.filter(f => f !== field),
      });
    }
  };

  // Check if decoder section should be shown
  const shouldShowDecoderSection = useMemo(() => {
    if (!data.unpivotResults || data.unpivotResults.length === 0) return false;
    
    // Get all column names from the results
    const firstRow = data.unpivotResults[0];
    if (!firstRow || typeof firstRow !== 'object') return false;
    
    const allColumns = Object.keys(firstRow);
    if (allColumns.length === 0) return false;
    
    // Try to find the variable column - check exact match first, then case-insensitive
    const expectedVariableCol = data.variableColumnName || 'variable';
    let variableCol: string | null = null;
    
    // First try exact match
    if (allColumns.includes(expectedVariableCol)) {
      variableCol = expectedVariableCol;
    } else {
      // Try case-insensitive match
      const lowerExpected = expectedVariableCol.toLowerCase();
      const found = allColumns.find(col => col.toLowerCase() === lowerExpected);
      if (found) {
        variableCol = found;
      } else {
        // If still not found, try common variable column names
        const commonNames = ['variable', 'var', 'variable_name', 'var_name'];
        for (const name of commonNames) {
          const foundCommon = allColumns.find(col => col.toLowerCase() === name.toLowerCase());
          if (foundCommon) {
            variableCol = foundCommon;
            break;
          }
        }
      }
    }
    
    if (!variableCol) return false;
    
    // Check if variable column has string values and > 1 unique value
    // Filter out null, undefined, and empty strings
    const uniqueValues = new Set(
      data.unpivotResults
        .map((r: any) => {
          const val = r[variableCol];
          if (val === null || val === undefined) return null;
          return String(val).trim();
        })
        .filter((v: string | null): v is string => v !== null && v !== '')
    );
    
    return uniqueValues.size > 0;
  }, [data.unpivotResults, data.variableColumnName]);

  // Helper to find variable column name in results
  const findVariableColumn = useMemo(() => {
    if (!data.unpivotResults || data.unpivotResults.length === 0) return null;
    
    const firstRow = data.unpivotResults[0];
    if (!firstRow || typeof firstRow !== 'object') return null;
    
    const allColumns = Object.keys(firstRow);
    const expectedVariableCol = data.variableColumnName || 'variable';
    
    // Try exact match first
    if (allColumns.includes(expectedVariableCol)) {
      return expectedVariableCol;
    }
    
    // Try case-insensitive match
    const lowerExpected = expectedVariableCol.toLowerCase();
    const found = allColumns.find(col => col.toLowerCase() === lowerExpected);
    if (found) return found;
    
    // Try common variable column names
    const commonNames = ['variable', 'var', 'variable_name', 'var_name'];
    for (const name of commonNames) {
      const foundCommon = allColumns.find(col => col.toLowerCase() === name.toLowerCase());
      if (foundCommon) return foundCommon;
    }
    
    return null;
  }, [data.unpivotResults, data.variableColumnName]);

  // Pattern detection when section opens
  const [patternSuggestions, setPatternSuggestions] = useState<Array<{ type: 'delimiter' | 'regex'; delimiter?: string; regex?: string; suggestedMappings: Array<{ index: number; column: string; dtype: 'string' | 'int' | 'category' }> }>>([]);
  
  useEffect(() => {
    if (decoderSectionOpen && shouldShowDecoderSection && data.unpivotResults && findVariableColumn) {
      const variableValues = Array.from(new Set(
        data.unpivotResults
          .slice(0, 100)
          .map((r: any) => {
            const val = r[findVariableColumn];
            if (val === null || val === undefined) return null;
            return String(val).trim();
          })
          .filter((v: string | null): v is string => v !== null && v !== '')
      ));
      const suggestions = detectVariablePatterns(variableValues);
      setPatternSuggestions(suggestions);
    }
  }, [decoderSectionOpen, shouldShowDecoderSection, data.unpivotResults, findVariableColumn]);

  // Sync decoder config with data
  useEffect(() => {
    if (data.variableDecoder) {
      setDecoderConfig(data.variableDecoder);
    }
  }, [data.variableDecoder]);

  const handleDecoderConfigChange = (updates: Partial<VariableDecoderConfig>) => {
    const newConfig = { ...decoderConfig, ...updates };
    setDecoderConfig(newConfig);
    onDataChange({ variableDecoder: newConfig });
  };

  const handleAddMapping = () => {
    const newMapping: VariableDecoderMapping = {
      index: decoderConfig.mappings.length,
      column: `column_${decoderConfig.mappings.length + 1}`,
      dtype: 'string'
    };
    handleDecoderConfigChange({
      mappings: [...decoderConfig.mappings, newMapping]
    });
  };

  const handleRemoveMapping = (index: number) => {
    handleDecoderConfigChange({
      mappings: decoderConfig.mappings.filter((_, i) => i !== index).map((m, i) => ({ ...m, index: i }))
    });
  };

  const handleUpdateMapping = (index: number, updates: Partial<VariableDecoderMapping>) => {
    const newMappings = [...decoderConfig.mappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    handleDecoderConfigChange({ mappings: newMappings });
  };

  const handleApplySuggestion = (suggestion: typeof patternSuggestions[0]) => {
    const newConfig: VariableDecoderConfig = {
      enabled: true,
      type: suggestion.type,
      delimiter: suggestion.delimiter,
      regex: suggestion.regex,
      mappings: suggestion.suggestedMappings
    };
    setDecoderConfig(newConfig);
    onDataChange({ variableDecoder: newConfig });
  };

  // Check decoder validation
  const decoderValidation = useMemo(() => {
    if (!decoderConfig.enabled) return { isValid: true, errors: [] };
    const errors: string[] = [];
    if (decoderConfig.mappings.length === 0) {
      errors.push('No mappings configured');
    }
    if (decoderConfig.type === 'delimiter' && !decoderConfig.delimiter) {
      errors.push('Delimiter not specified');
    }
    if (decoderConfig.type === 'regex' && !decoderConfig.regex) {
      errors.push('Regex pattern not specified');
    }
    if (decoderConfig.type === 'regex' && decoderConfig.regex) {
      try {
        new RegExp(decoderConfig.regex);
      } catch {
        errors.push('Invalid regex pattern');
      }
    }
    const duplicateColumns = decoderConfig.mappings.map(m => m.column).filter((col, idx, arr) => arr.indexOf(col) !== idx);
    if (duplicateColumns.length > 0) {
      errors.push(`Duplicate column names: ${duplicateColumns.join(', ')}`);
    }
    return { isValid: errors.length === 0, errors };
  }, [decoderConfig]);

  const decoderStats = data.unpivotSummary?.decoder_match_rate !== undefined ? {
    matchRate: data.unpivotSummary.decoder_match_rate,
    matchedRows: data.unpivotSummary.decoder_matched_rows || 0,
    failedRows: data.unpivotSummary.decoder_failed_rows || 0
  } : null;


  return (
    <div className="space-y-4">
      {/* ID Columns Section */}
      <Card className="border-l-4 border-l-blue-500">
        <CardContent className="py-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium">Identifier Columns</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-xs">
                      Columns that uniquely identify each row. These columns stay the same while other columns are converted into rows.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <MultiSelectDropdown
              identifierName="Select columns"
              placeholder="Select identifier columns"
              options={idVarOptions}
              selectedValues={data.idVars}
              onSelectionChange={(selected) => onDataChange({ idVars: selected })}
              showSelectAll={true}
              showDeselectAll={true}
              showTrigger={true}
              triggerClassName="w-full justify-between"
              maxHeight="300px"
            />
          </div>
        </CardContent>
      </Card>

      {/* Value Columns Configuration Section */}
      <Card className="border-l-4 border-l-green-500">
        <CardContent className="py-3 space-y-4">
          {/* Value Variables Dropdown */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium">Select Columns to Unpivot</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-xs">
                      Each selected column will be converted into rows under a single column name.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <MultiSelectDropdown
              identifierName="Select columns"
              placeholder="Select columns to convert into rows"
              options={valueVarOptions}
              selectedValues={data.valueVars}
              onSelectionChange={(selected) => onDataChange({ valueVars: selected })}
              showSelectAll={true}
              showDeselectAll={true}
              showTrigger={true}
              triggerClassName="w-full justify-between"
              maxHeight="300px"
            />
          </div>

          {/* Variable Column Name */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium">Label for unpivoted Column</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-xs">
                      Name of the column that will contain the unpivoted values (for example: Date or Period).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              value={data.variableColumnName || ''}
              onChange={(e) => {

                const value = e.target.value.trim();
                onDataChange({ variableColumnName: value || undefined });
              }}
              placeholder="e.g. metric, attribute, variable"
              className="w-full h-8 text-xs"
            />
          </div>

          {/* Value Column Name */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium">Label for Values</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-xs">
                      Name of the column that will contain the values from the unpivoted columns.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              value={data.valueColumnName || ''}
              onChange={(e) => {
                const value = e.target.value.trim();
                onDataChange({ valueColumnName: value || undefined });
              }}
              placeholder="e.g. value, amount, count"
              className="w-full h-8 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Variable Decoder Section - Commented out for now, will be replaced with global operation to split columns */}
      {false && shouldShowDecoderSection && (
        <div className="space-y-3 border-t pt-4">
          <button
            type="button"
            onClick={() => setDecoderSectionOpen(!decoderSectionOpen)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Split Variable into Dimensions</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-xs">
                      Split the variable column into structured dimensions (e.g., quarter, year, metric, region) for easier analysis
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {decoderSectionOpen ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>

          {decoderSectionOpen && (
            <div className="space-y-4 pl-2 border-l-2 border-gray-200">
              {/* Pattern Suggestions */}
              {patternSuggestions.length > 0 && (
                <Card className="p-3 bg-blue-50 border-blue-200">
                  <p className="text-xs font-medium text-blue-900 mb-2">Suggested Patterns:</p>
                  <div className="space-y-2">
                    {patternSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleApplySuggestion(suggestion)}
                        className="w-full text-left p-2 bg-white rounded border border-blue-300 hover:bg-blue-100 text-xs"
                      >
                        <div className="font-medium">
                          {suggestion.type === 'delimiter' 
                            ? `Delimiter: ${suggestion.delimiter}` 
                            : 'Regex pattern'}
                        </div>
                        <div className="text-gray-600 mt-1">
                          {suggestion.suggestedMappings.map(m => m.column).join(', ')}
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>
              )}

              {/* Enable Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enable-decoder"
                  checked={decoderConfig.enabled}
                  onChange={(e) => handleDecoderConfigChange({ enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="enable-decoder" className="text-sm font-medium">
                  Enable Variable Decoder
                </Label>
              </div>

              {decoderConfig.enabled && (
                <div className="space-y-3">
                  {/* Decoder Type */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Decoder Type</Label>
                    <Select
                      value={decoderConfig.type}
                      onValueChange={(value: 'delimiter' | 'regex') => 
                        handleDecoderConfigChange({ type: value })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delimiter">Delimiter-based Split</SelectItem>
                        <SelectItem value="regex">Regex-based Extraction</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Delimiter Configuration */}
                  {decoderConfig.type === 'delimiter' && (
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Delimiter</Label>
                      <Select
                        value={decoderConfig.delimiter || 'space'}
                        onValueChange={(value) => 
                          handleDecoderConfigChange({ delimiter: value })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="space">Space</SelectItem>
                          <SelectItem value="underscore">Underscore (_)</SelectItem>
                          <SelectItem value="hyphen">Hyphen (-)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Regex Configuration */}
                  {decoderConfig.type === 'regex' && (
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Regex Pattern</Label>
                      <Input
                        value={decoderConfig.regex || ''}
                        onChange={(e) => 
                          handleDecoderConfigChange({ regex: e.target.value })
                        }
                        placeholder="(?P&lt;quarter&gt;Q\d)\s(?P&lt;year&gt;\d{4})"
                        className="w-full font-mono text-xs"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Use named capture groups (e.g., (?P&lt;name&gt;pattern))
                      </p>
                    </div>
                  )}

                  {/* Mappings Table */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-medium">Column Mappings</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddMapping}
                        className="h-7 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Mapping
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {decoderConfig.mappings.map((mapping, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded border">
                          <div className="flex-1">
                            <Label className="text-xs text-gray-600">Index {mapping.index}</Label>
                          </div>
                          <Input
                            value={mapping.column}
                            onChange={(e) => 
                              handleUpdateMapping(idx, { column: e.target.value })
                            }
                            placeholder="Column name"
                            className="flex-1 h-8 text-xs"
                          />
                          <Select
                            value={mapping.dtype}
                            onValueChange={(value: 'string' | 'int' | 'category') => 
                              handleUpdateMapping(idx, { dtype: value })
                            }
                          >
                            <SelectTrigger className="w-24 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="string">String</SelectItem>
                              <SelectItem value="int">Integer</SelectItem>
                              <SelectItem value="category">Category</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveMapping(idx)}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Validation Errors */}
                  {!decoderValidation.isValid && (
                    <Card className="p-3 bg-red-50 border-red-200">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-red-900 mb-1">Validation Errors:</p>
                          <ul className="text-xs text-red-800 list-disc list-inside">
                            {decoderValidation.errors.map((err, idx) => (
                              <li key={idx}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* Decoder Stats */}
                  {decoderStats && (
                    <Card className="p-3 bg-gray-50 border-gray-200">
                      <p className="text-xs font-medium mb-1">Decoder Statistics:</p>
                      <div className="text-xs text-gray-700 space-y-1">
                        <div>Match Rate: {decoderStats.matchRate.toFixed(1)}%</div>
                        <div>Matched Rows: {decoderStats.matchedRows.toLocaleString()}</div>
                        {decoderStats.failedRows > 0 && (
                          <div className="text-orange-600">
                            Failed Rows: {decoderStats.failedRows.toLocaleString()} 
                            ({((decoderStats.failedRows / (decoderStats.matchedRows + decoderStats.failedRows)) * 100).toFixed(1)}%)
                          </div>
                        )}
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview and Apply Buttons */}
      <div className="pt-2 space-y-2">
        {/* See Preview Button - Commented out for now */}
        {/* <Button
          onClick={onPreview || (() => {})}
          disabled={isComputing || !data.datasetPath || (data.idVars.length === 0 && data.valueVars.length === 0)}
          variant="outline"
          className="w-full border-[#1A73E8] text-[#1A73E8] hover:bg-[#E8F0FE]"
        >
          <Eye className="h-4 w-4 mr-2" />
          {isComputing ? 'Computing...' : 'See Preview'}
        </Button> */}
        
        {/* Apply Button */}
        <Button
          onClick={onApply || (() => {})}
          disabled={
            isComputing || 
            !data.datasetPath || 
            data.valueVars.length === 0 ||
            !data.variableColumnName?.trim() ||
            !data.valueColumnName?.trim() ||
            (decoderConfig.enabled && !decoderValidation.isValid)
          }
          className="w-full bg-[#1A73E8] hover:bg-[#1455ad] text-white"
        >
          <Check className="h-4 w-4 mr-2" />
          {isComputing ? 'Applying...' : 'Apply'}
        </Button>
      </div>

      {/* Info Message */}
      {fieldOptions.length === 0 && (
        <Card className="p-3 bg-yellow-50 border-yellow-200">
          <p className="text-xs text-yellow-800">
            Please select a dataset from the Input Files tab to see available columns.
          </p>
        </Card>
      )}
    </div>
  );
};

export default UnpivotSettings;

