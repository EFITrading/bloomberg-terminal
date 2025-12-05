'use client';

import '../seasonax.css';
import '../seasonality.css';
import '../seasonal-cards.css';
import '../almanac.css';
import { useState } from 'react';
import SeasonalityChart from '@/components/analytics/SeasonalityChart';
import SeasonaxLanding from '@/components/seasonax/SeasonaxLanding';
import AlmanacDailyChart from '@/components/analytics/AlmanacDailyChart';
import AlmanacCalendar from '@/components/analytics/AlmanacCalendar';
import WeeklyScanTable from '@/components/analytics/WeeklyScanTable';

type TabType = 'screener' | 'seasonality' | 'almanac';

export default function DataDriven() {
  const [activeTab, setActiveTab] = useState<TabType>('seasonality');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const handleMonthChange = (month: number) => {
    setSelectedMonth(month);
  };

  // Render the main navigation tabs
  const renderTabs = () => (
    <div className="almanac-tabs">
      <button 
        className={`almanac-tab ${activeTab === 'seasonality' ? 'active' : ''}`}
        onClick={() => setActiveTab('seasonality')}
      >
        Seasonality Chart
      </button>
      <button 
        className={`almanac-tab ${activeTab === 'almanac' ? 'active' : ''}`}
        onClick={() => setActiveTab('almanac')}
      >
        Monthly Analysis
      </button>
      <button 
        className={`almanac-tab ${activeTab === 'screener' ? 'active' : ''}`}
        onClick={() => setActiveTab('screener')}
      >
        Screener
      </button>
    </div>
  );

  // Screener (landing page with opportunities)
  if (activeTab === 'screener') {
    return (
      <div className="data-driven-container">
        {renderTabs()}
        <SeasonaxLanding />
      </div>
    );
  }

  // Seasonality Chart
  if (activeTab === 'seasonality') {
    return (
      <div className="data-driven-container">
        {renderTabs()}
        <SeasonalityChart autoStart={true} />
      </div>
    );
  }

  // Combined Almanac View (chart, calendar, and weekly scan table)
  if (activeTab === 'almanac') {
    return (
      <div className="data-driven-container">
        {renderTabs()}
        <div className="almanac-combined-layout">
          {/* Monthly Seasonal Chart - 50% */}
          <div className="almanac-section chart-section">
            <AlmanacDailyChart 
              month={selectedMonth} 
              showPostElection={true} 
              onMonthChange={handleMonthChange}
            />
          </div>
          
          {/* Strategy Calendar - 50% */}
          <div className="almanac-section calendar-section">
            <AlmanacCalendar month={selectedMonth} year={selectedYear} />
            {/* Weekly Scan Table under calendar */}
            <WeeklyScanTable />
          </div>
        </div>
      </div>
    );
  }

  // Default (seasonality)
  return (
    <div className="data-driven-container">
      {renderTabs()}
      <SeasonalityChart autoStart={true} />
    </div>
  );
}
