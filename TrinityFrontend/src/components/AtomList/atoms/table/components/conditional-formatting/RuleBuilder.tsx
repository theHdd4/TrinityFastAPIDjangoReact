import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConditionalFormatRule, Operator } from './types';

// Simple UUID generator (fallback if uuid package not available)
const generateId = () => {
  return `cf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

interface RuleBuilderProps {
  columns: string[];
  onSave: (rule: ConditionalFormatRule) => void;
  onCancel: () => void;
  existingRule?: ConditionalFormatRule;
}

const OPERATORS: { value: Operator; label: string; needsValue: boolean; needsSecondValue: boolean }[] = [
  { value: 'gt', label: 'Greater Than', needsValue: true, needsSecondValue: false },
  { value: 'lt', label: 'Less Than', needsValue: true, needsSecondValue: false },
  { value: 'eq', label: 'Equal To', needsValue: true, needsSecondValue: false },
  { value: 'ne', label: 'Not Equal To', needsValue: true, needsSecondValue: false },
  { value: 'contains', label: 'Text Contains', needsValue: true, needsSecondValue: false },
  { value: 'starts_with', label: 'Starts With', needsValue: true, needsSecondValue: false },
  { value: 'ends_with', label: 'Ends With', needsValue: true, needsSecondValue: false },
  { value: 'between', label: 'Between', needsValue: true, needsSecondValue: true },
  { value: 'top_n', label: 'Top N', needsValue: true, needsSecondValue: false },
  { value: 'bottom_n', label: 'Bottom N', needsValue: true, needsSecondValue: false },
  { value: 'above_average', label: 'Above Average', needsValue: false, needsSecondValue: false },
  { value: 'below_average', label: 'Below Average', needsValue: false, needsSecondValue: false },
];

const RuleBuilder: React.FC<RuleBuilderProps> = ({
  columns,
  onSave,
  onCancel,
  existingRule
}) => {

  // Initialize with first column if available, otherwise undefined (for Select component)
  const initialColumn = existingRule?.column || (columns.length > 0 ? columns[0] : undefined);
  const [ruleType, setRuleType] = useState<'highlight' | 'color_scale'>(existingRule?.type || 'highlight');
  const [selectedColumn, setSelectedColumn] = useState<string | undefined>(initialColumn);
  const [operator, setOperator] = useState<Operator | undefined>(existingRule?.operator || undefined);
  const [value1, setValue1] = useState<string>(existingRule?.value1?.toString() || '');
  const [value2, setValue2] = useState<string>(existingRule?.value2?.toString() || '');
  const [backgroundColor, setBackgroundColor] = useState(existingRule?.style?.backgroundColor || '#dcfce7');
  const [textColor, setTextColor] = useState(existingRule?.style?.textColor || '#000000');
  const [fontWeight, setFontWeight] = useState<'bold' | 'normal'>(existingRule?.style?.fontWeight || 'normal');
  
  // Color Scale specific state
  const [minColor, setMinColor] = useState(existingRule?.min_color || '#0000FF');
  const [maxColor, setMaxColor] = useState(existingRule?.max_color || '#FF0000');
  const [midColor, setMidColor] = useState(existingRule?.mid_color || '');
  const [useThreeColor, setUseThreeColor] = useState(!!existingRule?.mid_color);

  const selectedOperator = OPERATORS.find(op => op.value === operator);

  const handleSave = () => {
    // For color scale, we don't need operator
    if (ruleType === 'color_scale') {
      if (!selectedColumn || !minColor || !maxColor) {
        return;
      }
      if (useThreeColor && !midColor) {
        return;
      }
    } else {
      // For highlight rules, we need column and operator
      if (!selectedColumn || !operator) {
        return;
      }

      // Validate values based on operator
      if (selectedOperator?.needsValue && !value1) {
        return;
      }
      if (selectedOperator?.needsSecondValue && !value2) {
        return;
      }
    }

    let rule: ConditionalFormatRule;

    if (ruleType === 'color_scale') {
      rule = {
        type: 'color_scale',
        id: existingRule?.id || generateId(),
        enabled: existingRule?.enabled !== false,
        priority: existingRule?.priority || 0,
        column: selectedColumn,
        min_color: minColor,
        max_color: maxColor,
        mid_color: useThreeColor ? midColor : undefined
      };
    } else {
      rule = {
        type: 'highlight',
        id: existingRule?.id || generateId(),
        enabled: existingRule?.enabled !== false,
        priority: existingRule?.priority || 0,
        column: selectedColumn,
        operator: operator as Operator,
        value1: selectedOperator?.needsValue ? (operator === 'top_n' || operator === 'bottom_n' ? parseInt(value1) : value1) : undefined,
        value2: selectedOperator?.needsSecondValue ? value2 : undefined,
        style: {
          backgroundColor,
          textColor,
          fontWeight
        }
      };
    }

    onSave(rule);
  };

  const isValid = ruleType === 'color_scale' 
    ? !!selectedColumn && !!minColor && !!maxColor && (!useThreeColor || !!midColor)
    : !!selectedColumn && !!operator && (!selectedOperator?.needsValue || value1) && (!selectedOperator?.needsSecondValue || value2);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()} modal={true}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingRule ? 'Edit Conditional Formatting Rule' : 'Add Conditional Formatting Rule'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Rule Type Selection */}
          <div>
            <Label htmlFor="ruleType">Rule Type</Label>
            <Select 
              value={ruleType} 
              onValueChange={(val) => {
                setRuleType(val as 'highlight' | 'color_scale');
                // Reset operator when switching types
                if (val === 'color_scale') {
                  setOperator(undefined);
                }
              }}
            >
              <SelectTrigger id="ruleType" className="w-full">
                <SelectValue placeholder="Select rule type" />
              </SelectTrigger>
              <SelectContent className="z-[12020]" position="popper">
                <SelectItem value="highlight">Highlight Cell Rules</SelectItem>
                <SelectItem value="color_scale">Color Scale</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Column Selection */}
          <div>
            <Label htmlFor="column">Column</Label>
            <Select 
              value={selectedColumn} 
              onValueChange={(val) => {
                setSelectedColumn(val);
              }}
              disabled={columns.length === 0}
            >
              <SelectTrigger id="column" className="w-full">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent className="z-[12020]" position="popper">
                {columns.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-gray-500">No columns available</div>
                ) : (
                  columns.map(col => (
                    <SelectItem key={col} value={col}>{col}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {columns.length === 0 && (
              <p className="text-xs text-red-500 mt-1">Please load a table with data first</p>
            )}
            {columns.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">{columns.length} column(s) available</p>
            )}
          </div>

          {/* Highlight Rule Fields */}
          {ruleType === 'highlight' && (
            <>
              {/* Operator Selection */}
              <div>
                <Label htmlFor="operator">Condition</Label>
                <Select 
                  value={operator} 
                  onValueChange={(val) => {
                    setOperator(val as Operator);
                  }}
                >
                  <SelectTrigger id="operator" className="w-full">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent className="z-[12020]" position="popper">
                    {OPERATORS.map(op => (
                      <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Value 1 */}
              {selectedOperator?.needsValue && (
                <div>
                  <Label htmlFor="value1">
                    {operator === 'top_n' || operator === 'bottom_n' ? 'N (number of items)' : 'Value'}
                  </Label>
                  <Input
                    id="value1"
                    type={operator === 'top_n' || operator === 'bottom_n' ? 'number' : 'text'}
                    value={value1}
                    onChange={(e) => setValue1(e.target.value)}
                    placeholder={operator === 'top_n' || operator === 'bottom_n' ? 'e.g., 10' : 'Enter value'}
                  />
                </div>
              )}

              {/* Value 2 (for BETWEEN) */}
              {selectedOperator?.needsSecondValue && (
                <div>
                  <Label htmlFor="value2">To Value</Label>
                  <Input
                    id="value2"
                    type="text"
                    value={value2}
                    onChange={(e) => setValue2(e.target.value)}
                    placeholder="Enter second value"
                  />
                </div>
              )}
            </>
          )}

          {/* Color Scale Fields */}
          {ruleType === 'color_scale' && (
            <>
              <div className="space-y-3 p-3 bg-blue-50 rounded border border-blue-200">
                <p className="text-xs text-blue-800">
                  Color scales automatically apply gradient colors based on cell values. Lower values get the minimum color, higher values get the maximum color.
                </p>
              </div>

              {/* Min Color */}
              <div>
                <Label htmlFor="minColor">Minimum Color (Low Values)</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="minColor"
                    type="color"
                    value={minColor}
                    onChange={(e) => setMinColor(e.target.value)}
                    className="w-12 h-8 rounded border"
                  />
                  <Input
                    type="text"
                    value={minColor}
                    onChange={(e) => setMinColor(e.target.value)}
                    className="flex-1"
                    placeholder="#0000FF"
                  />
                </div>
              </div>

              {/* Max Color */}
              <div>
                <Label htmlFor="maxColor">Maximum Color (High Values)</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="maxColor"
                    type="color"
                    value={maxColor}
                    onChange={(e) => setMaxColor(e.target.value)}
                    className="w-12 h-8 rounded border"
                  />
                  <Input
                    type="text"
                    value={maxColor}
                    onChange={(e) => setMaxColor(e.target.value)}
                    className="flex-1"
                    placeholder="#FF0000"
                  />
                </div>
              </div>

              {/* 3-Color Scale Option */}
              <div className="flex items-center gap-2">
                <input
                  id="useThreeColor"
                  type="checkbox"
                  checked={useThreeColor}
                  onChange={(e) => setUseThreeColor(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <Label htmlFor="useThreeColor" className="cursor-pointer">
                  Use 3-color scale (add middle color)
                </Label>
              </div>

              {/* Mid Color (if 3-color scale) */}
              {useThreeColor && (
                <div>
                  <Label htmlFor="midColor">Middle Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="midColor"
                      type="color"
                      value={midColor || '#00FF00'}
                      onChange={(e) => setMidColor(e.target.value)}
                      className="w-12 h-8 rounded border"
                    />
                    <Input
                      type="text"
                      value={midColor}
                      onChange={(e) => setMidColor(e.target.value)}
                      className="flex-1"
                      placeholder="#00FF00"
                    />
                  </div>
                </div>
              )}

              {/* Color Scale Preview */}
              <div className="mt-4 p-3 border rounded bg-gradient-to-r" 
                   style={{
                     background: useThreeColor 
                       ? `linear-gradient(to right, ${minColor}, ${midColor || '#00FF00'}, ${maxColor})`
                       : `linear-gradient(to right, ${minColor}, ${maxColor})`
                   }}>
                <span className="text-sm text-white drop-shadow">Preview: Gradient from minimum (left) to maximum (right)</span>
              </div>
            </>
          )}

          {/* Formatting Options (only for highlight rules) */}
          {ruleType === 'highlight' && (
          <div className="space-y-3 pt-2 border-t">
            <h4 className="text-sm font-semibold">Formatting Style</h4>
            
            {/* Background Color */}
            <div className="flex items-center gap-2">
              <Label htmlFor="bgColor" className="w-32">Background Color</Label>
              <div className="flex items-center gap-2 flex-1">
                <input
                  id="bgColor"
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-12 h-8 rounded border"
                />
                <Input
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="flex-1"
                  placeholder="#RRGGBB"
                />
              </div>
            </div>

            {/* Text Color */}
            <div className="flex items-center gap-2">
              <Label htmlFor="textColor" className="w-32">Text Color</Label>
              <div className="flex items-center gap-2 flex-1">
                <input
                  id="textColor"
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-12 h-8 rounded border"
                />
                <Input
                  type="text"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="flex-1"
                  placeholder="#RRGGBB"
                />
              </div>
            </div>

            {/* Font Weight */}
            <div className="flex items-center gap-2">
              <Label htmlFor="fontWeight" className="w-32">Font Weight</Label>
              <Select value={fontWeight} onValueChange={(val) => setFontWeight(val as 'bold' | 'normal')}>
                <SelectTrigger id="fontWeight" className="flex-1">
                  <SelectValue>
                    {fontWeight === 'bold' ? 'Bold' : 'Normal'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-[12020]">
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="bold">Bold</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Preview */}
            <div className="mt-4 p-3 border rounded" style={{ backgroundColor, color: textColor, fontWeight }}>
              <span className="text-sm">Preview: This is how formatted cells will look</span>
            </div>
          </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {existingRule ? 'Update Rule' : 'Add Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RuleBuilder;

