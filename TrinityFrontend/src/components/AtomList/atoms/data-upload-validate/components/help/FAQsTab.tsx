import React from 'react';

interface Props {
  atomId: string;
}

const FAQsTab: React.FC<Props> = ({ atomId }) => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <h4 className="font-semibold text-gray-900 mb-2">Frequently Asked Questions</h4>
        <p className="text-sm text-gray-600 mb-4">
          This atom supports <button onClick={() => scrollToSection('direct-upload')} className="text-blue-600 underline hover:text-blue-800">direct upload</button> and <button onClick={() => scrollToSection('validation-upload')} className="text-blue-600 underline hover:text-blue-800">validation with upload</button> methods. You can upload various <button onClick={() => scrollToSection('file-formats')} className="text-blue-600 underline hover:text-blue-800">file formats</button> including CSV, Excel, JSON, and Arrow files. The system provides <button onClick={() => scrollToSection('data-validation')} className="text-blue-600 underline hover:text-blue-800">data validation</button> features and <button onClick={() => scrollToSection('error-handling')} className="text-blue-600 underline hover:text-blue-800">error handling</button> to ensure data quality.
        </p>
      </div>

      <div className="space-y-4">
        <div id="direct-upload" className="border border-gray-200 rounded-lg p-3">
          <h5 className="font-medium text-gray-800 mb-2">Direct Upload</h5>
          <p className="text-sm text-gray-600">
            Direct upload allows you to upload files immediately without any validation checks. This method is faster and suitable when you trust your data quality. Files are processed and stored as-is.
          </p>
        </div>

        <div id="validation-upload" className="border border-gray-200 rounded-lg p-3">
          <h5 className="font-medium text-gray-800 mb-2">Validation with Upload</h5>
          <p className="text-sm text-gray-600">
            This method uses a master file template to validate your data before uploading. It ensures data consistency, checks for format compliance, and provides detailed validation reports. Perfect for maintaining data quality standards.
          </p>
        </div>

        <div id="file-formats" className="border border-gray-200 rounded-lg p-3">
          <h5 className="font-medium text-gray-800 mb-2">Supported File Formats</h5>
          <p className="text-sm text-gray-600">
            The system supports CSV files (.csv), Excel files (.xlsx, .xls), JSON files (.json), and Arrow files (.arrow). Maximum file size is 100MB. Each format is automatically detected and processed accordingly.
          </p>
        </div>

        <div id="data-validation" className="border border-gray-200 rounded-lg p-3">
          <h5 className="font-medium text-gray-800 mb-2">Data Validation</h5>
          <p className="text-sm text-gray-600">
            Data validation includes checking column headers, data types, format consistency, and structure compliance. The system provides real-time validation results and detailed error reports to help identify and fix issues.
          </p>
        </div>

        <div id="error-handling" className="border border-gray-200 rounded-lg p-3">
          <h5 className="font-medium text-gray-800 mb-2">Error Handling</h5>
          <p className="text-sm text-gray-600">
            The system provides comprehensive error handling with detailed error messages, validation reports, and suggestions for fixing issues. Common errors include unsupported formats, missing headers, data type mismatches, and file size limits.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FAQsTab;
