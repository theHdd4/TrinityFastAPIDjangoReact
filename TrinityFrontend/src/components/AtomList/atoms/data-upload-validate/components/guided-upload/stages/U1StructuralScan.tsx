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
    f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')
  );
  const hasMultipleSheets = excelFiles.some(f => (f.totalSheets || 0) > 1);
  const totalSheets = uploadedFiles.reduce((sum, f) => sum + (f.totalSheets || 1), 0);

  const getContent = () => {
    if (singleFile) {
      const file = uploadedFiles[0];
      if (hasMultipleSheets && file.totalSheets && file.totalSheets > 1) {
        return {
          title: 'Structural Scan',
          explanation: `What Trinity found: You have uploaded ${file.name} containing ${file.totalSheets} sheets.`,
          helpText: "Don't worry — if some sheets are irrelevant, you can delete or ignore them later.",
        };
      }
      return {
        title: 'Structural Scan',
        explanation: `What Trinity found: You have uploaded ${file.name}.`,
        helpText: null,
      };
    } else {
      return {
        title: 'Structural Scan',
        explanation: `What Trinity found: You have uploaded ${uploadedFiles.length} files and a total of ${totalSheets} sheets.`,
        helpText: "Trinity will process them one at a time. You can delete irrelevant files later.",
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
      <div className="space-y-4">
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

