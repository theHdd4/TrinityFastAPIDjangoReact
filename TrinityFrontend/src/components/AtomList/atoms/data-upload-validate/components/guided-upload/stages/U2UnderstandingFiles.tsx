import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { VALIDATE_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';

interface U2UnderstandingFilesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
}

interface FileMetadata {
  rowCount?: number;
  columnCount?: number;
  sheetNames?: string[];
}

export const U2UnderstandingFiles: React.FC<U2UnderstandingFilesProps> = ({ flow, onNext }) => {
  const { state, updateFileMetadata, updateFileSheetSelection } = flow;
  const { uploadedFiles } = state;
  const [loading, setLoading] = useState(true);
  const [fileMetadata, setFileMetadata] = useState<Record<string, FileMetadata>>({});

  useEffect(() => {
    const fetchMetadata = async () => {
      setLoading(true);
      const metadata: Record<string, FileMetadata> = {};

      for (const file of uploadedFiles) {
        try {
          // Try to get file metadata
          const envStr = localStorage.getItem('env');
          let query = '';
          if (envStr) {
            try {
              const env = JSON.parse(envStr);
              query = '?' + new URLSearchParams({
                client_id: env.CLIENT_ID || '',
                app_id: env.APP_ID || '',
                project_id: env.PROJECT_ID || '',
                client_name: env.CLIENT_NAME || '',
                app_name: env.APP_NAME || '',
                project_name: env.PROJECT_NAME || '',
                object_name: file.path,
              }).toString();
            } catch {
              query = `?object_name=${encodeURIComponent(file.path)}`;
            }
          } else {
            query = `?object_name=${encodeURIComponent(file.path)}`;
          }

          // Check if it's an Excel file with multiple sheets
          const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
          if (isExcel) {
            const workbookRes = await fetch(`${VALIDATE_API}/workbook_metadata${query}`, {
              credentials: 'include',
            });
            if (workbookRes.ok) {
              const workbookData = await workbookRes.json();
              metadata[file.name] = {
                sheetNames: workbookData.sheet_names || [],
                rowCount: workbookData.row_count,
                columnCount: workbookData.column_count,
              };
              updateFileMetadata(file.name, {
                rowCount: workbookData.row_count,
                columnCount: workbookData.column_count,
              });
              continue;
            }
          }

          // Try regular file metadata
          const res = await fetch(`${VALIDATE_API}/file-metadata${query}`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            metadata[file.name] = {
              rowCount: data.row_count,
              columnCount: data.column_count,
            };
            updateFileMetadata(file.name, {
              rowCount: data.row_count,
              columnCount: data.column_count,
            });
          }
        } catch (error) {
          console.error(`Failed to fetch metadata for ${file.name}:`, error);
        }
      }

      setFileMetadata(metadata);
      setLoading(false);
    };

    if (uploadedFiles.length > 0) {
      void fetchMetadata();
    }
  }, [uploadedFiles, updateFileMetadata]);

  return (
    <StageLayout
      title="Understanding Your File(s)"
      explanation="What Trinity found: Let's review the structure of your uploaded files."
      helpText="Trinity will process each file individually. You'll be able to review and adjust settings for each one in the upcoming steps."
    >
      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#458EE2]"></div>
          <p className="mt-4 text-sm text-gray-600">Analyzing file structure...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {uploadedFiles.map((file) => {
            const metadata = fileMetadata[file.name];
            const hasMultipleSheets = (metadata?.sheetNames?.length || 0) > 1;

            return (
              <div
                key={file.name}
                className="border border-gray-200 rounded-lg p-4 bg-gray-50 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#458EE2] bg-opacity-10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-[#458EE2]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{file.name}</h4>
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      {metadata?.rowCount && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Rows:</span>
                          <span>{metadata.rowCount.toLocaleString()}</span>
                        </div>
                      )}
                      {metadata?.columnCount && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Columns:</span>
                          <span>{metadata.columnCount}</span>
                        </div>
                      )}
                      {hasMultipleSheets && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs text-gray-500 mb-2">Select a sheet:</p>
                          <select
                            className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                            value={file.selectedSheet || metadata.sheetNames?.[0] || ''}
                            onChange={(e) => updateFileSheetSelection(file.name, e.target.value)}
                          >
                            {metadata.sheetNames?.map((sheet) => (
                              <option key={sheet} value={sheet}>
                                {sheet}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StageLayout>
  );
};

