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
}

const MarketTabs: React.FC<MarketTabsProps> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="market-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`market-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.name}
        </button>
      ))}
    </div>
  );
};

export default MarketTabs;
