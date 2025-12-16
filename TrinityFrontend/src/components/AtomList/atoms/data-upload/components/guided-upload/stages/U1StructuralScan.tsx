import React, { useEffect, useState } from 'react';
import { ChevronRight, RotateCcw, X } from 'lucide-react';
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
  onCancel,
}) => {
  const { state, updateFileSheetSelection, setSelectedFileIndex } = flow;
  const { uploadedFiles, selectedFileIndex: savedSelectedIndex } = state;

  const [currentFileIndex, setCurrentFileIndex] = useState(savedSelectedIndex ?? 0);

  // Keep index in bounds
  useEffect(() => {
    if (uploadedFiles.length > 0 && currentFileIndex >= uploadedFiles.length) {
      setCurrentFileIndex(0);
    }
  }, [uploadedFiles.length, currentFileIndex]);

  // Sync from saved state
  useEffect(() => {
    if (savedSelectedIndex !== undefined && savedSelectedIndex < uploadedFiles.length) {
      setCurrentFileIndex(savedSelectedIndex);
    }
  }, [savedSelectedIndex, uploadedFiles.length]);

  const currentFile = uploadedFiles[currentFileIndex];
  const isMultiSheet = currentFile?.sheetNames && currentFile.sheetNames.length > 1;

  // Render uploaded files list (shown after files are uploaded)
  const renderUploadedFiles = () => {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xl font-semibold text-gray-900">
              {uploadedFiles.length === 1 
                ? `You have selected ${currentFile?.name?.replace(/\.arrow$/i, '') || 'a file'}.`
                : `You have selected ${uploadedFiles.length} files.`}
            </p>
            <p className="text-sm text-gray-700">
              Over the next few steps, I'll make sure your file is interpreted correctly.
            </p>
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
              </div>
            </div>
          </div>
        </div>

        {/* File list */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Selected files</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {uploadedFiles.map((file, idx) => {
              const isActive = idx === currentFileIndex;
              const extension = (file?.name?.split('.').pop() || '').toLowerCase();
              const isExcel = ['xls', 'xlsx', 'xlsm'].includes(extension);
              const sheetCount = file?.sheetNames?.length || 1;
              
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { setCurrentFileIndex(idx); setSelectedFileIndex(idx); }}
                  className={`text-left rounded-lg border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                    isActive ? 'border-[#458EE2] bg-[#E8F2FF]' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-600">{isExcel ? 'Excel file' : 'CSV or flat file'}</p>
                    </div>
                    {isActive && (
                      <span className="rounded-full bg-[#41C185] px-2 py-1 text-[11px] font-semibold text-white">Selected</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                    <span className="rounded-full bg-gray-100 px-2 py-1">{sheetCount} {sheetCount === 1 ? 'sheet' : 'sheets'}</span>
                    {sheetCount > 1 && (
                      <span className="rounded-full bg-yellow-100 text-yellow-800 px-2 py-1">Multi-sheet</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sheet selector for multi-sheet files */}
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
                  <SelectItem key={idx} value={sheet}>{sheet}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-2">Sheets you don't need can be removed later.</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onBack} className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 rotate-180" />
              Back
            </Button>
            {onRestart && (
              <Button variant="ghost" onClick={onRestart} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
                <RotateCcw className="w-4 h-4" />
                Restart
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
                <X className="w-4 h-4" />
                Cancel
              </Button>
            )}
            <Button onClick={() => { setSelectedFileIndex(currentFileIndex); onNext(); }} className="flex items-center gap-2 bg-[#458EE2] hover:bg-[#3a7bc7]">
              Continue
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // U1 (Structural Scan) is now always reached with files already uploaded from atom
  // So we always show the file review content
  return (
    <StageLayout
      title=""
      explanation=""
      className="h-full"
    >
      <div className="h-full flex flex-col">
        {/* Content - Always show uploaded files review */}
        <div className="flex-1 overflow-y-auto">
          {renderUploadedFiles()}
        </div>
      </div>
    </StageLayout>
  );
};
