import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { useToast } from '@/hooks/use-toast';
import { TableSettings } from '../../TableAtom';
import ThemeSelector from '../design/ThemeSelector';
import { isNumericColumn } from '../../utils/tableUtils';
import RowHeightControl from '../RowHeightControl';
import RuleList from '../conditional-formatting/RuleList';
import RuleBuilder from '../conditional-formatting/RuleBuilder';
import { ConditionalFormatRule } from '../conditional-formatting/types';
import { aggregateTable } from '../../services/tableApi';

interface Props {
  atomId: string;
}

const TableSettingsTab: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  const { toast } = useToast();

  // Mode detection
  const mode = (settings as TableSettings).mode || 'load';
  const isDataSourceMode = mode === 'load';
  const isBlankTableMode = mode === 'blank';

  const handleSettingChange = (key: string, value: any) => {
    updateSettings(atomId, { [key]: value });
  };

  // Get layout and design with defaults
  const layout = (settings as TableSettings).layout || {
    headerRow: true,
    totalRow: false,
    bandedRows: false,
    bandedColumns: false,
    firstColumn: false,
    lastColumn: false,
  };
  const design = (settings as TableSettings).design || {
    theme: 'plain',
    borderStyle: 'all',
  };
  const totalRowConfig = (settings as TableSettings).totalRowConfig || {};
  const tableData = (settings as TableSettings).tableData;
  const visibleColumns = (settings as TableSettings).visibleColumns || [];
  const conditionalFormats = (settings as TableSettings).conditionalFormats || [];

  // Handle layout change
  const handleLayoutChange = (key: string, value: boolean) => {
    updateSettings(atomId, {
      layout: {
        ...layout,
        [key]: value,
      }
    });
  };

  // Handle design change
  const handleDesignChange = (key: string, value: any) => {
    updateSettings(atomId, {
      design: {
        ...design,
        [key]: value,
      }
    });
  };


  // Handle total row config change with API call
  const handleTotalRowConfigChange = async (column: string, aggType: string) => {
    const newTotalRowConfig = {
      ...totalRowConfig,
      [column]: aggType,
    };
    
    updateSettings(atomId, {
      totalRowConfig: newTotalRowConfig,
    });

    // If Total Row is enabled, call API to calculate aggregations on all rows
    if (layout.totalRow && settings.tableId && tableData) {
      try {
        // Build aggregations object for all columns with non-'none' aggregations
        const aggregations: Record<string, string[]> = {};
        Object.entries(newTotalRowConfig).forEach(([col, agg]) => {
          if (agg !== 'none' && typeof agg === 'string') {
            aggregations[col] = [agg];
          }
        });

        // Only call API if there are aggregations to calculate
        if (Object.keys(aggregations).length > 0) {
          const result = await aggregateTable(settings.tableId, aggregations);
          
          // Store aggregation results in settings for display
          // The TableCanvas component should use these results to display in Total Row
          updateSettings(atomId, {
            totalRowAggregations: result, // Store API response
          });

          toast({
            title: 'Aggregations Calculated',
            description: 'Total row values updated based on all table rows',
          });
        }
      } catch (error: any) {
        console.error('Failed to calculate aggregations:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to calculate aggregations',
          variant: 'destructive',
        });
      }
    }
  };

  // Conditional Formatting handlers
  const [showRuleBuilder, setShowRuleBuilder] = useState(false);
  const [editingRule, setEditingRule] = useState<ConditionalFormatRule | undefined>(undefined);

  const handleRuleAdd = (rule: ConditionalFormatRule) => {
    const newRules = [...conditionalFormats, rule];
    updateSettings(atomId, { conditionalFormats: newRules });
    setShowRuleBuilder(false);
    setEditingRule(undefined);
  };

  const handleRuleEdit = (rule: ConditionalFormatRule) => {
    setEditingRule(rule);
    setShowRuleBuilder(true);
  };

  const handleRuleDelete = (ruleId: string) => {
    const newRules = conditionalFormats.filter(r => r.id !== ruleId);
    updateSettings(atomId, { conditionalFormats: newRules });
  };

  const handleRuleToggle = (ruleId: string) => {
    const newRules = conditionalFormats.map(r =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    updateSettings(atomId, { conditionalFormats: newRules });
  };

  const handleRuleSave = (rule: ConditionalFormatRule) => {
    if (editingRule) {
      // Update existing rule
      const newRules = conditionalFormats.map(r =>
        r.id === editingRule.id ? rule : r
      );
      updateSettings(atomId, { conditionalFormats: newRules });
    } else {
      // Add new rule
      handleRuleAdd(rule);
    }
    setShowRuleBuilder(false);
    setEditingRule(undefined);
  };

  return (
    <div className="space-y-4 p-4">
      {/* 1. DISPLAY OPTIONS */}
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Display Options</h3>

        {/* Blank Table Mode: Show Row Numbers */}
        {isBlankTableMode && (
          <div className="flex items-center justify-between">
            <Label htmlFor="showRowNumbers" className="text-sm">
              Show Row Numbers
            </Label>
            <Switch
              id="showRowNumbers"
              checked={settings.showRowNumbers ?? true}
              onCheckedChange={(checked) => handleSettingChange('showRowNumbers', checked)}
            />
          </div>
        )}

        {/* Both Modes: Row Height */}
        <RowHeightControl
          value={settings.rowHeight || 3} // Default to 3px (1 unit)
          onChange={(value) => handleSettingChange('rowHeight', value)}
        />
      </Card>

      {/* 2. TABLE DESIGN */}
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Table Design</h3>

        {/* Theme Selector */}
        <div>
          <Label className="text-sm mb-2 block">Theme</Label>
          <ThemeSelector
            selectedTheme={design.theme}
            onThemeChange={(themeId) => handleDesignChange('theme', themeId)}
          />
        </div>

        {/* Border Style */}
        <div className="space-y-2">
          <Label className="text-sm">Border Style</Label>
          <select
            value={typeof design.borderStyle === 'string' ? design.borderStyle : 'all'}
            onChange={(e) => handleDesignChange('borderStyle', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="all">All Borders</option>
            <option value="none">No Borders</option>
            <option value="outside">Outside Only</option>
            <option value="horizontal">Horizontal Only</option>
            <option value="vertical">Vertical Only</option>
            <option value="header">Header Border Only</option>
          </select>
        </div>
      </Card>

      {/* 3. LAYOUT OPTIONS */}
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Layout Options</h3>

        {/* Both Modes: Banded Rows */}
        <div className="flex items-center justify-between">
          <Label htmlFor="bandedRows" className="text-sm">
            Banded Rows
          </Label>
          <Switch
            id="bandedRows"
            checked={layout.bandedRows}
            onCheckedChange={(checked) => handleLayoutChange('bandedRows', checked)}
          />
        </div>

        {/* Both Modes: Banded Columns */}
        <div className="flex items-center justify-between">
          <Label htmlFor="bandedColumns" className="text-sm">
            Banded Columns
          </Label>
          <Switch
            id="bandedColumns"
            checked={layout.bandedColumns}
            onCheckedChange={(checked) => handleLayoutChange('bandedColumns', checked)}
          />
        </div>

        {/* Blank Table Mode Only: Header Row */}
        {isBlankTableMode && (
          <div className="flex items-center justify-between">
            <Label htmlFor="headerRow" className="text-sm">
              Header Row
            </Label>
            <Switch
              id="headerRow"
              checked={layout.headerRow}
              onCheckedChange={(checked) => handleLayoutChange('headerRow', checked)}
            />
          </div>
        )}

        {/* Blank Table Mode Only: Total Row */}
        {isBlankTableMode && (
          <div className="flex items-center justify-between">
            <Label htmlFor="totalRow" className="text-sm">
              Total Row
            </Label>
            <Switch
              id="totalRow"
              checked={layout.totalRow}
              onCheckedChange={(checked) => handleLayoutChange('totalRow', checked)}
            />
          </div>
        )}

        {/* Blank Table Mode Only: First Column Emphasis */}
        {isBlankTableMode && (
          <div className="flex items-center justify-between">
            <Label htmlFor="firstColumn" className="text-sm">
              First Column Emphasis
            </Label>
            <Switch
              id="firstColumn"
              checked={layout.firstColumn}
              onCheckedChange={(checked) => handleLayoutChange('firstColumn', checked)}
            />
          </div>
        )}

        {/* Blank Table Mode Only: Last Column Emphasis */}
        {isBlankTableMode && (
          <div className="flex items-center justify-between">
            <Label htmlFor="lastColumn" className="text-sm">
              Last Column Emphasis
            </Label>
            <Switch
              id="lastColumn"
              checked={layout.lastColumn}
              onCheckedChange={(checked) => handleLayoutChange('lastColumn', checked)}
            />
          </div>
        )}

        {/* Total Row Aggregations - Only for Blank Table Mode when Total Row is enabled */}
        {isBlankTableMode && layout.totalRow && tableData && visibleColumns.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <Label className="text-sm font-medium mb-2 block">Total Row Aggregations</Label>
            <p className="text-xs text-gray-500 mb-3">
              Aggregations are calculated using all rows in the table
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {visibleColumns.map((column) => {
                const isNumeric = tableData.rows.length > 0 
                  ? isNumericColumn(tableData.rows, column)
                  : false;
                const currentAgg = totalRowConfig[column] || 'none';
                
                return (
                  <div key={column} className="flex items-center justify-between">
                    <Label className="text-xs text-gray-600 flex-1 truncate mr-2">
                      {column}
                    </Label>
                    <select
                      value={currentAgg}
                      onChange={(e) => handleTotalRowConfigChange(column, e.target.value)}
                      className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-teal-500 focus:border-teal-500"
                      disabled={!isNumeric && currentAgg !== 'none' && currentAgg !== 'count'}
                    >
                      <option value="none">None</option>
                      {isNumeric && <option value="sum">Sum</option>}
                      {isNumeric && <option value="average">Average</option>}
                      <option value="count">Count</option>
                      {isNumeric && <option value="min">Min</option>}
                      {isNumeric && <option value="max">Max</option>}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* 4. CONDITIONAL FORMATTING */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Conditional Formatting</h3>
          <Button
            onClick={() => {
              setEditingRule(undefined);
              setShowRuleBuilder(true);
            }}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            Add Rule
          </Button>
        </div>

        <RuleList
          rules={conditionalFormats}
          onEdit={handleRuleEdit}
          onDelete={handleRuleDelete}
          onToggle={handleRuleToggle}
        />
      </Card>

      {/* Rule Builder Dialog - Conditionally rendered */}
      {showRuleBuilder && (
        <RuleBuilder
          columns={visibleColumns}
          onSave={handleRuleSave}
          onCancel={() => {
            setShowRuleBuilder(false);
            setEditingRule(undefined);
          }}
          existingRule={editingRule}
        />
      )}
    </div>
  );
};

export default TableSettingsTab;
