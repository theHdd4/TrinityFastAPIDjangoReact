import React from 'react';

interface Props {
  atomId: string;
}

const ColumnClassifierHelp: React.FC<Props> = ({ atomId }) => {
  return (
    <div className="p-4">
      <div className="mb-4">
        <h4 className="font-semibold text-gray-900 mb-2">Column Classifier</h4>
        <p className="text-sm text-gray-600 mb-3">
          Classify dataset columns and define business dimensions for better data organization and analysis.
        </p>
      </div>
      
      <div className="space-y-4">
        <div>
          <h5 className="font-medium text-gray-800 mb-2">What It Does:</h5>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Automatically analyzes your dataset columns</li>
            <li>• Classifies columns into categories (identifiers, measures, unclassified)</li>
            <li>• Allows custom dimension creation and mapping</li>
            <li>• Provides business-ready data structure</li>
          </ul>
        </div>
        
        <div>
          <h5 className="font-medium text-gray-800 mb-2">Column Categories:</h5>
          <div className="space-y-2">
            <div className="border border-gray-200 rounded-lg p-3">
              <h6 className="font-medium text-blue-700 mb-1">Identifiers</h6>
              <p className="text-sm text-gray-600">Unique keys, IDs, and primary identifiers</p>
            </div>
            
            <div className="border border-gray-200 rounded-lg p-3">
              <h6 className="font-medium text-green-700 mb-1">Measures</h6>
              <p className="text-sm text-gray-600">Numeric values, metrics, and KPIs</p>
            </div>
            
            <div className="border border-gray-200 rounded-lg p-3">
              <h6 className="font-medium text-purple-700 mb-1">Unclassified</h6>
              <p className="text-sm text-gray-600">Categorical data for grouping and filtering</p>
            </div>
          </div>
        </div>
        
        <div>
          <h5 className="font-medium text-gray-800 mb-2">How to Use:</h5>
          <ol className="text-sm text-gray-600 space-y-1">
            <li>1. Upload your dataset using Data Upload atom</li>
            <li>2. Column Classifier automatically analyzes columns</li>
            <li>3. Review and adjust column classifications</li>
            <li>4. Create custom unclassified if needed</li>
            <li>5. Move columns between categories as needed</li>
            <li>6. Click "Save Configuration" to apply changes</li>
          </ol>
        </div>
        
        <div>
          <h5 className="font-medium text-gray-800 mb-2">Features:</h5>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Automatic column detection and classification</li>
            <li>• Drag & drop column movement between categories</li>
            <li>• Custom dimension creation and management</li>
            <li>• Multi-file support with file switching</li>
            <li>• Column filtering and unique value display</li>
            <li>• Real-time classification updates</li>
          </ul>
        </div>
        
        <div>
          <h5 className="font-medium text-gray-800 mb-2">Tips:</h5>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Review automatic classifications before saving</li>
            <li>• Create meaningful custom dimension names</li>
            <li>• Use identifiers for unique record identification</li>
            <li>• Group related measures together</li>
            <li>• Dimensions help with data segmentation and analysis</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ColumnClassifierHelp;
