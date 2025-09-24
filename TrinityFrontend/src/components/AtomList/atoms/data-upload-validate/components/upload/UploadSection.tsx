import React, { useId } from 'react';
import { FileText, Upload, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  useMasterFile = false
}) => {
  const inputId = useId();
  return (
    <Card className="h-full flex flex-col shadow-sm border-2 border-blue-200 bg-white">
    <div className="flex-1 p-4 space-y-3 overflow-y-auto overflow-x-hidden">
      {files.map((file, index) => (
        <div key={index} className="relative">
          <button
            onClick={() => onDeleteFile(file.name)}
            className="absolute top-2 right-2 p-1"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-600" />
          </button>
          <div className="flex items-center justify-between p-3 pr-8 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors w-full min-w-0">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <FileText className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-600">{file.type} • {file.size}</p>
                {validationResults[file.name] && (
                  <p
                    onClick={() => setOpenValidatedFile(openValidatedFile === file.name ? null : file.name)}
                    className={`text-xs mt-1 cursor-pointer ${validationResults[file.name].includes('Success') ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {validationResults[file.name]}
                  </p>
                )}
                {saveStatus[file.name] && (
                  <p className="text-xs text-blue-600">{saveStatus[file.name]}</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Select value={fileAssignments[file.name] || ''} onValueChange={val => onAssignmentChange(file.name, val)}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {requiredOptions.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {openValidatedFile === file.name && validationDetails[file.name] && (
            <div className="mt-2 border-t border-gray-200 pt-2 w-full">
              <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300">
                <div className="flex space-x-2 w-max max-w-[480px]">
                  {validationDetails[file.name].map((v, i) => (
                    <div key={i} className="border border-gray-200 rounded p-2 min-w-[150px] flex-shrink-0">
                      <p className="text-xs font-semibold mb-1">{v.name}</p>
                      <p className="text-xs mb-1">{v.column} - {v.desc}</p>
                      <p className={`text-xs ${v.status === 'Passed' ? 'text-green-600' : 'text-red-600'}`}>{v.status}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      <div
        className={`border-2 border-dashed rounded-lg text-center transition-all duration-300 ${files.length > 0 ? 'p-4' : 'p-8'} ${disabled ? 'opacity-50 cursor-not-allowed' : isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300'}`}
        onDrop={disabled ? undefined : onDrop}
        onDragOver={disabled ? undefined : onDragOver}
        onDragLeave={disabled ? undefined : onDragLeave}
      >
        <div className={files.length > 0 ? "mb-2" : "mb-6"}>
          <p className="text-sm font-medium text-gray-900 mb-4">{isDragOver ? 'Drop files here' : 'Click here to upload your file(s)'}</p>
          <label htmlFor={inputId} className="cursor-pointer">
            <div className="w-16 h-16 mx-auto mb-2 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-2xl transform hover:scale-105 transition-transform duration-300">
              <Upload className="w-8 h-8 text-white drop-shadow-lg" />
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
