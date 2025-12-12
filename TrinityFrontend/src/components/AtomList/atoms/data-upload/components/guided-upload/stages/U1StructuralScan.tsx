import React, { useEffect, useState } from 'react';
import { ChevronRight, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const getFileMeta = (file: any) => {
  const extension = (file?.name?.split('.').pop() || '').toLowerCase();
  const isExcel = ['xls', 'xlsx', 'xlsm'].includes(extension);
  const sheetCount = file?.sheetNames?.length || 1;
  const isMultiSheet = sheetCount > 1;
  const kindLabel = isExcel ? 'Excel file' : 'CSV or flat file';
  const sheetLabel = isExcel ? `${sheetCount} ${sheetCount === 1 ? 'sheet' : 'sheets'}` : 'Single sheet';
  return {
    extension,
    isExcel,
    sheetCount,
    isMultiSheet,
    kindLabel,
    sheetLabel,
  };
};

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
  onCancel,
}) => {
  const { state, updateFileSheetSelection, setSelectedFileIndex } = flow;
  const { uploadedFiles, selectedFileIndex: savedSelectedIndex } = state;

  const [currentFileIndex, setCurrentFileIndex] = useState(savedSelectedIndex ?? 0);
  const hasMultipleFiles = uploadedFiles.length > 1;

  // keep index in bounds
  useEffect(() => {
    if (uploadedFiles.length > 0 && currentFileIndex >= uploadedFiles.length) {
      setCurrentFileIndex(0);
    }
  }, [uploadedFiles.length, currentFileIndex]);

  // sync from saved state
  useEffect(() => {
    if (savedSelectedIndex !== undefined && savedSelectedIndex < uploadedFiles.length) {
      setCurrentFileIndex(savedSelectedIndex);
    }
  }, [savedSelectedIndex, uploadedFiles.length]);

  const currentFile = uploadedFiles[currentFileIndex];

  const totalFiles = uploadedFiles.length;
  const totalSheets = uploadedFiles.reduce((sum, f) => sum + (f.sheetNames?.length || 1), 0);
  const isSingle = totalFiles === 1 && (currentFile?.sheetNames?.length || 1) === 1;
  const isMultiSheet = totalFiles === 1 && (currentFile?.sheetNames?.length || 1) > 1;
  const message = (() => {
    if (isSingle && currentFile) {
      return {
        main: `You have uploaded ${currentFile.name.replace(/\\.arrow$/i, '')}.`,
        sub: "Let's make sure it is interpreted correctly.",
        reassurance: undefined,
      };
    }
    if (isMultiSheet && currentFile) {
      return {
        main: `You have uploaded ${currentFile.name} containing ${(currentFile.sheetNames?.length || 1)} sheets.`,
        sub: "Let's take a moment to make sure each sheet is interpreted correctly.",
        reassurance: "Don't worry — if some sheets are irrelevant, you can delete or ignore them later.",
      };
    }
    return {
      main: `You have uploaded ${totalFiles} files and a total of ${totalSheets} sheets.`,
      sub: "Let's make sure they are interpreted correctly.",
      reassurance: "Trinity will process them one at a time. You can delete irrelevant files later.",
    };
  })();

  const caseLabel = (() => {
    if (isSingle) return 'Single file';
    if (isMultiSheet) return 'Multi-sheet Excel';
    return 'Multiple files';
  })();

  const handleContinue = () => {
    setSelectedFileIndex(currentFileIndex);
    onNext();
  };

  return (
    <StageLayout
      title="Upload Your Dataset"
      explanation={message.main}
      helpText={message.reassurance}
    >
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xl font-semibold text-gray-900">{message.main}</p>
            <p className="text-sm text-gray-700">
              Over the next few steps, I'll make sure your file is interpreted correctly.
            </p>
            {message.reassurance && <p className="text-xs text-gray-600">{message.reassurance}</p>}
          </div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="px-5 py-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">What we will verify</p>
                <ul className="space-y-1.5 text-sm text-gray-600">
                  <li>Column titles with a chance to rename.</li>
                  <li>Row alignment to prevent delimiter spillover.</li>
                  <li>Column data types confirmed for accuracy.</li>
                  <li>Missing values checked with suggested fixes.</li>
                </ul>
              </div>
              <div className="space-y-2 rounded-lg border border-blue-100 bg-[#F6FAFF] p-4 shadow-sm">
                <p className="text-sm font-medium text-gray-800">Outcome</p>
                <p className="text-sm text-gray-700">
                  Once this is complete, your dataset will be fully primed and ready for smooth analysis.
                </p>
                <p className="text-xs text-gray-600">Tap a file below to review how we interpreted it.</p>
              </div>
            </div>
          </div>
        </div>

        {uploadedFiles.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Uploaded files</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {uploadedFiles.map((file, idx) => {
                const meta = getFileMeta(file);
                const isActive = idx === currentFileIndex;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCurrentFileIndex(idx);
                      setSelectedFileIndex(idx);
                    }}
                    className={`text-left rounded-lg border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      isActive ? 'border-[#458EE2] bg-[#E8F2FF]' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
                        <p className="text-xs text-gray-600">{meta.kindLabel}</p>
                      </div>
                      {isActive && (
                        <span className="rounded-full bg-[#41C185] px-2 py-1 text-[11px] font-semibold text-white">
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                      <span className="rounded-full bg-gray-100 px-2 py-1">{meta.sheetLabel}</span>
                      {meta.isMultiSheet && (
                        <span className="rounded-full bg-yellow-100 text-yellow-800 px-2 py-1">
                          Multi-sheet
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isMultiSheet && currentFile?.sheetNames && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <Label className="text-sm font-medium text-gray-700 mb-2 block">Choose Sheet</Label>
            <Select
              value={currentFile.selectedSheet || currentFile.sheetNames[0]}
              onValueChange={(value) => updateFileSheetSelection(currentFile.name, value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a sheet" />
              </SelectTrigger>
              <SelectContent>
                {currentFile.sheetNames.map((sheet, idx) => (
                  <SelectItem key={idx} value={sheet}>
                    {sheet}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-2">Sheets you don't need can be removed later.</p>
          </div>
        )}

        {hasMultipleFiles && (
          <div className="border rounded-lg p-4 bg-white">
            <Label className="text-sm font-medium text-gray-700 mb-2 block">Select file to process now</Label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#458EE2]"
              value={currentFileIndex}
              onChange={(e) => {
                const idx = Number(e.target.value);
                if (!Number.isNaN(idx) && idx >= 0 && idx < uploadedFiles.length) {
                  setCurrentFileIndex(idx);
                  setSelectedFileIndex(idx);
                }
              }}
            >
              {uploadedFiles.map((file, idx) => (
                <option key={idx} value={idx}>
                  {file.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-2">
              Trinity will process them one at a time. You can delete irrelevant files later.
            </p>
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
              onClick={handleContinue}
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
