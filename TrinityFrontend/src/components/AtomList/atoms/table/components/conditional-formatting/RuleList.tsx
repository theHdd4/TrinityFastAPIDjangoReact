import React from 'react';
import { ConditionalFormatRule } from './types';
import { Trash2, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface RuleListProps {
  rules: ConditionalFormatRule[];
  onEdit: (rule: ConditionalFormatRule) => void;
  onDelete: (ruleId: string) => void;
  onToggle: (ruleId: string) => void;
}

const OPERATOR_LABELS: Record<string, string> = {
  'gt': 'Greater Than',
  'lt': 'Less Than',
  'eq': 'Equal To',
  'ne': 'Not Equal To',
  'contains': 'Contains',
  'starts_with': 'Starts With',
  'ends_with': 'Ends With',
  'between': 'Between',
  'top_n': 'Top N',
  'bottom_n': 'Bottom N',
  'above_average': 'Above Average',
  'below_average': 'Below Average',
};

const RuleList: React.FC<RuleListProps> = ({ rules, onEdit, onDelete, onToggle }) => {
  if (rules.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-4">
        No conditional formatting rules. Click "Add Rule" to create one.
      </div>
    );
  }

  const formatRuleDescription = (rule: ConditionalFormatRule): string => {
    if (rule.type === 'highlight' && rule.operator) {
      const opLabel = OPERATOR_LABELS[rule.operator] || rule.operator;
      
      if (rule.operator === 'between' && rule.value1 !== undefined && rule.value2 !== undefined) {
        return `${opLabel} ${rule.value1} and ${rule.value2}`;
      } else if (rule.value1 !== undefined) {
        return `${opLabel} ${rule.value1}`;
      } else {
        return opLabel;
      }
    }
    
    return rule.type.charAt(0).toUpperCase() + rule.type.slice(1).replace('_', ' ');
  };

  return (
    <div className="space-y-2">
      {rules.map(rule => (
        <Card key={rule.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => onToggle(rule.id)}
                  className="flex-shrink-0"
                >
                  {rule.enabled ? (
                    <ToggleRight className="w-5 h-5 text-teal-500" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                <span className={`text-sm font-medium ${rule.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                  {rule.column}
                </span>
              </div>
              
              <div className="text-xs text-gray-600 ml-7 mb-2">
                {formatRuleDescription(rule)}
              </div>

              {rule.type === 'highlight' && rule.style && (
                <div className="flex items-center gap-2 ml-7">
                  <div
                    className="w-4 h-4 rounded border"
                    style={{ backgroundColor: rule.style.backgroundColor }}
                  />
                  {rule.style.textColor && (
                    <div
                      className="w-4 h-4 rounded border"
                      style={{ backgroundColor: rule.style.textColor }}
                    />
                  )}
                  {rule.style.fontWeight === 'bold' && (
                    <span className="text-xs text-gray-500">Bold</span>
                  )}
                </div>
              )}

              <div className="text-xs text-gray-500 ml-7 mt-1">
                Priority: {rule.priority}
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(rule)}
                className="h-8 w-8 p-0"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(rule.id)}
                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default RuleList;



