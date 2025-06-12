
import React from 'react';

export const forecastingTemplate = {
  id: 'forecasting',
  name: 'Forecasting Analysis',
  molecules: [
    {
      id: 'explore-1',
      type: 'EDA',
      title: 'Data Explorer',
      position: { x: 100, y: 100 }
    },
    {
      id: 'build-1', 
      type: 'Modeling',
      title: 'Time Series Builder',
      position: { x: 400, y: 100 }
    }
  ]
};

const ForecastingApp: React.FC = () => {
  return (
    <div className="forecasting-app">
      <h2>Forecasting Analysis Template</h2>
      <p>Pre-configured with Explore and Build molecules</p>
    </div>
  );
};

export default ForecastingApp;
