'use client';

import React, { useState } from 'react';

interface MarketTab {
  id: string;
  name: string;
  active?: boolean;
}

interface MarketTabsProps {
  tabs: MarketTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  loading?: boolean;
}

const MarketTabs: React.FC<MarketTabsProps> = ({ tabs, activeTab, onTabChange, loading = false }) => {
  return (
    <div className="market-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`market-tab ${activeTab === tab.id ? 'active' : ''} ${loading && activeTab === tab.id ? 'loading' : ''}`}
          onClick={() => !loading && onTabChange(tab.id)}
          disabled={loading && activeTab === tab.id}
        >
          {tab.name}
          {loading && activeTab === tab.id && (
            <span className="loading-spinner-inline"></span>
          )}
        </button>
      ))}
    </div>
  );
};

export default MarketTabs;
