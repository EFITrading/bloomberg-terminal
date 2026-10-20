'use client'

import SeasonaxLanding from '@/components/seasonax/SeasonaxLanding'

// Opened only by the collector's nightly 10PM PT job (headless Chromium) to run and save every
// index scan. Sets window.__seasonalAutoScanDone when finished.
export default function SeasonalAutoScanPage() {
  return <SeasonaxLanding autoScanAll />
}
