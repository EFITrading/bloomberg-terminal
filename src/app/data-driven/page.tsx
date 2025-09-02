'use client';

import '../seasonax.css';
import '../seasonality.css';
import { useState } from 'react';
import SeasonaxLanding from '@/components/seasonax/SeasonaxLanding';
import SeasonalityChart from '@/components/analytics/SeasonalityChart';
import SectorsTable from '@/components/seasonax/SectorsTable';

export default function DataDriven() {
  const [activeTab, setActiveTab] = useState<'screener' | 'sectors' | 'chart'>('screener');

  const handleStartScreener = () => {
    setActiveTab('chart');
  };

  const handleBackToTabs = () => {
    setActiveTab('screener');
  };

  const handleSectorsClick = () => {
    setActiveTab('sectors');
  };

  if (activeTab === 'chart') {
    return (
      <div className="data-driven-container">
        <div className="navigation-header">
          <button 
            onClick={handleBackToTabs}
            className="back-button"
          >
            ← Back to Data Driven
          </button>
          <h1>Seasonal Chart Analysis</h1>
        </div>
        <SeasonalityChart />
      </div>
    );
  }

  return (
    <div className="data-driven-container">
      <div className="tab-content">
        {activeTab === 'screener' && (
          <SeasonaxLanding onStartScreener={handleStartScreener} onSectorsClick={handleSectorsClick} />
        )}
        {activeTab === 'sectors' && (
          <div>
            <div className="navigation-header">
              <button 
                onClick={() => setActiveTab('screener')}
                className="back-button"
              >
                ← Back to Screener
              </button>
              <h1>Sectors & Industries Analysis</h1>
            </div>
            <SectorsTable />
          </div>
        )}
      </div>
    </div>
  );
}
