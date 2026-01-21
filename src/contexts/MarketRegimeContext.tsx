'use client';

import React, { createContext, useContext, useState } from 'react';

interface MarketRegime {
  period: string;
  regime: string;
}

interface SectorAnalysis {
  sector: string;
  change: number;
  relativeToSPY: number;
}

interface RegimeAnalysis {
  defensiveAvg: number;
  growthAvg: number;
  valueAvg: number;
  defensiveGrowthSpread: number;
  spreadStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  regime: 'STRONG DEFENSIVE' | 'MODERATE DEFENSIVE' | 'DEFENSIVE + VALUE' | 'RISK ON' | 'STRONG RISK ON' | 'GROWTH + RISK ON' | 'VALUE' | 'MIXED' | 'RISK OFF';
  confidence: number;
  defensiveSectors: SectorAnalysis[];
  growthSectors: SectorAnalysis[];
  valueSectors: SectorAnalysis[];
}

interface MarketRegimeContextType {
  regimes: MarketRegime[];
  setRegimes: (regimes: MarketRegime[]) => void;
  regimeAnalysis: Record<string, RegimeAnalysis>;
  setRegimeAnalysis: (analysis: Record<string, RegimeAnalysis>) => void;
}

const MarketRegimeContext = createContext<MarketRegimeContextType | undefined>(undefined);

export function MarketRegimeProvider({ children }: { children: React.ReactNode }) {
  const [regimes, setRegimes] = useState<MarketRegime[]>([]);
  const [regimeAnalysis, setRegimeAnalysis] = useState<Record<string, RegimeAnalysis>>({});

  return (
    <MarketRegimeContext.Provider value={{ regimes, setRegimes, regimeAnalysis, setRegimeAnalysis }}>
      {children}
    </MarketRegimeContext.Provider>
  );
}

export function useMarketRegime() {
  const context = useContext(MarketRegimeContext);
  if (context === undefined) {
    throw new Error('useMarketRegime must be used within a MarketRegimeProvider');
  }
  return context;
}

// Export types for reuse
export type { RegimeAnalysis, SectorAnalysis, MarketRegime };
