'use client';

import '../seasonax.css';
import '../seasonality.css';
import { useState } from 'react';
import SeasonaxLanding from '@/components/seasonax/SeasonaxLanding';
import SeasonalityChart from '@/components/analytics/SeasonalityChart';

export default function DataDriven() {
  const [currentView, setCurrentView] = useState<'landing' | 'chart'>('landing');

  const handleStartScreener = () => {
    setCurrentView('chart');
  };

  const handleBackToLanding = () => {
    setCurrentView('landing');
  };

  if (currentView === 'chart') {
    return (
      <div className="data-driven-container">
        <div className="navigation-header">
          <button 
            onClick={handleBackToLanding}
            className="back-button"
          >
            ← Back to Seasonax Landing
          </button>
          <h1>Seasonal Chart Analysis</h1>
        </div>
        <SeasonalityChart />
      </div>
    );
  }

  return <SeasonaxLanding onStartScreener={handleStartScreener} />;
}
