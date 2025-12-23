import React, { useState } from 'react';
import DataUploadTab from './DataUploadTab';
import DataValidateTab from './DataValidateTab';
import FAQsTab from './FAQsTab';

interface Props {
  atomId: string;
}

const DataUploadValidateHelp: React.FC<Props> = ({ atomId }) => {
  const [activeTab, setActiveTab] = useState<'data-upload' | 'data-validate' | 'faqs'>('data-validate');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'data-upload':
        return <DataUploadTab atomId={atomId} />;
      case 'data-validate':
        return <DataValidateTab atomId={atomId} />;
      case 'faqs':
        return <FAQsTab atomId={atomId} />;
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Tab Headers */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('data-upload')}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'data-upload'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Data Upload
        </button>
        <button
          onClick={() => setActiveTab('data-validate')}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'data-validate'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Data Validate
        </button>
        <button
          onClick={() => setActiveTab('faqs')}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'faqs'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          FAQs
        </button>
      </div>

      {/* Tab Content */}
      {renderTabContent()}
    </div>
  );
};

export default DataUploadValidateHelp;
