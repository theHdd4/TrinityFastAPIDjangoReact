
import React from 'react';

export const blankTemplate = {
  id: 'blank',
  name: 'Custom Workspace',
  molecules: []
};

const BlankApp: React.FC = () => {
  return (
    <div className="blank-app">
      <h2>Custom Workspace Template</h2>
      <p>Clean slate - start from scratch</p>
    </div>
  );
};

export default BlankApp;
