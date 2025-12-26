'use client';

import React, { createContext, useContext, useState } from 'react';

interface MarketRegime {
  period: string;
  regime: string;
}

interface MarketRegimeContextType {
  regimes: MarketRegime[];
  setRegimes: (regimes: MarketRegime[]) => void;
}

const MarketRegimeContext = createContext<MarketRegimeContextType | undefined>(undefined);

export function MarketRegimeProvider({ children }: { children: React.ReactNode }) {
  const [regimes, setRegimes] = useState<MarketRegime[]>([]);

  return (
    <MarketRegimeContext.Provider value={{ regimes, setRegimes }}>
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
