'use client';

import '../seasonax.css';
import '../seasonality.css';
import '../seasonal-cards.css';
import '../almanac.css';
import SeasonalityChart from '@/components/analytics/SeasonalityChart';

export default function DataDriven() {
  return (
    <div className="data-driven-container">
      <SeasonalityChart autoStart={true} />
    </div>
  );
}
