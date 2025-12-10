import React from 'react';
import { CheckCircle2, BarChart3, Plus, FileText, GitMerge, Bot, Download, Database, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';

interface U7SuccessProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onClose?: () => void;
  onRestart?: () => void;
}

export const U7Success: React.FC<U7SuccessProps> = ({ flow, onClose, onRestart }) => {
  const { state } = flow;
  const {
    uploadedFiles,
    headerSelections,
    columnNameEdits,
    dataTypeSelections,
    missingValueStrategies,
  } = state;

  // Calculate summary statistics
  const getSummaryStats = () => {
    let totalRenamed = 0;
    let totalTypesChanged = 0;
    let totalStrategiesSet = 0;
    let totalIdentifiers = 0;
    let totalMeasures = 0;

    uploadedFiles.forEach(file => {
      const edits = columnNameEdits[file.name] || [];
      totalRenamed += edits.filter(e => e.editedName !== e.originalName && e.keep !== false).length;

      const types = dataTypeSelections[file.name] || [];
      totalTypesChanged += types.filter(t => t.selectedType !== t.detectedType).length;
      totalIdentifiers += types.filter(t => t.columnRole === 'identifier').length;
      totalMeasures += types.filter(t => t.columnRole === 'measure').length;

      const strategies = missingValueStrategies[file.name] || [];
      totalStrategiesSet += strategies.filter(s => s.strategy !== 'none').length;
    });

    return {
      totalFiles: uploadedFiles.length,
      totalRenamed,
      totalTypesChanged,
      totalStrategiesSet,
      totalIdentifiers,
      totalMeasures,
      hasHeaders: Object.keys(headerSelections).length > 0,
    };
  };

  const stats = getSummaryStats();
  const currentTimestamp = new Date().toLocaleString();

  const handleDownload = () => {
    // TODO: Implement download functionality
    console.log('Download cleaned dataset');
  };

  const handleAction = (action: string) => {
    // TODO: Implement navigation to different actions
    console.log(`Action: ${action}`);
    // Close the modal after action
    onClose?.();
  };

  return (
    <StageLayout
      title="Your Data Is Ready"
      explanation=""
      helpText=""
    >
      <div className="space-y-8">
        {/* Success Icon & Primary Message */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-[#41C185] flex items-center justify-center animate-pulse">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-gray-900">
              Your dataset has been successfully primed and is now ready for analysis.
            </h2>
            <p className="text-gray-600">
              It has been saved to your project and is available for all actions in Trinity Lab and Workflow.
            </p>
          </div>
        </div>

        {/* Summary Panel */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">What We Completed</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {stats.hasHeaders && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#41C185] flex-shrink-0" />
                <span className="text-sm text-gray-700">Headers identified and cleaned</span>
              </div>
            )}
            {stats.totalRenamed > 0 && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#41C185] flex-shrink-0" />
                <span className="text-sm text-gray-700">Column names finalized ({stats.totalRenamed} renamed)</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#41C185] flex-shrink-0" />
              <span className="text-sm text-gray-700">Data types validated</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#41C185] flex-shrink-0" />
              <span className="text-sm text-gray-700">
                Identifiers & Measures assigned ({stats.totalIdentifiers} identifiers, {stats.totalMeasures} measures)
              </span>
            </div>
            {stats.totalStrategiesSet > 0 && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#41C185] flex-shrink-0" />
                <span className="text-sm text-gray-700">Missing values treated ({stats.totalStrategiesSet} columns)</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#41C185] flex-shrink-0" />
              <span className="text-sm text-gray-700">Row alignment issues resolved</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#41C185] flex-shrink-0" />
              <span className="text-sm text-gray-700">Dataset version created and saved</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <Badge className="bg-[#41C185] text-white">
              <Database className="w-3 h-3 mr-1" />
              This dataset is now classified as 'Green' — fully primed.
            </Badge>
          </div>
        </div>

        {/* Guidance Text */}
        <div className="text-center">
          <p className="text-gray-700 text-lg">
            Your dataset is now ready to use. You can start analyzing it, enrich it further, or ask Trinity AI what to do next.
          </p>
        </div>

        {/* Next Actions Panel */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900 text-center">What would you like to do next?</h3>
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center justify-center gap-3 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              onClick={() => handleAction('validate')}
            >
              <ClipboardCheck className="w-8 h-8 text-[#458EE2]" />
              <div className="text-center">
                <div className="font-medium text-gray-900">Validate Dataset</div>
                <div className="text-xs text-gray-500 mt-1">Ensure your dataset meets analysis requirements</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center justify-center gap-3 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              onClick={() => handleAction('overview')}
            >
              <BarChart3 className="w-8 h-8 text-[#458EE2]" />
              <div className="text-center">
                <div className="font-medium text-gray-900">View Data Overview</div>
                <div className="text-xs text-gray-500 mt-1">Explore distributions and summary stats</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center justify-center gap-3 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              onClick={() => handleAction('metrics')}
            >
              <Plus className="w-8 h-8 text-[#458EE2]" />
              <div className="text-center">
                <div className="font-medium text-gray-900">Create Metrics & New Columns</div>
                <div className="text-xs text-gray-500 mt-1">Build derived metrics or transformations</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center justify-center gap-3 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              onClick={() => handleAction('upload')}
            >
              <FileText className="w-8 h-8 text-[#458EE2]" />
              <div className="text-center">
                <div className="font-medium text-gray-900">Upload Another Dataset</div>
                <div className="text-xs text-gray-500 mt-1">Add supporting files or append more data</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center justify-center gap-3 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              onClick={() => handleAction('merge')}
            >
              <GitMerge className="w-8 h-8 text-[#458EE2]" />
              <div className="text-center">
                <div className="font-medium text-gray-900">Merge, Stack, or Aggregate</div>
                <div className="text-xs text-gray-500 mt-1">Combine datasets or create master tables</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-6 flex flex-col items-center justify-center gap-3 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              onClick={() => handleAction('ai')}
            >
              <Bot className="w-8 h-8 text-[#458EE2]" />
              <div className="text-center">
                <div className="font-medium text-gray-900">Ask Trinity AI for Next Step</div>
                <div className="text-xs text-gray-500 mt-1">Get AI suggestions based on your use case</div>
              </div>
            </Button>
          </div>
        </div>

        {/* Optional Additional Panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
          {/* Saved in Data Library */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Database className="w-5 h-5 text-[#458EE2] mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm mb-1">Saved in Data Library</h4>
                <p className="text-xs text-gray-600">
                  Your dataset is available in the Saved Dataframes Panel under 'Primed Datasets'.
                </p>
              </div>
            </div>
          </div>

          {/* Dataset Versioning */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <FileText className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-gray-900 text-sm mb-1">Dataset Versioning</h4>
                <p className="text-xs text-gray-600">
                  Version 1 created • {currentTimestamp}
                </p>
              </div>
            </div>
          </div>

          {/* Download Cleaned Dataset */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Download className="w-5 h-5 text-[#41C185] mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 text-sm mb-2">Download Cleaned Dataset</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="w-full text-xs"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Download CSV/XLSX
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <Button
            variant="ghost"
            onClick={onRestart}
            className="text-gray-600 text-sm"
          >
            Restart Upload Flow
          </Button>
          <Button
            onClick={onClose}
            className="bg-[#41C185] hover:bg-[#36a870] text-white"
          >
            Close
          </Button>
        </div>
      </div>
    </StageLayout>
  );
};

