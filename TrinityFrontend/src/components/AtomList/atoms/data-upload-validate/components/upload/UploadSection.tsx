import React, { useId } from 'react';
import { FileText, Upload, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FileDataPreview from './FileDataPreview';

interface FileRow {
  name: string;
  type: string;
  size: string;
  status: string;
}

interface UploadSectionProps {
  uploadedFiles: { name: string; path: string; size: number }[];
  files: FileRow[];
  validationResults: Record<string, string>;
  validationDetails: Record<string, any[]>;
  openValidatedFile: string | null;
  setOpenValidatedFile: (f: string | null) => void;
  fileAssignments: Record<string, string>;
  onAssignmentChange: (fileName: string, value: string) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValidateFiles: () => void;
  onSaveDataFrames: () => void;
  saveEnabled: boolean;
  isDragOver: boolean;
  requiredOptions: string[];
  onDeleteFile: (name: string) => void;
  saveStatus: Record<string, string>;
  disabled?: boolean;
  /** When true, disable the validate button */
  disableValidation?: boolean;
  /** When true, hide the heading and instruction text */
  useMasterFile?: boolean;
  onDataChanges?: (changes: {
    dtypeChanges: Record<string, Record<string, string | { dtype: string; format: string }>>;
    missingValueStrategies: Record<string, Record<string, { strategy: string; value?: string }>>;
  }) => void;
  filesWithAppliedChanges?: Set<string>;
  initialDtypeChanges?: Record<string, Record<string, string | { dtype: string; format: string }>>;
  initialMissingValueStrategies?: Record<string, Record<string, { strategy: string; value?: string }>>;
  initialFilesMetadata?: Record<string, any>;
  onMetadataChange?: (metadata: Record<string, any>) => void;
}

const UploadSection: React.FC<UploadSectionProps> = ({
  uploadedFiles,
  files,
  validationResults,
  validationDetails,
  openValidatedFile,
  setOpenValidatedFile,
  fileAssignments,
  onAssignmentChange,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileSelect,
  onValidateFiles,
  onSaveDataFrames,
  saveEnabled,
  isDragOver,
  requiredOptions,
  onDeleteFile,
  saveStatus,
  disabled = false,
  disableValidation = false,
  useMasterFile = false,
  onDataChanges,
  filesWithAppliedChanges = new Set(),
  initialDtypeChanges = {},
  initialMissingValueStrategies = {},
  initialFilesMetadata = {},
  onMetadataChange
}) => {
  const inputId = useId();
  return (
    <Card className="h-full flex flex-col shadow-sm border-2 border-blue-200 bg-white">
    <div className="flex-1 p-4 space-y-3 overflow-y-auto overflow-x-hidden">
      <div
        className={`border-2 border-dashed rounded-lg text-center transition-all duration-300 ${files.length > 0 ? 'p-2' : 'p-8'} ${disabled ? 'opacity-50 cursor-not-allowed' : isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300'}`}
        onDrop={disabled ? undefined : onDrop}
        onDragOver={disabled ? undefined : onDragOver}
        onDragLeave={disabled ? undefined : onDragLeave}
      >
        <div className={files.length > 0 ? "mb-0" : "mb-6"}>
          <p className={`font-medium text-gray-900 ${files.length > 0 ? 'text-xs mb-2' : 'text-sm mb-4'}`}>{isDragOver ? 'Drop files here' : 'Click here to upload your file(s)'}</p>
          <label htmlFor={inputId} className="cursor-pointer">
            <div className={`mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-2xl transform hover:scale-105 transition-transform duration-300 ${files.length > 0 ? 'w-10 h-10 mb-1' : 'w-16 h-16 mb-2'}`}>
              <Upload className={`text-white drop-shadow-lg ${files.length > 0 ? 'w-5 h-5' : 'w-8 h-8'}`} />
            </div>
          </label>
        </div>
        <input type="file" multiple accept=".csv,.xlsx,.xls,.json" onChange={onFileSelect} className="hidden" id={inputId} disabled={disabled} />
         {files.length === 0 && !useMasterFile && (
           <>
             <h3 className="text-3xl font-bold text-gray-900 mb-3 mt-6 bg-gradient-to-r from-blue-500 to-blue-600 bg-clip-text text-transparent">
               Upload and Validate Operation
             </h3>
             <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">To ensure your data meets format requirements, go to Properties section and upload Master file for validation</p>
           </>
         )}
      </div>
      
      {/* Data Preview & Configuration Section */}
      <FileDataPreview 
        uploadedFiles={uploadedFiles} 
        onDataChanges={onDataChanges}
        onDeleteFile={onDeleteFile}
        useMasterFile={useMasterFile}
        fileAssignments={fileAssignments}
        onAssignmentChange={onAssignmentChange}
        requiredOptions={requiredOptions}
        filesWithAppliedChanges={filesWithAppliedChanges}
        initialDtypeChanges={initialDtypeChanges}
        initialMissingValueStrategies={initialMissingValueStrategies}
        initialFilesMetadata={initialFilesMetadata}
        onMetadataChange={onMetadataChange}
      />
      
      {uploadedFiles.length > 0 && !disableValidation && (
        <Button className="w-full mt-4" onClick={onValidateFiles}>
          Validate Files
        </Button>
      )}
      
      {uploadedFiles.length > 0 && (
        <Button className="w-full mt-2" onClick={onSaveDataFrames} disabled={!saveEnabled}>
          Save Data Frame
        </Button>
      )}
    </div>
    </Card>
  );
};

export default UploadSection;
