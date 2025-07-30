
import React from 'react';

export const marketingMixTemplate = {
  id: 'marketing-mix',
  name: 'Marketing Mix Modeling',
  molecules: [
    {
      id: 'preprocess-1',
      type: 'Data',
      title: 'Data Pre-Processor',
      position: { x: 100, y: 100 }
    },
    {
      id: 'explore-2',
      type: 'EDA', 
      title: 'Marketing Explorer',
      position: { x: 400, y: 100 }
    }
  ]
};

const MarketingMixApp: React.FC = () => {
  return (
    <div className="marketing-mix-app">
      <h2>Marketing Mix Modeling Template</h2>
      <p>Pre-configured with Data Pre-Process and Explore molecules</p>
    </div>
  );
};

export default MarketingMixApp;
