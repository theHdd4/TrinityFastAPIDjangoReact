
import React from 'react';

export const blankTemplate = {
  id: 'blank',
  name: 'Blank App',
  molecules: []
};

const BlankApp: React.FC = () => {
  return (
    <div className="blank-app">
      <h2>Blank App Template</h2>
      <p>Clean slate - start from scratch</p>
    </div>
  );
};

export default BlankApp;
