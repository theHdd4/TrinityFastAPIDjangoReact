import React from 'react';

interface Props {
  atomId: string;
}

const DataValidateTab: React.FC<Props> = ({ atomId }) => {
  return (
    <div className="p-4">
      <div className="mb-4">
        <h4 className="font-semibold text-gray-900 mb-2">Data Validate</h4>
        <p className="text-sm text-gray-600 mb-3">
          Validate your data files using a master file template to ensure data quality and consistency.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <h5 className="font-medium text-gray-800 mb-2">Validation Method:</h5>
          <div className="border border-gray-200 rounded-lg p-3">
            <h6 className="font-medium text-green-700 mb-2">Validate & Upload</h6>
            <p className="text-sm text-gray-600 mb-2">Upload with validation using master file</p>
            <ol className="text-sm text-gray-600 space-y-1">
              <li>1. Upload master file in Properties section</li>
              <li>2. Drag & drop files to validate</li>
              <li>3. Click "Validate Files" to check format</li>
              <li>4. Review validation results</li>
              <li>5. Click "Save Data Frame" to save</li>
            </ol>
          </div>
        </div>

        <div>
          <h5 className="font-medium text-gray-800 mb-2">Validation Features:</h5>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Data validation and cleaning</li>
            <li>• File assignment mapping</li>
            <li>• Validation result preview</li>
            <li>• Error handling and reporting</li>
            <li>• Master file template matching</li>
            <li>• Format consistency checking</li>
          </ul>
        </div>

        <div>
          <h5 className="font-medium text-gray-800 mb-2">Tips:</h5>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Check validation results before saving</li>
            <li>• Ensure master file matches your data structure</li>
            <li>• Review error messages for data quality issues</li>
            <li>• Large files may take longer to validate</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DataValidateTab;
