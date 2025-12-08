import React from 'react';
import { CheckCircle2, Lightbulb, BarChart3, Plus, FileText, ClipboardCheck, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';

interface U7SummaryProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
}

export const U7Summary: React.FC<U7SummaryProps> = ({ flow }) => {
  const { state } = flow;
  const {
    uploadedFiles,
    headerSelections,
    columnNameEdits,
    dataTypeSelections,
    missingValueStrategies,
  } = state;

  const getSummaryStats = () => {
    let totalColumns = 0;
    let totalRenamed = 0;
    let totalTypesChanged = 0;
    let totalStrategiesSet = 0;
    let ruleBasedSuggestionsUsed = 0;

    uploadedFiles.forEach(file => {
      const edits = columnNameEdits[file.name] || [];
      totalColumns += edits.length;
      totalRenamed += edits.filter(e => e.editedName !== e.originalName).length;
      ruleBasedSuggestionsUsed += edits.filter(e => e.historicalMatch).length;

      const types = dataTypeSelections[file.name] || [];
      totalTypesChanged += types.filter(t => t.selectedType !== t.detectedType).length;

      const strategies = missingValueStrategies[file.name] || [];
      totalStrategiesSet += strategies.filter(s => s.strategy !== 'leave_missing').length;
    });

    return {
      totalFiles: uploadedFiles.length,
      totalColumns,
      totalRenamed,
      totalTypesChanged,
      totalStrategiesSet,
      ruleBasedSuggestionsUsed,
    };
  };

  const stats = getSummaryStats();

  return (
    <StageLayout
      title="Upload Complete — Your Data Is Ready"
      explanation="What Trinity found: Your dataset has been successfully primed and is ready for analysis."
      helpText="Review the summary below and choose your next step."
    >

      <div className="space-y-6">
        {/* Success Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-[#41C185] flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Summary Checklist */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
        <h4 className="font-semibold text-gray-900">Summary of Decisions</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#41C185]" />
              <span className="text-sm text-gray-700">Files Uploaded</span>
            </div>
            <Badge variant="outline">{stats.totalFiles}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#41C185]" />
              <span className="text-sm text-gray-700">Header Rows Selected</span>
            </div>
            <Badge variant="outline">{Object.keys(headerSelections).length}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#41C185]" />
              <span className="text-sm text-gray-700">Column Names Processed</span>
            </div>
            <Badge variant="outline">{stats.totalColumns}</Badge>
          </div>
          {stats.totalRenamed > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#41C185]" />
                <span className="text-sm text-gray-700">Columns Renamed</span>
              </div>
              <Badge variant="outline">{stats.totalRenamed}</Badge>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#41C185]" />
              <span className="text-sm text-gray-700">Data Types Confirmed</span>
            </div>
            <Badge variant="outline">{stats.totalColumns}</Badge>
          </div>
          {stats.totalTypesChanged > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#41C185]" />
                <span className="text-sm text-gray-700">Data Types Changed</span>
              </div>
              <Badge variant="outline">{stats.totalTypesChanged}</Badge>
            </div>
          )}
          {stats.totalStrategiesSet > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#41C185]" />
                <span className="text-sm text-gray-700">Missing Value Strategies Set</span>
              </div>
              <Badge variant="outline">{stats.totalStrategiesSet}</Badge>
            </div>
          )}
          {stats.ruleBasedSuggestionsUsed > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-[#FFBD59]" />
                <span className="text-sm text-gray-700">Rule-Based Suggestions Used</span>
              </div>
              <Badge className="bg-[#FFBD59] text-white">{stats.ruleBasedSuggestionsUsed}</Badge>
            </div>
          )}
        </div>
        </div>

        {/* Next Steps - Single Key Action: Choose Next Step */}
        <div className="space-y-4">
        <h4 className="font-semibold text-gray-900">What would you like to do next?</h4>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col items-start gap-2"
            onClick={() => {
              // TODO: Navigate to data overview
            }}
          >
            <BarChart3 className="w-5 h-5 text-[#458EE2]" />
            <div className="text-left">
              <div className="font-medium">View Overview</div>
              <div className="text-xs text-gray-500">Summary statistics and distributions</div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col items-start gap-2"
            onClick={() => {
              // TODO: Open metric creator
            }}
          >
            <Plus className="w-5 h-5 text-[#458EE2]" />
            <div className="text-left">
              <div className="font-medium">Create Metrics</div>
              <div className="text-xs text-gray-500">Create new columns or metrics</div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col items-start gap-2"
            onClick={() => {
              // TODO: Add another dataset
            }}
          >
            <FileText className="w-5 h-5 text-[#458EE2]" />
            <div className="text-left">
              <div className="font-medium">Add Another Dataset</div>
              <div className="text-xs text-gray-500">Upload and prime another file</div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-4 flex flex-col items-start gap-2"
            onClick={() => {
              // TODO: Validate dataset
            }}
          >
            <ClipboardCheck className="w-5 h-5 text-[#458EE2]" />
            <div className="text-left">
              <div className="font-medium">Validate Dataset</div>
              <div className="text-xs text-gray-500">Run analysis-specific checks</div>
            </div>
          </Button>
        </div>
        <Button
          className="w-full bg-[#458EE2] hover:bg-[#3a7bc7] text-white h-auto py-4 flex items-center justify-center gap-2"
          onClick={() => {
            // TODO: Ask Trinity AI for suggestions
          }}
        >
          <Bot className="w-5 h-5" />
          <span>Ask Trinity AI to Suggest Next Step</span>
        </Button>
        </div>
      </div>
    </StageLayout>
  );
};

