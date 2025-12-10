import React from 'react';
import { FileText, CheckCircle2, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface U1StructuralScanProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
  onRestart?: () => void;
  onCancel?: () => void;
}

export const U1StructuralScan: React.FC<U1StructuralScanProps> = ({ 
  flow, 
  onNext, 
  onBack,
  onRestart,
  onCancel 
}) => {
  const { state, updateFileSheetSelection } = flow;
  const { uploadedFiles } = state;

  // Analyze uploaded files to determine case
  const totalFiles = uploadedFiles.length;
  
  // Group files by Excel workbook (files with same base name and sheetNames)
  const excelWorkbooks = new Map<string, typeof uploadedFiles>();
  const regularFiles: typeof uploadedFiles = [];
  
  uploadedFiles.forEach(file => {
    if (file.sheetNames && file.sheetNames.length > 0) {
      // Extract base filename (remove sheet name suffix and extension)
      const baseName = file.name.replace(/\s*\([^)]+\)\s*$/, '').replace(/\.(xlsx|xls)$/i, '');
      if (!excelWorkbooks.has(baseName)) {
        excelWorkbooks.set(baseName, []);
      }
      excelWorkbooks.get(baseName)!.push(file);
    } else {
      regularFiles.push(file);
    }
  });

  // Calculate totals
  const totalSheets = uploadedFiles.reduce((sum, f) => {
    if (f.sheetNames && f.sheetNames.length > 0) {
      return sum + f.sheetNames.length;
    }
    return sum + 1; // Regular files count as 1 sheet
  }, 0);

  const excelWorkbookCount = excelWorkbooks.size;
  const hasMultiSheetExcel = Array.from(excelWorkbooks.values()).some(files => {
    const firstFile = files[0];
    return (firstFile.totalSheets || firstFile.sheetNames?.length || 0) > 1;
  });

  // Determine which case we're in
  let caseType: 'single' | 'multiSheet' | 'multiple' = 'single';
  let caseData: {
    filename?: string;
    sheetCount?: number;
    fileCount?: number;
    totalSheets?: number;
  } = {};

  if (totalFiles === 1) {
    const file = uploadedFiles[0];
    const sheetCount = file.totalSheets || file.sheetNames?.length || 1;
    
    if (sheetCount > 1) {
      caseType = 'multiSheet';
      // Extract original filename by removing sheet suffix like " (Sheet1)" and extension
      const originalName = file.name.replace(/\s*\([^)]+\)\s*$/, '').replace(/\.(xlsx|xls|arrow)$/i, '');
      caseData = {
        filename: originalName,
        sheetCount: sheetCount,
      };
    } else {
      caseType = 'single';
      // Remove .arrow extension if present for display
      const displayName = file.name.replace(/\.arrow$/i, '');
      caseData = {
        filename: displayName,
      };
    }
  } else {
    caseType = 'multiple';
    caseData = {
      fileCount: totalFiles,
      totalSheets: totalSheets,
    };
  }

  // Get the appropriate message based on case
  const getMessage = () => {
    if (caseType === 'single') {
      return {
        mainMessage: `You have uploaded ${caseData.filename}.`,
        subMessage: "Let's make sure it is interpreted correctly.",
        reassurance: undefined,
      };
    } else if (caseType === 'multiSheet') {
      return {
        mainMessage: `You have uploaded ${caseData.filename} containing ${caseData.sheetCount} sheets.`,
        subMessage: "Let's take a moment to make sure each sheet is interpreted correctly.",
        reassurance: "Don't worry — if some sheets are irrelevant, you can delete or ignore them later.",
      };
    } else {
      return {
        mainMessage: `You have uploaded ${caseData.fileCount} files and a total of ${caseData.totalSheets} sheets.`,
        subMessage: "Let's make sure they are interpreted correctly.",
        reassurance: "Trinity will process them one at a time. You can delete irrelevant files later.",
      };
    }
  };

  const message = getMessage();

  // Get Excel workbook for sheet selection (if applicable)
  const getExcelWorkbookForSelection = () => {
    if (caseType === 'multiSheet' && excelWorkbooks.size > 0) {
      return Array.from(excelWorkbooks.entries())[0];
    }
    return null;
  };

  const excelWorkbook = getExcelWorkbookForSelection();
  const selectedSheetForWorkbook = excelWorkbook 
    ? excelWorkbook[1][0]?.selectedSheet || excelWorkbook[1][0]?.sheetNames?.[0] || ''
    : '';

  const handleSheetChange = (fileName: string, sheetName: string) => {
    updateFileSheetSelection(fileName, sheetName);
  };

  return (
    <StageLayout
      title="Upload Your Dataset"
      explanation={message.mainMessage}
      helpText={message.reassurance}
    >
      <div className="space-y-6">
        {/* Main Message */}
        <div className="text-center space-y-4">
          <p className="text-gray-700 font-medium text-lg">
            {message.subMessage}
          </p>
          
          {/* Process Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left max-w-2xl mx-auto">
            <p className="text-sm text-gray-700 mb-3">
              Over the next few steps, I'll make sure your file is interpreted correctly.
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#41C185] mt-0.5 flex-shrink-0" />
                <span>We will check your column titles and give you a chance to rename them if needed.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#41C185] mt-0.5 flex-shrink-0" />
                <span>I'll ensure that all rows align properly and are not spilling into extra columns because of delimiter or formatting issues.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#41C185] mt-0.5 flex-shrink-0" />
                <span>We'll go through the data types of each column to confirm they have been read correctly.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#41C185] mt-0.5 flex-shrink-0" />
                <span>I'll also check for missing values and suggest ways to address them.</span>
              </li>
            </ul>
            <p className="text-sm text-gray-700 mt-3 font-medium">
              Once this is complete, your dataset will be fully primed and ready for smooth analysis.
            </p>
          </div>
        </div>

        {/* Choose Sheet - Only for multi-sheet Excel files */}
        {caseType === 'multiSheet' && excelWorkbook && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <Label className="text-sm font-medium text-gray-700 mb-2 block">
              Choose Sheet
            </Label>
            <Select
              value={selectedSheetForWorkbook}
              onValueChange={(value) => {
                const fileName = excelWorkbook[1][0]?.name || '';
                handleSheetChange(fileName, value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a sheet" />
              </SelectTrigger>
              <SelectContent>
                {excelWorkbook[1][0]?.sheetNames?.map((sheet, idx) => (
                  <SelectItem key={idx} value={sheet}>
                    {sheet}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-2">
              Sheets you don't need can be removed later.
            </p>
          </div>
        )}

        {/* Uploaded Files Summary */}
        {uploadedFiles.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-600" />
              Uploaded Files ({totalFiles})
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {/* Excel Workbooks */}
              {Array.from(excelWorkbooks.entries()).map(([baseName, files]) => {
                const firstFile = files[0];
                const sheetCount = firstFile.totalSheets || firstFile.sheetNames?.length || files.length;
                return (
                  <div key={baseName} className="bg-white rounded p-3 border border-gray-200">
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {baseName}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          Excel workbook with {sheetCount} sheet{sheetCount !== 1 ? 's' : ''}
                        </p>
                        {firstFile.sheetNames && firstFile.sheetNames.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {firstFile.sheetNames.map((sheet, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                              >
                                {sheet}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Regular Files */}
              {regularFiles.map((file, idx) => (
                <div key={idx} className="bg-white rounded p-3 border border-gray-200">
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onBack}
              className="flex items-center gap-2"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Back
            </Button>
            {onRestart && (
              <Button
                variant="ghost"
                onClick={onRestart}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <RotateCcw className="w-4 h-4" />
                Restart Upload
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onCancel && (
              <Button
                variant="ghost"
                onClick={onCancel}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
            )}
            <Button
              onClick={onNext}
              className="flex items-center gap-2 bg-[#458EE2] hover:bg-[#3a7bc7]"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </StageLayout>
  );
};
