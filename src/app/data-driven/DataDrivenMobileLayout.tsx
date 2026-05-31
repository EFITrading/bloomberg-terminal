'use client'

import AlmanacDailyChart from '@/components/analytics/AlmanacDailyChart'
import SeasonalityChart from '@/components/analytics/SeasonalityChart'
import SeasonaxLanding from '@/components/seasonax/SeasonaxLanding'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * Mobile-only layout for the Data Driven page.
 * Shows a tabbed view (Seasonality / Monthly / Screener) replacing the side-by-side desktop grid.
 * Extracted from page.tsx so desktop layout code stays separate.
 */
export default function DataDrivenMobileLayout() {
    return (
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
    )
}
