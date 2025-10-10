import React from 'react';

export const edaTemplate = {
  id: 'eda',
  name: 'Exploratory Data Analysis',
  molecules: [
    {
      id: 'eda-data-prep-1',
      type: 'Data Pre-Process',
      title: 'EDA Data Processor',
      subtitle: 'Prepare data for exploratory analysis',
      position: { x: 100, y: 100 }
    },
    {
      id: 'eda-explore-1',
      type: 'Explore',
      title: 'EDA Explorer',
      subtitle: 'Comprehensive data exploration',
      position: { x: 400, y: 100 }
    },
    {
      id: 'eda-visualize-1',
      type: 'Visualization',
      title: 'EDA Visualizer',
      subtitle: 'Advanced data visualization',
      position: { x: 700, y: 100 }
    }
  ]
};

const EDAApp: React.FC = () => {
  return (
    <div className="eda-app">
      <h2>EDA Template</h2>
      <p>Pre-configured with EDA Data Processing, Explorer, and Visualizer molecules</p>
    </div>
  );
};

export default EDAApp;
