'use client';

import '../seasonax.css';
import '../seasonality.css';
import '../seasonal-cards.css';
import { useState } from 'react';
import SeasonaxLanding from '@/components/seasonax/SeasonaxLanding';
import SeasonalityChart from '@/components/analytics/SeasonalityChart';

export default function DataDriven() {
 const [activeTab, setActiveTab] = useState<'screener' | 'chart'>('chart'); // Start with chart view

 const handleStartScreener = () => {
 setActiveTab('chart');
 };

 const handleBackToTabs = () => {
 setActiveTab('screener');
 };

 if (activeTab === 'chart') {
 return (
 <div className="data-driven-container">
   <SeasonalityChart 
     onBackToTabs={handleBackToTabs} 
     autoStart={true}
   />
 </div>
 );
 }

 return (
 <div className="data-driven-container">
   <div className="tab-content">
     {activeTab === 'screener' && (
       <SeasonaxLanding 
         onStartScreener={handleStartScreener}
       />
     )}
   </div>
 </div>
 );
}
