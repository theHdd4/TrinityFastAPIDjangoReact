import React from 'react';

interface Props {
  atomId: string;
}

const DataUploadTab: React.FC<Props> = ({ atomId }) => {
  return (
    <div className="p-4">
      <div className="mb-4">
        <h4 className="font-semibold text-gray-900 mb-2">Data Upload</h4>
        <p className="text-sm text-gray-600 mb-3">
          Upload your data files directly without validation for quick processing.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <h5 className="font-medium text-gray-800 mb-2">Supported File Types:</h5>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• CSV files (.csv)</li>
            <li>• Excel files (.xlsx, .xls)</li>
            <li>• JSON files (.json)</li>
            <li>• Arrow files (.arrow)</li>
          </ul>
        </div>

        <div>
          <h5 className="font-medium text-gray-800 mb-2">Direct Upload Method:</h5>
          <div className="border border-gray-200 rounded-lg p-3">
            <h6 className="font-medium text-blue-700 mb-2">Direct Upload</h6>
            <p className="text-sm text-gray-600 mb-2">Upload files directly without validation</p>
            <ol className="text-sm text-gray-600 space-y-1">
              <li>1. Drag & drop files or click to select</li>
              <li>2. Files are uploaded immediately</li>
              <li>3. Click "Save Data Frame" to save</li>
              <li>4. Files are stored as-is</li>
            </ol>
          </div>
        </div>

        <div>
          <h5 className="font-medium text-gray-800 mb-2">Features:</h5>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Drag & drop file upload</li>
            <li>• Automatic data type detection</li>
            <li>• Quick file processing</li>
            <li>• Immediate upload confirmation</li>
          </ul>
        </div>

        <div>
          <h5 className="font-medium text-gray-800 mb-2">Tips:</h5>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Ensure your data has headers in the first row</li>
            <li>• Large files may take longer to process</li>
            <li>• Supported file size: up to 100MB</li>
            <li>• Duplicate files are automatically detected</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DataUploadTab;