'use client';

import '../seasonax.css';
import '../seasonality.css';
import '../seasonal-cards.css';
import '../almanac.css';
import SeasonalityChart from '@/components/analytics/SeasonalityChart';
import AlmanacDailyChart from '@/components/analytics/AlmanacDailyChart';
import SeasonaxLanding from '@/components/seasonax/SeasonaxLanding';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function DataDriven() {
  return (
    <div className="data-driven-container">
      {/* Desktop view - shows all components as before */}
      <div className="desktop-view">
        <SeasonalityChart autoStart={true} />
      </div>

      {/* Mobile view - shows tabs */}
      <div className="mobile-view">
        <Tabs defaultValue="seasonality" className="w-full">
          <TabsList className="mobile-tabs-list">
            <TabsTrigger value="seasonality" className="mobile-tab-trigger">
              Seasonality
            </TabsTrigger>
            <TabsTrigger value="monthly" className="mobile-tab-trigger">
              Monthly
            </TabsTrigger>
            <TabsTrigger value="screener" className="mobile-tab-trigger">
              Screener
            </TabsTrigger>
          </TabsList>

          <TabsContent value="seasonality" className="mobile-tab-content">
            <div className="mobile-seasonality-wrapper">
              <SeasonalityChart autoStart={true} hideControls={false} />
            </div>
          </TabsContent>

          <TabsContent value="monthly" className="mobile-tab-content">
            <AlmanacDailyChart 
              month={new Date().getMonth()} 
              showPostElection={true}
              symbol="SPY"
            />
          </TabsContent>

          <TabsContent value="screener" className="mobile-tab-content">
            <SeasonaxLanding />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
