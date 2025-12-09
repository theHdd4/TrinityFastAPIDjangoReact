import React from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow } from '../useGuidedUploadFlow';

interface U1StructuralScanProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
}

export const U1StructuralScan: React.FC<U1StructuralScanProps> = ({ flow, onNext }) => {
  const { state } = flow;
  const { uploadedFiles } = state;

  // Determine upload type
  const singleFile = uploadedFiles.length === 1;
  const excelFiles = uploadedFiles.filter(f => 
    f.name.toLowerCase().endsWith('.xlsx') || 
    f.name.toLowerCase().endsWith('.xls') ||
    (f.sheetNames && f.sheetNames.length > 0) // Files from Excel folders
  );
  const hasMultipleSheets = excelFiles.some(f => (f.totalSheets || 0) > 1 || (f.sheetNames && f.sheetNames.length > 1));
  const totalSheets = uploadedFiles.reduce((sum, f) => sum + (f.totalSheets || f.sheetNames?.length || 1), 0);
  
  // Group files by Excel workbook (files with same base name and sheetNames)
  const excelWorkbooks = new Map<string, typeof uploadedFiles>();
  uploadedFiles.forEach(file => {
    if (file.sheetNames && file.sheetNames.length > 0) {
      // Extract base filename (remove sheet name suffix)
      const baseName = file.name.replace(/\s*\([^)]+\)\s*$/, '').replace(/\.(xlsx|xls)$/i, '');
      if (!excelWorkbooks.has(baseName)) {
        excelWorkbooks.set(baseName, []);
      }
      excelWorkbooks.get(baseName)!.push(file);
    }
  });

  const getContent = () => {
    if (singleFile) {
      const file = uploadedFiles[0];
      if (hasMultipleSheets && file.totalSheets && file.totalSheets > 1) {
        return {
          title: 'Structural Scan',
          explanation: `What Trinity found: You have uploaded ${file.name} containing ${file.totalSheets} sheets. These sheets are organized in a folder structure.`,
          helpText: "Don't worry — if some sheets are irrelevant, you can delete or ignore them later.",
        };
      }
      if (file.sheetNames && file.sheetNames.length > 1) {
        return {
          title: 'Structural Scan',
          explanation: `What Trinity found: You have uploaded ${file.name} with ${file.sheetNames.length} sheets from an Excel workbook. These sheets are saved in a folder structure.`,
          helpText: "Each sheet will be processed individually. You can delete irrelevant sheets later.",
        };
      }
      return {
        title: 'Structural Scan',
        explanation: `What Trinity found: You have uploaded ${file.name}.`,
        helpText: null,
      };
    } else {
      const excelWorkbookCount = excelWorkbooks.size;
      const regularFileCount = uploadedFiles.length - uploadedFiles.filter(f => f.sheetNames && f.sheetNames.length > 0).length;
      
      let explanation = `What Trinity found: You have uploaded ${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''}`;
      if (totalSheets > uploadedFiles.length) {
        explanation += ` with a total of ${totalSheets} sheets`;
      }
      if (excelWorkbookCount > 0) {
        explanation += `. ${excelWorkbookCount} Excel workbook${excelWorkbookCount !== 1 ? 's' : ''} ${excelWorkbookCount === 1 ? 'is' : 'are'} organized in folder structures.`;
      }
      
      return {
        title: 'Structural Scan',
        explanation,
        helpText: "Trinity will process them one at a time. You can delete irrelevant files or sheets later.",
      };
    }
  };

  const content = getContent();

  return (
    <StageLayout
      title={content.title}
      explanation={content.explanation}
      helpText={content.helpText}
      aiInsight="Over the next few steps, I'll make sure your file is interpreted correctly. We'll check column titles, data types, and missing values together."
    >
      <div className="space-y-6">
        {/* Uploaded Files Summary */}
        {uploadedFiles.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              Uploaded Files ({uploadedFiles.length})
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {excelWorkbooks.size > 0 && (
                <>
                  {Array.from(excelWorkbooks.entries()).map(([baseName, files]) => {
                    const firstFile = files[0];
                    const sheetCount = firstFile.sheetNames?.length || firstFile.totalSheets || files.length;
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
                </>
              )}
              {uploadedFiles.filter(f => !f.sheetNames || f.sheetNames.length === 0).map((file, idx) => (
                <div key={idx} className="bg-white rounded p-3 border border-gray-200">
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                      {file.path && (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {file.path}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-[#41C185] bg-opacity-10 flex items-center justify-center">
            <FileText className="w-8 h-8 text-[#41C185]" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-gray-700 font-medium">
            Let's make sure your file is interpreted correctly.
          </p>
          <ul className="space-y-2 text-gray-600 text-sm text-left max-w-md mx-auto">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#41C185] mt-0.5 flex-shrink-0" />
              <span>We will check your column titles and give you a chance to rename them if needed.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#41C185] mt-0.5 flex-shrink-0" />
              <span>I'll ensure that all rows align properly and are not spilling into extra columns.</span>
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
        </div>
      </div>
    </StageLayout>
  );
};

