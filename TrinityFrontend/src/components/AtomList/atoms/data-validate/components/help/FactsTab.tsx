import React from 'react';

interface Props {
  atomId: string;
}

const FAQsTab: React.FC<Props> = ({ atomId }) => {
  return (
    <div className="p-4">
      <div className="text-center py-8">
        <p className="text-gray-600 text-sm">FAQs tab content coming soon</p>
      </div>
    </div>
  );
};

export default FAQsTab;
