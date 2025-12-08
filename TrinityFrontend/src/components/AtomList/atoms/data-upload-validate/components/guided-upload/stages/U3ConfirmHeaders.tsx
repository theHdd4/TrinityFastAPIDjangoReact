import React, { useEffect, useState } from 'react';
import { Table, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { VALIDATE_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow, HeaderSelection } from '../useGuidedUploadFlow';

interface U3ConfirmHeadersProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
}

interface PreviewData {
  rows: any[][];
  suggestedHeaderRow: number;
}

export const U3ConfirmHeaders: React.FC<U3ConfirmHeadersProps> = ({ flow, onNext }) => {
  const { state, setHeaderSelection } = flow;
  const { uploadedFiles, headerSelections } = state;
  const [previewData, setPreviewData] = useState<Record<string, PreviewData>>({});
  const [loading, setLoading] = useState(true);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [headerRowCount, setHeaderRowCount] = useState(1);
  const [noHeader, setNoHeader] = useState(false);
  const [mergedHeaders, setMergedHeaders] = useState(false);

  const currentFile = uploadedFiles[currentFileIndex];
  const currentPreview = currentFile ? previewData[currentFile.name] : null;
  const currentSelection = currentFile ? headerSelections[currentFile.name] : null;

  useEffect(() => {
    const fetchPreview = async () => {
      setLoading(true);
      const previews: Record<string, PreviewData> = {};

      for (const file of uploadedFiles) {
        try {
          const envStr = localStorage.getItem('env');
          let query = '';
          if (envStr) {
            try {
              const env = JSON.parse(envStr);
              query = '?' + new URLSearchParams({
                object_name: file.path,
                client_id: env.CLIENT_ID || '',
                app_id: env.APP_ID || '',
                project_id: env.PROJECT_ID || '',
              }).toString();
            } catch {
              query = `?object_name=${encodeURIComponent(file.path)}`;
            }
          } else {
            query = `?object_name=${encodeURIComponent(file.path)}`;
          }

          // Fetch preview data (top 10 rows)
          const res = await fetch(`${VALIDATE_API}/file-preview${query}`, {
            credentials: 'include',
          });
          
          if (res.ok) {
            const data = await res.json();
            previews[file.name] = {
              rows: data.rows || [],
              suggestedHeaderRow: data.suggested_header_row || 0,
            };
          } else {
            // Fallback: try to detect headers from file metadata
            previews[file.name] = {
              rows: [],
              suggestedHeaderRow: 0,
            };
          }
        } catch (error) {
          console.error(`Failed to fetch preview for ${file.name}:`, error);
          previews[file.name] = {
            rows: [],
            suggestedHeaderRow: 0,
          };
        }
      }

      setPreviewData(previews);
      setLoading(false);
    };

    if (uploadedFiles.length > 0) {
      void fetchPreview();
    }
  }, [uploadedFiles]);

  useEffect(() => {
    if (currentFile && currentPreview) {
      const existingSelection = headerSelections[currentFile.name];
      if (existingSelection) {
        setHeaderRowIndex(existingSelection.headerRowIndex);
        setHeaderRowCount(existingSelection.headerRowCount);
        setNoHeader(existingSelection.noHeader);
      } else {
        setHeaderRowIndex(currentPreview.suggestedHeaderRow);
      }
    }
  }, [currentFile, currentPreview, headerSelections]);

  const handleSave = () => {
    if (currentFile) {
      const selection: HeaderSelection = {
        headerRowIndex: noHeader ? -1 : headerRowIndex,
        headerRowCount: noHeader ? 0 : headerRowCount,
        noHeader,
      };
      setHeaderSelection(currentFile.name, selection);
    }
  };

  const handleNext = () => {
    handleSave();
    if (currentFileIndex < uploadedFiles.length - 1) {
      setCurrentFileIndex(currentFileIndex + 1);
      // Reset form for next file
      const nextFile = uploadedFiles[currentFileIndex + 1];
      const nextPreview = previewData[nextFile.name];
      const nextSelection = headerSelections[nextFile.name];
      if (nextSelection) {
        setHeaderRowIndex(nextSelection.headerRowIndex);
        setHeaderRowCount(nextSelection.headerRowCount);
        setNoHeader(nextSelection.noHeader);
      } else if (nextPreview) {
        setHeaderRowIndex(nextPreview.suggestedHeaderRow);
        setHeaderRowCount(1);
        setNoHeader(false);
      }
    } else {
      onNext();
    }
  };

  if (loading || !currentFile || !currentPreview) {
    return (
      <StageLayout
        title="Confirm Your Column Headers"
        explanation="What Trinity needs: Loading file preview to identify header rows..."
      >
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#458EE2]"></div>
          <p className="mt-4 text-sm text-gray-600">Loading file preview...</p>
        </div>
      </StageLayout>
    );
  }

  const displayRows = currentPreview.rows.slice(0, 10);
  const maxColumns = Math.max(...displayRows.map(row => row.length), 0);

  const aiInsight = currentPreview.suggestedHeaderRow >= 0
    ? `Rule-based detection suggests row ${currentPreview.suggestedHeaderRow + 1} as the header. This row contains mostly text values and looks like column names.`
    : undefined;

  return (
    <StageLayout
      title="Confirm Your Column Headers"
      explanation={`What Trinity needs: Identify which row contains your column names. File ${currentFileIndex + 1} of ${uploadedFiles.length}: ${currentFile.name}`}
      aiInsight={aiInsight}
      helpText="Select the row that contains your column headers. If your headers span multiple rows, you can specify that below."
    >

      <div className="space-y-4">
        {/* Preview Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <tbody>
                {displayRows.map((row, rowIdx) => {
                  const isHeaderRow = !noHeader && rowIdx === headerRowIndex;
                  return (
                    <tr
                      key={rowIdx}
                      className={isHeaderRow ? 'bg-[#458EE2] bg-opacity-10' : 'hover:bg-gray-50'}
                    >
                      <td className="px-3 py-2 text-gray-500 font-medium border-r border-gray-200">
                        {rowIdx + 1}
                      </td>
                      {Array.from({ length: maxColumns }).map((_, colIdx) => (
                        <td
                          key={colIdx}
                          className={`px-3 py-2 border-r border-gray-200 ${
                            isHeaderRow ? 'font-semibold text-[#458EE2]' : 'text-gray-700'
                          }`}
                        >
                          {row[colIdx] ?? ''}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Header Selection - Single Key Decision */}
        <div className="space-y-4 pt-4 border-t">
        <RadioGroup
          value={noHeader ? 'no-header' : `row-${headerRowIndex}`}
          onValueChange={(value) => {
            if (value === 'no-header') {
              setNoHeader(true);
            } else {
              setNoHeader(false);
              const match = value.match(/row-(\d+)/);
              if (match) {
                setHeaderRowIndex(parseInt(match[1], 10));
              }
            }
          }}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value={`row-${headerRowIndex}`} id="has-header" />
            <Label htmlFor="has-header" className="font-normal cursor-pointer">
              Header is row {headerRowIndex + 1}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no-header" id="no-header" />
            <Label htmlFor="no-header" className="font-normal cursor-pointer">
              No header row; treat everything as data
            </Label>
          </div>
        </RadioGroup>

        {!noHeader && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="merged-headers"
                checked={mergedHeaders}
                onCheckedChange={setMergedHeaders}
              />
              <Label htmlFor="merged-headers" className="font-normal cursor-pointer">
                My headers are merged or complex
              </Label>
            </div>
            {mergedHeaders && (
              <div className="ml-6 space-y-2">
                <Label>Header spans:</Label>
                <RadioGroup
                  value={`count-${headerRowCount}`}
                  onValueChange={(value) => {
                    const match = value.match(/count-(\d+)/);
                    if (match) {
                      setHeaderRowCount(parseInt(match[1], 10));
                    }
                  }}
                  className="flex gap-4"
                >
                  {[1, 2, 3].map((count) => (
                    <div key={count} className="flex items-center space-x-2">
                      <RadioGroupItem value={`count-${count}`} id={`count-${count}`} />
                      <Label htmlFor={`count-${count}`} className="font-normal cursor-pointer">
                        {count} row{count > 1 ? 's' : ''}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}
          </div>
        )}
        </div>

        {/* File Navigation */}
        {uploadedFiles.length > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                if (currentFileIndex > 0) {
                  handleSave();
                  setCurrentFileIndex(currentFileIndex - 1);
                }
              }}
              disabled={currentFileIndex === 0}
            >
              Previous File
            </Button>
            <span className="text-sm text-gray-600">
              {currentFileIndex + 1} / {uploadedFiles.length}
            </span>
            <Button
              variant="outline"
              onClick={handleNext}
              disabled={currentFileIndex === uploadedFiles.length - 1}
            >
              Next File
            </Button>
          </div>
        )}
      </div>
    </StageLayout>
  );
};

