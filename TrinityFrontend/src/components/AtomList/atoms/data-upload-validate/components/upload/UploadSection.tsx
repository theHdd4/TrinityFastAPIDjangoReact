import React from 'react';
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
  uploadedFiles: File[];
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
  disableValidation = false
}) => (
  <Card className="h-full flex flex-col shadow-sm border-0 bg-white">
    <div className="p-4 border-b border-gray-100">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Uploaded Files</h3>
      <p className="text-sm text-gray-600">Manage your uploaded data files</p>
    </div>
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
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300'}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <div className="mb-4">
          <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragOver ? 'text-blue-600' : 'text-gray-400'}`} />
          <p className="text-sm font-medium text-gray-900 mb-1">{isDragOver ? 'Drop files here' : 'Drag and Drop your File'}</p>
          <p className="text-xs text-gray-600 mb-4">OR</p>
        </div>
        <input type="file" multiple accept=".csv,.xlsx,.xls,.json" onChange={onFileSelect} className="hidden" id="file-upload" />
        <label htmlFor="file-upload">
          <Button asChild className="cursor-pointer">
            <span>Browse</span>
          </Button>
        </label>
      </div>
      {uploadedFiles.length > 0 && (
        <Button className="w-full mt-4" onClick={onValidateFiles} disabled={disableValidation}>
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

export default UploadSection;
