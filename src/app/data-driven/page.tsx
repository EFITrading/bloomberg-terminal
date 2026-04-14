'use client'

import AlmanacDailyChart from '@/components/analytics/AlmanacDailyChart'
import HistoricalEventsResearch from '@/components/analytics/HistoricalEventsResearch'
import SeasonalityChart from '@/components/analytics/SeasonalityChart'
import SeasonaxLanding from '@/components/seasonax/SeasonaxLanding'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import '../almanac.css'
import '../seasonal-cards.css'
import '../seasonality.css'
import '../seasonax.css'

export default function DataDriven() {
  return (
    <>
      <style>{`html, body { overflow: hidden !important; }`}</style>
      <div className="data-driven-container" style={{ minHeight: 'auto' }}>
        {/* Desktop view - shows all components side by side */}
        <div className="desktop-view">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '46% 53.75%',
              gap: '0.25%',
              width: '100%',
              marginTop: '12px',
            }}
          >
            <div style={{ minWidth: 0, width: '100%' }}>
              <SeasonalityChart autoStart={true} hideScreener={true} />
            </div>
            <div
              style={{
                minWidth: 0,
                marginTop: '-75px',
                height: 'calc(94vh - 40px)',
                overflow: 'hidden',
                border: '1px solid #B8960C',
                outline: '1px solid rgba(184,150,12,0.4)',
              }}
            >
              <HistoricalEventsResearch />
            </div>
          </div>
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
    </>
  )
}
