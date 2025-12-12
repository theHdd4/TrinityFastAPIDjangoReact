import React from 'react';
import { Upload, FileUp, CheckCircle2, ArrowRight, Sparkles, HelpCircle } from 'lucide-react';

interface Props {
  atomId: string;
}

const DataUploadHelp: React.FC<Props> = ({ atomId }) => {
  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b">
        <Upload className="w-5 h-5 text-blue-500" />
        <h3 className="font-semibold text-gray-800">Data Upload Help</h3>
      </div>

      {/* Overview */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-700 flex items-center gap-2">
          <HelpCircle className="w-4 h-4" />
          What is Data Upload?
        </h4>
        <p className="text-sm text-gray-600">
          The Data Upload atom provides a guided workflow to upload, clean, and prime your data files
          for use in Trinity. It handles the entire data preparation process from raw file to 
          analysis-ready dataset.
        </p>
      </div>

      {/* Workflow Steps */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-700 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Guided Upload Workflow
        </h4>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
              1
            </div>
            <div>
              <p className="font-medium text-blue-800">Upload Your File</p>
              <p className="text-blue-700 text-xs mt-1">
                Drag and drop or select CSV, Excel (.xlsx, .xls), or JSON files
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
              2
            </div>
            <div>
              <p className="font-medium text-blue-800">Structural Scan</p>
              <p className="text-blue-700 text-xs mt-1">
                Automatic detection of file structure, encoding, and format
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
              3
            </div>
            <div>
              <p className="font-medium text-blue-800">Confirm Headers</p>
              <p className="text-blue-700 text-xs mt-1">
                Select which row contains your column headers
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
              4
            </div>
            <div>
              <p className="font-medium text-blue-800">Review Column Names</p>
              <p className="text-blue-700 text-xs mt-1">
                Edit column names and remove unwanted columns
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
              5
            </div>
            <div>
              <p className="font-medium text-blue-800">Set Data Types</p>
              <p className="text-blue-700 text-xs mt-1">
                Configure data types (text, number, date, etc.) for each column
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
              6
            </div>
            <div>
              <p className="font-medium text-blue-800">Handle Missing Values</p>
              <p className="text-blue-700 text-xs mt-1">
                Choose strategies for handling empty or missing data
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
              7
            </div>
            <div>
              <p className="font-medium text-green-800">Preview & Save</p>
              <p className="text-green-700 text-xs mt-1">
                Review your cleaned data and save it to your project
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Supported Formats */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-700 flex items-center gap-2">
          <FileUp className="w-4 h-4" />
          Supported File Formats
        </h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span>CSV (.csv)</span>
          </div>
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span>Excel (.xlsx, .xls)</span>
          </div>
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span>JSON (.json)</span>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
        <h4 className="font-medium text-amber-800 mb-2">💡 Tips</h4>
        <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
          <li>Ensure your file has clear column headers</li>
          <li>Remove any unnecessary summary rows before upload</li>
          <li>For large files, the upload may take a few moments</li>
          <li>You can upload multiple files in one session</li>
        </ul>
      </div>
    </div>
  );
};

export default DataUploadHelp;

