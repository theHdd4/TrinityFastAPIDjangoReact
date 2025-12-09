import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Share2, Plus, Palette } from 'lucide-react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { TableSettings, ConditionalFormatRule } from '../../TableAtom';
import RuleBuilder from '../conditional-formatting/RuleBuilder';
import RuleList from '../conditional-formatting/RuleList';

interface Props {
  atomId: string;
}

const TableExhibition: React.FC<Props> = ({ atomId }) => {
  const cards = useLaboratoryStore(state => state.cards);
  const atom = cards.flatMap(card => card.atoms).find(a => a.id === atomId);
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  
  const baseSettings = (atom?.settings as Partial<TableSettings> | undefined) || {};
  const settings: TableSettings = {
    visibleColumns: [],
    columnOrder: [],
    columnWidths: {},
    rowHeight: 24,
    showRowNumbers: true,
    showSummaryRow: false,
    frozenColumns: 0,
    filters: {},
    sortConfig: [],
    currentPage: 1,
    pageSize: 15,
    layout: {
      headerRow: true,
      totalRow: false,
      bandedRows: false,
      bandedColumns: false,
      firstColumn: false,
      lastColumn: false,
    },
    design: {
      theme: 'plain',
      borderStyle: 'all',
    },
    conditionalFormats: [],
    ...baseSettings,
    conditionalFormats: baseSettings.conditionalFormats || [],
  };

  const [showRuleBuilder, setShowRuleBuilder] = useState(false);
  const [editingRule, setEditingRule] = useState<ConditionalFormatRule | undefined>(undefined);

  const columns = settings.tableData?.columns || [];
  const rules = settings.conditionalFormats || [];

  const handleAddRule = () => {
    setEditingRule(undefined);
    setShowRuleBuilder(true);
  };

  const handleEditRule = (rule: ConditionalFormatRule) => {
    setEditingRule(rule);
    setShowRuleBuilder(true);
  };

  const handleSaveRule = (rule: ConditionalFormatRule) => {
    const currentRules = settings.conditionalFormats || [];
    let updatedRules: ConditionalFormatRule[];

    if (editingRule) {
      // Update existing rule
      updatedRules = currentRules.map(r => r.id === rule.id ? rule : r);
    } else {
      // Add new rule
      updatedRules = [...currentRules, rule];
    }

    updateSettings(atomId, { conditionalFormats: updatedRules });
    setShowRuleBuilder(false);
    setEditingRule(undefined);
  };

  const handleDeleteRule = (ruleId: string) => {
    const updatedRules = rules.filter(r => r.id !== ruleId);
    updateSettings(atomId, { conditionalFormats: updatedRules });
  };

  const handleToggleRule = (ruleId: string) => {
    const updatedRules = rules.map(r => 
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    updateSettings(atomId, { conditionalFormats: updatedRules });
  };

  return (
    <div className="space-y-4 p-4">
      {/* Conditional Formatting Section */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-teal-500" />
            <h3 className="text-sm font-semibold text-gray-800">Conditional Formatting</h3>
          </div>
          <Button
            onClick={handleAddRule}
            size="sm"
            className="h-8"
            disabled={columns.length === 0}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Rule
          </Button>
        </div>

        {columns.length === 0 ? (
          <p className="text-xs text-gray-500">
            Load a table first to add conditional formatting rules.
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-4">
              Automatically highlight cells based on their values
            </p>

            <RuleList
              rules={rules}
              onEdit={handleEditRule}
              onDelete={handleDeleteRule}
              onToggle={handleToggleRule}
            />
          </>
        )}
      </Card>

      {/* Export Options */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Export Options</h3>
        <p className="text-xs text-gray-500 mb-4">
          Export and share your table data
        </p>

        <div className="space-y-2">
          <button
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            disabled
          >
            <Download className="w-4 h-4" />
            <span>Export to CSV (Coming Soon)</span>
          </button>

          <button
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            disabled
          >
            <Download className="w-4 h-4" />
            <span>Export to Excel (Coming Soon)</span>
          </button>

          <button
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            disabled
          >
            <Share2 className="w-4 h-4" />
            <span>Share Table (Coming Soon)</span>
          </button>
        </div>
      </Card>

      {/* Rule Builder Dialog */}
      {showRuleBuilder && columns.length > 0 && (
        <RuleBuilder
          columns={columns}
          onSave={handleSaveRule}
          onCancel={() => {
            setShowRuleBuilder(false);
            setEditingRule(undefined);
          }}
          existingRule={editingRule}
        />
      )}
      {showRuleBuilder && columns.length === 0 && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md">
            <h3 className="text-lg font-semibold mb-2">No Columns Available</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please load a table with data before adding conditional formatting rules.
            </p>
            <Button onClick={() => {
              setShowRuleBuilder(false);
              setEditingRule(undefined);
            }}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableExhibition;



