'use client'

import { createPortal } from 'react-dom'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ETF Definitions
const SECTORS = [
  { symbol: 'XLK', name: 'Technology', color: '#00d4ff' },
  { symbol: 'XLF', name: 'Financials', color: '#ff6b35' },
  { symbol: 'XLV', name: 'Healthcare', color: '#4ecdc4' },
  { symbol: 'XLI', name: 'Industrials', color: '#ffd93d' },
  { symbol: 'XLY', name: 'Discretionary', color: '#ff006e' },
  { symbol: 'XLP', name: 'Staples', color: '#8338ec' },
  { symbol: 'XLE', name: 'Energy', color: '#06ffa5' },
  { symbol: 'XLU', name: 'Utilities', color: '#ff9f1c' },
  { symbol: 'XLRE', name: 'Real Estate', color: '#2ec4b6' },
  { symbol: 'XLB', name: 'Materials', color: '#e71d36' },
  { symbol: 'XLC', name: 'Communication', color: '#a855f7' },
]

const INDUSTRIES = [
  { symbol: 'IGV', name: 'Software', color: '#00d4ff' },
  { symbol: 'SMH', name: 'Semiconductors', color: '#ff6b35' },
  { symbol: 'XRT', name: 'Retail', color: '#4ecdc4' },
  { symbol: 'KIE', name: 'Insurance', color: '#ffd93d' },
  { symbol: 'KRE', name: 'Regional Banks', color: '#ff006e' },
  { symbol: 'XBI', name: 'Biotech', color: '#8338ec' },
  { symbol: 'XHB', name: 'Homebuilders', color: '#06ffa5' },
  { symbol: 'ITB', name: 'Building', color: '#ff9f1c' },
  { symbol: 'XME', name: 'Metals & Mining', color: '#2ec4b6' },
  { symbol: 'IYT', name: 'Transportation', color: '#e71d36' },
  { symbol: 'XOP', name: 'Oil & Gas', color: '#a855f7' },
]

const SPECIAL = [
  { symbol: 'IWF', name: 'Russell 1000 Growth', color: '#00d4ff' },
  { symbol: 'IWD', name: 'Russell 1000 Value', color: '#ff6b35' },
  { symbol: 'IJR', name: 'S&P 600', color: '#ffd93d' },
  { symbol: 'USMV', name: 'Min Volatility', color: '#ff006e' },
  { symbol: 'VYM', name: 'High Dividend', color: '#8338ec' },
  { symbol: 'MTUM', name: 'Momentum', color: '#06ffa5' },
  { symbol: 'QUAL', name: 'Quality', color: '#ff9f1c' },
  { symbol: 'SIZE', name: 'Size Factor', color: '#2ec4b6' },
  { symbol: 'VLUE', name: 'Value Factor', color: '#e71d36' },
]

// Wave groups - same as RRG groupings
const WAVE_GROUPS = {
  growth: {
    name: 'Growth',
    tickers: ['XLK', 'XLY', 'XLC'],
    color: 'rgba(0, 255, 100, 0.9)',
  },
  value: {
    name: 'Value',
    tickers: ['XLI', 'XLB', 'XLE', 'XLF'],
    color: 'rgba(100, 150, 255, 0.9)',
  },
  defensives: {
    name: 'Defensives',
    tickers: ['XLV', 'XLU', 'XLRE', 'XLP'],
    color: 'rgba(255, 200, 0, 0.9)',
  },
}

// Top 10 holdings per sector ETF
const SECTOR_HOLDINGS: Record<string, Array<{ symbol: string; name: string; color: string }>> = {
  XLK: [
    { symbol: 'AAPL', name: 'Apple', color: '#00d4ff' }, { symbol: 'MSFT', name: 'Microsoft', color: '#ff6b35' },
    { symbol: 'NVDA', name: 'NVIDIA', color: '#4ecdc4' }, { symbol: 'AVGO', name: 'Broadcom', color: '#ffd93d' },
    { symbol: 'AMD', name: 'AMD', color: '#ff006e' }, { symbol: 'ORCL', name: 'Oracle', color: '#8338ec' },
    { symbol: 'ADBE', name: 'Adobe', color: '#06ffa5' }, { symbol: 'CRM', name: 'Salesforce', color: '#ff9f1c' },
    { symbol: 'CSCO', name: 'Cisco', color: '#2ec4b6' }, { symbol: 'ACN', name: 'Accenture', color: '#e71d36' },
  ],
  XLF: [
    { symbol: 'BRK.B', name: 'Berkshire', color: '#00d4ff' }, { symbol: 'JPM', name: 'JPMorgan', color: '#ff6b35' },
    { symbol: 'V', name: 'Visa', color: '#4ecdc4' }, { symbol: 'MA', name: 'Mastercard', color: '#ffd93d' },
    { symbol: 'BAC', name: 'Bank of America', color: '#ff006e' }, { symbol: 'GS', name: 'Goldman Sachs', color: '#8338ec' },
    { symbol: 'MS', name: 'Morgan Stanley', color: '#06ffa5' }, { symbol: 'WFC', name: 'Wells Fargo', color: '#ff9f1c' },
    { symbol: 'BLK', name: 'BlackRock', color: '#2ec4b6' }, { symbol: 'AXP', name: 'Amex', color: '#e71d36' },
  ],
  XLV: [
    { symbol: 'LLY', name: 'Eli Lilly', color: '#00d4ff' }, { symbol: 'UNH', name: 'UnitedHealth', color: '#ff6b35' },
    { symbol: 'JNJ', name: 'J&J', color: '#4ecdc4' }, { symbol: 'ABBV', name: 'AbbVie', color: '#ffd93d' },
    { symbol: 'MRK', name: 'Merck', color: '#ff006e' }, { symbol: 'TMO', name: 'Thermo Fisher', color: '#8338ec' },
    { symbol: 'ABT', name: 'Abbott', color: '#06ffa5' }, { symbol: 'AMGN', name: 'Amgen', color: '#ff9f1c' },
    { symbol: 'PFE', name: 'Pfizer', color: '#2ec4b6' }, { symbol: 'BMY', name: 'Bristol-Myers', color: '#e71d36' },
  ],
  XLI: [
    { symbol: 'CAT', name: 'Caterpillar', color: '#00d4ff' }, { symbol: 'RTX', name: 'Raytheon', color: '#ff6b35' },
    { symbol: 'HON', name: 'Honeywell', color: '#4ecdc4' }, { symbol: 'UNP', name: 'Union Pacific', color: '#ffd93d' },
    { symbol: 'BA', name: 'Boeing', color: '#ff006e' }, { symbol: 'GE', name: 'GE Aerospace', color: '#8338ec' },
    { symbol: 'LMT', name: 'Lockheed', color: '#06ffa5' }, { symbol: 'UPS', name: 'UPS', color: '#ff9f1c' },
    { symbol: 'DE', name: 'Deere', color: '#2ec4b6' }, { symbol: 'MMM', name: '3M', color: '#e71d36' },
  ],
  XLY: [
    { symbol: 'AMZN', name: 'Amazon', color: '#00d4ff' }, { symbol: 'TSLA', name: 'Tesla', color: '#ff6b35' },
    { symbol: 'HD', name: 'Home Depot', color: '#4ecdc4' }, { symbol: 'MCD', name: "McDonald's", color: '#ffd93d' },
    { symbol: 'NKE', name: 'Nike', color: '#ff006e' }, { symbol: 'LOW', name: "Lowe's", color: '#8338ec' },
    { symbol: 'SBUX', name: 'Starbucks', color: '#06ffa5' }, { symbol: 'TJX', name: 'TJX', color: '#ff9f1c' },
    { symbol: 'BKNG', name: 'Booking', color: '#2ec4b6' }, { symbol: 'CMG', name: 'Chipotle', color: '#e71d36' },
  ],
  XLP: [
    { symbol: 'PG', name: 'P&G', color: '#00d4ff' }, { symbol: 'KO', name: 'Coca-Cola', color: '#ff6b35' },
    { symbol: 'PEP', name: 'PepsiCo', color: '#4ecdc4' }, { symbol: 'WMT', name: 'Walmart', color: '#ffd93d' },
    { symbol: 'COST', name: 'Costco', color: '#ff006e' }, { symbol: 'PM', name: 'Philip Morris', color: '#8338ec' },
    { symbol: 'MDLZ', name: 'Mondelez', color: '#06ffa5' }, { symbol: 'MO', name: 'Altria', color: '#ff9f1c' },
    { symbol: 'CL', name: 'Colgate', color: '#2ec4b6' }, { symbol: 'GIS', name: 'General Mills', color: '#e71d36' },
  ],
  XLE: [
    { symbol: 'XOM', name: 'ExxonMobil', color: '#00d4ff' }, { symbol: 'CVX', name: 'Chevron', color: '#ff6b35' },
    { symbol: 'COP', name: 'ConocoPhillips', color: '#4ecdc4' }, { symbol: 'EOG', name: 'EOG Resources', color: '#ffd93d' },
    { symbol: 'MPC', name: 'Marathon', color: '#ff006e' }, { symbol: 'SLB', name: 'Schlumberger', color: '#8338ec' },
    { symbol: 'OXY', name: 'Occidental', color: '#06ffa5' }, { symbol: 'VLO', name: 'Valero', color: '#ff9f1c' },
    { symbol: 'PSX', name: 'Phillips 66', color: '#2ec4b6' }, { symbol: 'PXD', name: 'Pioneer', color: '#e71d36' },
  ],
  XLU: [
    { symbol: 'NEE', name: 'NextEra', color: '#00d4ff' }, { symbol: 'DUK', name: 'Duke Energy', color: '#ff6b35' },
    { symbol: 'SO', name: 'Southern Co', color: '#4ecdc4' }, { symbol: 'D', name: 'Dominion', color: '#ffd93d' },
    { symbol: 'AEP', name: 'AEP', color: '#ff006e' }, { symbol: 'SRE', name: 'Sempra', color: '#8338ec' },
    { symbol: 'EXC', name: 'Exelon', color: '#06ffa5' }, { symbol: 'XEL', name: 'Xcel Energy', color: '#ff9f1c' },
    { symbol: 'ED', name: 'Con Edison', color: '#2ec4b6' }, { symbol: 'PEG', name: 'PSEG', color: '#e71d36' },
  ],
  XLRE: [
    { symbol: 'AMT', name: 'Amer Tower', color: '#00d4ff' }, { symbol: 'PLD', name: 'Prologis', color: '#ff6b35' },
    { symbol: 'CCI', name: 'Crown Castle', color: '#4ecdc4' }, { symbol: 'EQIX', name: 'Equinix', color: '#ffd93d' },
    { symbol: 'PSA', name: 'Public Storage', color: '#ff006e' }, { symbol: 'O', name: 'Realty Income', color: '#8338ec' },
    { symbol: 'WY', name: 'Weyerhaeuser', color: '#06ffa5' }, { symbol: 'AVB', name: 'AvalonBay', color: '#ff9f1c' },
    { symbol: 'EQR', name: 'Equity Residential', color: '#2ec4b6' }, { symbol: 'DLR', name: 'Digital Realty', color: '#e71d36' },
  ],
  XLB: [
    { symbol: 'LIN', name: 'Linde', color: '#00d4ff' }, { symbol: 'APD', name: 'Air Products', color: '#ff6b35' },
    { symbol: 'SHW', name: 'Sherwin-Williams', color: '#4ecdc4' }, { symbol: 'ECL', name: 'Ecolab', color: '#ffd93d' },
    { symbol: 'FCX', name: 'Freeport', color: '#ff006e' }, { symbol: 'NEM', name: 'Newmont', color: '#8338ec' },
    { symbol: 'PPG', name: 'PPG', color: '#06ffa5' }, { symbol: 'NUE', name: 'Nucor', color: '#ff9f1c' },
    { symbol: 'VMC', name: 'Vulcan Materials', color: '#2ec4b6' }, { symbol: 'MLM', name: 'Martin Marietta', color: '#e71d36' },
  ],
  XLC: [
    { symbol: 'META', name: 'Meta', color: '#00d4ff' }, { symbol: 'GOOGL', name: 'Alphabet A', color: '#ff6b35' },
    { symbol: 'GOOG', name: 'Alphabet C', color: '#4ecdc4' }, { symbol: 'NFLX', name: 'Netflix', color: '#ffd93d' },
    { symbol: 'DIS', name: 'Disney', color: '#ff006e' }, { symbol: 'CMCSA', name: 'Comcast', color: '#8338ec' },
    { symbol: 'VZ', name: 'Verizon', color: '#06ffa5' }, { symbol: 'T', name: 'AT&T', color: '#ff9f1c' },
    { symbol: 'TMUS', name: 'T-Mobile', color: '#2ec4b6' }, { symbol: 'EA', name: 'EA Sports', color: '#e71d36' },
  ],
}

// Top 10 holdings per industry ETF
const INDUSTRY_HOLDINGS: Record<string, Array<{ symbol: string; name: string; color: string }>> = {
  IGV: [
    { symbol: 'MSFT', name: 'Microsoft', color: '#00d4ff' }, { symbol: 'ORCL', name: 'Oracle', color: '#ff6b35' },
    { symbol: 'CRM', name: 'Salesforce', color: '#4ecdc4' }, { symbol: 'ADBE', name: 'Adobe', color: '#ffd93d' },
    { symbol: 'NOW', name: 'ServiceNow', color: '#ff006e' }, { symbol: 'SAP', name: 'SAP', color: '#8338ec' },
    { symbol: 'SNPS', name: 'Synopsys', color: '#06ffa5' }, { symbol: 'CDNS', name: 'Cadence', color: '#ff9f1c' },
    { symbol: 'FTNT', name: 'Fortinet', color: '#2ec4b6' }, { symbol: 'WDAY', name: 'Workday', color: '#e71d36' },
  ],
  SMH: [
    { symbol: 'NVDA', name: 'NVIDIA', color: '#00d4ff' }, { symbol: 'TSM', name: 'TSMC', color: '#ff6b35' },
    { symbol: 'AVGO', name: 'Broadcom', color: '#4ecdc4' }, { symbol: 'ASML', name: 'ASML', color: '#ffd93d' },
    { symbol: 'TXN', name: 'Texas Instruments', color: '#ff006e' }, { symbol: 'QCOM', name: 'Qualcomm', color: '#8338ec' },
    { symbol: 'AMD', name: 'AMD', color: '#06ffa5' }, { symbol: 'INTC', name: 'Intel', color: '#ff9f1c' },
    { symbol: 'MU', name: 'Micron', color: '#2ec4b6' }, { symbol: 'LRCX', name: 'Lam Research', color: '#e71d36' },
  ],
  XRT: [
    { symbol: 'AMZN', name: 'Amazon', color: '#00d4ff' }, { symbol: 'HD', name: 'Home Depot', color: '#ff6b35' },
    { symbol: 'WMT', name: 'Walmart', color: '#4ecdc4' }, { symbol: 'COST', name: 'Costco', color: '#ffd93d' },
    { symbol: 'TGT', name: 'Target', color: '#ff006e' }, { symbol: 'LOW', name: "Lowe's", color: '#8338ec' },
    { symbol: 'ROST', name: 'Ross Stores', color: '#06ffa5' }, { symbol: 'TJX', name: 'TJX', color: '#ff9f1c' },
    { symbol: 'BBY', name: 'Best Buy', color: '#2ec4b6' }, { symbol: 'DG', name: 'Dollar General', color: '#e71d36' },
  ],
  KRE: [
    { symbol: 'USB', name: 'US Bancorp', color: '#00d4ff' }, { symbol: 'FITB', name: 'Fifth Third', color: '#ff6b35' },
    { symbol: 'HBAN', name: 'Huntington', color: '#4ecdc4' }, { symbol: 'RF', name: 'Regions', color: '#ffd93d' },
    { symbol: 'CFG', name: 'Citizens', color: '#ff006e' }, { symbol: 'NTRS', name: 'Northern Trust', color: '#8338ec' },
    { symbol: 'IBKR', name: 'Interactive Brokers', color: '#06ffa5' }, { symbol: 'WAL', name: 'Western Alliance', color: '#ff9f1c' },
    { symbol: 'ZION', name: 'Zions', color: '#2ec4b6' }, { symbol: 'SNV', name: 'Synovus', color: '#e71d36' },
  ],
  XBI: [
    { symbol: 'MRNA', name: 'Moderna', color: '#00d4ff' }, { symbol: 'REGN', name: 'Regeneron', color: '#ff6b35' },
    { symbol: 'VRTX', name: 'Vertex', color: '#4ecdc4' }, { symbol: 'ALNY', name: 'Alnylam', color: '#ffd93d' },
    { symbol: 'EXAS', name: 'Exact Sciences', color: '#ff006e' }, { symbol: 'BMRN', name: 'BioMarin', color: '#8338ec' },
    { symbol: 'INCY', name: 'Incyte', color: '#06ffa5' }, { symbol: 'HALO', name: 'Halozyme', color: '#ff9f1c' },
    { symbol: 'SGEN', name: 'Seagen', color: '#2ec4b6' }, { symbol: 'RARE', name: 'Ultragenyx', color: '#e71d36' },
  ],
  XHB: [
    { symbol: 'DHI', name: 'D.R. Horton', color: '#00d4ff' }, { symbol: 'LEN', name: 'Lennar', color: '#ff6b35' },
    { symbol: 'NVR', name: 'NVR', color: '#4ecdc4' }, { symbol: 'PHM', name: 'PulteGroup', color: '#ffd93d' },
    { symbol: 'TOL', name: 'Toll Brothers', color: '#ff006e' }, { symbol: 'MDC', name: 'MDC Holdings', color: '#8338ec' },
    { symbol: 'SKY', name: 'Skyline Champion', color: '#06ffa5' }, { symbol: 'MHO', name: 'M/I Homes', color: '#ff9f1c' },
    { symbol: 'CCS', name: 'Century Communities', color: '#2ec4b6' }, { symbol: 'TPH', name: 'Tri Pointe', color: '#e71d36' },
  ],
  ITB: [
    { symbol: 'DHI', name: 'D.R. Horton', color: '#00d4ff' }, { symbol: 'LEN', name: 'Lennar', color: '#ff6b35' },
    { symbol: 'NVR', name: 'NVR', color: '#4ecdc4' }, { symbol: 'PHM', name: 'PulteGroup', color: '#ffd93d' },
    { symbol: 'BLDR', name: 'Builders FirstSource', color: '#ff006e' }, { symbol: 'MAS', name: 'Masco', color: '#8338ec' },
    { symbol: 'OC', name: 'Owens Corning', color: '#06ffa5' }, { symbol: 'AWI', name: 'Armstrong World', color: '#ff9f1c' },
    { symbol: 'TREX', name: 'Trex', color: '#2ec4b6' }, { symbol: 'FBHS', name: 'Fortune Brands', color: '#e71d36' },
  ],
  XME: [
    { symbol: 'NEM', name: 'Newmont', color: '#00d4ff' }, { symbol: 'FCX', name: 'Freeport', color: '#ff6b35' },
    { symbol: 'X', name: 'US Steel', color: '#4ecdc4' }, { symbol: 'CLF', name: 'Cleveland-Cliffs', color: '#ffd93d' },
    { symbol: 'AA', name: 'Alcoa', color: '#ff006e' }, { symbol: 'VALE', name: 'Vale', color: '#8338ec' },
    { symbol: 'MP', name: 'MP Materials', color: '#06ffa5' }, { symbol: 'ATI', name: 'ATI', color: '#ff9f1c' },
    { symbol: 'CMC', name: 'Comm Metals', color: '#2ec4b6' }, { symbol: 'STLD', name: 'Steel Dynamics', color: '#e71d36' },
  ],
  IYT: [
    { symbol: 'UPS', name: 'UPS', color: '#00d4ff' }, { symbol: 'FDX', name: 'FedEx', color: '#ff6b35' },
    { symbol: 'UNP', name: 'Union Pacific', color: '#4ecdc4' }, { symbol: 'CSX', name: 'CSX', color: '#ffd93d' },
    { symbol: 'NSC', name: 'Norfolk Southern', color: '#ff006e' }, { symbol: 'JBHT', name: 'JB Hunt', color: '#8338ec' },
    { symbol: 'CHRW', name: 'CH Robinson', color: '#06ffa5' }, { symbol: 'XPO', name: 'XPO', color: '#ff9f1c' },
    { symbol: 'ODFL', name: 'Old Dominion', color: '#2ec4b6' }, { symbol: 'EXPD', name: 'Expeditors', color: '#e71d36' },
  ],
  XOP: [
    { symbol: 'XOM', name: 'ExxonMobil', color: '#00d4ff' }, { symbol: 'CVX', name: 'Chevron', color: '#ff6b35' },
    { symbol: 'COP', name: 'ConocoPhillips', color: '#4ecdc4' }, { symbol: 'EOG', name: 'EOG Resources', color: '#ffd93d' },
    { symbol: 'DVN', name: 'Devon Energy', color: '#ff006e' }, { symbol: 'MRO', name: 'Marathon Oil', color: '#8338ec' },
    { symbol: 'APA', name: 'APA Corp', color: '#06ffa5' }, { symbol: 'HES', name: 'Hess', color: '#ff9f1c' },
    { symbol: 'FANG', name: 'Diamondback', color: '#2ec4b6' }, { symbol: 'PXD', name: 'Pioneer', color: '#e71d36' },
  ],
  KIE: [
    { symbol: 'PGR', name: 'Progressive', color: '#00d4ff' }, { symbol: 'CB', name: 'Chubb', color: '#ff6b35' },
    { symbol: 'MET', name: 'MetLife', color: '#4ecdc4' }, { symbol: 'AIG', name: 'AIG', color: '#ffd93d' },
    { symbol: 'AFL', name: 'Aflac', color: '#ff006e' }, { symbol: 'TRV', name: 'Travelers', color: '#8338ec' },
    { symbol: 'ALL', name: 'Allstate', color: '#06ffa5' }, { symbol: 'PRU', name: 'Prudential', color: '#ff9f1c' },
    { symbol: 'HIG', name: 'Hartford', color: '#2ec4b6' }, { symbol: 'GL', name: 'Globe Life', color: '#e71d36' },
  ],
}

// Quick-select groups
const MAG7 = [
  { symbol: 'AAPL', name: 'Apple', color: '#00d4ff' },
  { symbol: 'MSFT', name: 'Microsoft', color: '#ff6b35' },
  { symbol: 'GOOGL', name: 'Alphabet', color: '#4ecdc4' },
  { symbol: 'AMZN', name: 'Amazon', color: '#ffd93d' },
  { symbol: 'NVDA', name: 'NVIDIA', color: '#ff006e' },
  { symbol: 'META', name: 'Meta', color: '#8338ec' },
  { symbol: 'TSLA', name: 'Tesla', color: '#06ffa5' },
]

const INDICES = [
  { symbol: 'SPY', name: 'S&P 500', color: '#00d4ff' },
  { symbol: 'QQQ', name: 'Nasdaq 100', color: '#ff6b35' },
  { symbol: 'IWM', name: 'Russell 2000', color: '#4ecdc4' },
  { symbol: 'DIA', name: 'Dow Jones', color: '#ffd93d' },
]

const INTERNATIONAL = [
  { symbol: 'EFA', name: 'Developed Mkts', color: '#00d4ff' },
  { symbol: 'EEM', name: 'Emerging Mkts', color: '#ff6b35' },
  { symbol: 'VEU', name: 'All-World ex-US', color: '#4ecdc4' },
  { symbol: 'IEFA', name: 'Core Intl', color: '#ffd93d' },
  { symbol: 'EWJ', name: 'Japan', color: '#ff006e' },
  { symbol: 'FXI', name: 'China Large Cap', color: '#8338ec' },
  { symbol: 'EWZ', name: 'Brazil', color: '#06ffa5' },
  { symbol: 'MCHI', name: 'MSCI China', color: '#ff9f1c' },
  { symbol: 'VWO', name: 'EM Vanguard', color: '#2ec4b6' },
  { symbol: 'VXUS', name: 'Total Intl', color: '#e71d36' },
]

// Detect significant swing highs (TOPs) and lows (BOTTOMs) from price/return data.
// A swing is confirmed when price reverses by >= minMovePct OR the trend lasted >= minDays calendar days.
function detectSwings(
  prices: number[],
  timestamps: number[],
  minMovePct = 0.04,
  minDays = 10
): Array<{ type: 'TOP' | 'BOTTOM'; date: string; pct: number }> {
  const result: Array<{ type: 'TOP' | 'BOTTOM'; date: string; pct: number }> = []
  if (prices.length < 20) return result

  type Dir = 'UP' | 'DOWN'
  let direction: Dir | null = null
  let extremumIdx = 0
  let extremumPrice = prices[0]

  for (let i = 1; i < prices.length; i++) {
    const p = prices[i]
    const denom = Math.abs(extremumPrice) || 1
    const change = (p - extremumPrice) / denom
    const days = (timestamps[i] - timestamps[extremumIdx]) / 86_400_000

    if (direction === null) {
      if (Math.abs(change) >= minMovePct || days >= minDays) {
        direction = change > 0 ? 'UP' : 'DOWN'
        extremumPrice = p
        extremumIdx = i
      }
    } else if (direction === 'UP') {
      if (p >= extremumPrice) {
        extremumPrice = p
        extremumIdx = i
      } else {
        const reversal = (extremumPrice - p) / (Math.abs(extremumPrice) || 1)
        const revDays = (timestamps[i] - timestamps[extremumIdx]) / 86_400_000
        if (reversal >= minMovePct || revDays >= minDays) {
          result.push({ type: 'TOP', date: new Date(timestamps[extremumIdx]).toISOString().split('T')[0], pct: extremumPrice })
          direction = 'DOWN'
          extremumPrice = p
          extremumIdx = i
        }
      }
    } else {
      if (p <= extremumPrice) {
        extremumPrice = p
        extremumIdx = i
      } else {
        const reversal = (p - extremumPrice) / (Math.abs(extremumPrice) || 1)
        const revDays = (timestamps[i] - timestamps[extremumIdx]) / 86_400_000
        if (reversal >= minMovePct || revDays >= minDays) {
          result.push({ type: 'BOTTOM', date: new Date(timestamps[extremumIdx]).toISOString().split('T')[0], pct: extremumPrice })
          direction = 'UP'
          extremumPrice = p
          extremumIdx = i
        }
      }
    }
  }
  return result
}

// Color palette for custom/dynamic tickers
const DYNAMIC_COLORS = [
  '#00d4ff', '#ff6b35', '#4ecdc4', '#ffd93d', '#ff006e', '#8338ec', '#06ffa5', '#ff9f1c',
  '#2ec4b6', '#e71d36', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899',
  '#14b8a6', '#f97316', '#8b5cf6', '#22c55e', '#facc15', '#38bdf8', '#fb7185', '#a3e635',
]

type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | '10Y' | '20Y' | 'YTD'

interface DataPoint {
  timestamp: number
  value: number
}

interface SeriesData {
  symbol: string
  name: string
  color: string
  data: DataPoint[]
  performance: number
}

interface PerformanceDashboardProps {
  isVisible?: boolean
}

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({ isVisible = true }) => {
  // State with localStorage persistence
  const [timeframe, setTimeframe] = useState<Timeframe>('1W')
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(() =>
    SECTORS.map((s) => s.symbol)
  )
  const [seriesData, setSeriesData] = useState<SeriesData[]>([])
  const [loading, setLoading] = useState(false)

  // Wave mode state
  const [isWaveMode, setIsWaveMode] = useState(false)
  const [waveData, setWaveData] = useState<SeriesData[]>([])

  // Benchmark mode state
  const [isBenchmarkMode, setIsBenchmarkMode] = useState(false)
  const [benchmarkTicker, setBenchmarkTicker] = useState('SPY')
  const [benchmarkInput, setBenchmarkInput] = useState('SPY')

  // UI State
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null)
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null)
  const [expandedHoldings, setExpandedHoldings] = useState<string | null>(null)

  // Legend & date range state
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())
  const [showLegend, setShowLegend] = useState(true)
  const [useCustomDates, setUseCustomDates] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [tickerInput, setTickerInput] = useState('')
  const [dynamicSymbolMeta, setDynamicSymbolMeta] = useState<Record<string, { symbol: string; name: string; color: string }>>({})
  const [customDynColorIdx, setCustomDynColorIdx] = useState(0)

  // Dynamic swing-date presets  computed from live seriesData
  const dynamicSwingDates = useMemo(() => {
    // Use SPY as reference instrument; fall back to first loaded series
    const ref = seriesData.find((s) => s.symbol === 'SPY') || seriesData[0]
    const swings =
      ref && ref.data.length >= 20
        ? detectSwings(
          ref.data.map((d) => d.value),
          ref.data.map((d) => d.timestamp),
          0.04, // 4% minimum reversal
          10    // or 10 calendar days
        )
        : []

    const tops = swings.filter((s) => s.type === 'TOP')
    const bottoms = swings.filter((s) => s.type === 'BOTTOM')

    const entries: Array<{ label: string; date: string; description: string }> = []

    // Up to 2 most-recent tops (oldest first so PREV TOP appears left of LAST TOP)
    tops.slice(-2).forEach((t, i, arr) => {
      entries.push({
        label: i === arr.length - 1 ? 'LAST TOP' : 'PREV TOP',
        date: t.date,
        description: `Market Top ${t.date}`,
      })
    })

    // Up to 2 most-recent bottoms
    bottoms.slice(-2).forEach((b, i, arr) => {
      entries.push({
        label: i === arr.length - 1 ? 'LAST BTM' : 'PREV BTM',
        date: b.date,
        description: `Market Bottom ${b.date}`,
      })
    })

    return entries
  }, [seriesData])

  // Chart State
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [zoomRange, setZoomRange] = useState({ start: 0, end: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, rangeStart: 0, rangeEnd: 1 })
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null)

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({})
  const lastFetchKeyRef = useRef<string>('') // Track last fetch to prevent duplicates
  const labelPositionsRef = useRef<
    Array<{ symbol: string; x: number; y: number; width: number; height: number }>
  >([])

  // Utility: Check if all symbols in category are selected
  const isAllSelected = (category: typeof SECTORS) => {
    return category.every((item) => selectedSymbols.includes(item.symbol))
  }

  // Utility: Toggle all symbols in a category
  const toggleCategory = (category: typeof SECTORS) => {
    const categorySymbols = category.map((item) => item.symbol)
    const allSelected = isAllSelected(category)

    if (allSelected) {
      // Deselect all from this category
      setSelectedSymbols((prev) => prev.filter((s) => !categorySymbols.includes(s)))
    } else {
      // Select all from this category
      setSelectedSymbols((prev) => {
        const newSet = new Set([...prev, ...categorySymbols])
        return Array.from(newSet)
      })
    }
  }

  // Utility: Toggle individual symbol
  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    )
  }

  // Fetch data from API
  // Ticker search handler
  const handleTickerSearch = useCallback(() => {
    if (!tickerInput.trim()) return
    const tickers = tickerInput.split(',')
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length > 0 && /^[A-Z.]{1,10}$/.test(t))
    if (tickers.length === 0) return
    setDynamicSymbolMeta(prev => {
      const newMeta = { ...prev }
      let idx = customDynColorIdx
      tickers.forEach(sym => {
        if (!newMeta[sym]) {
          newMeta[sym] = { symbol: sym, name: sym, color: DYNAMIC_COLORS[idx % DYNAMIC_COLORS.length] }
          idx++
        }
      })
      setCustomDynColorIdx(idx)
      return newMeta
    })
    setSelectedSymbols(prev => Array.from(new Set([...prev, ...tickers])))
    setTickerInput('')
  }, [tickerInput, customDynColorIdx])

  const fetchData = useCallback(async () => {
    // Create unique key for this fetch to prevent duplicates
    const fetchKey = `${timeframe}-${useCustomDates ? dateFrom + dateTo : ''}-${[...selectedSymbols].sort().join(',')}-bm:${isBenchmarkMode ? benchmarkTicker.toUpperCase().trim() : ''}`
    if (lastFetchKeyRef.current === fetchKey) {
      return
    }
    lastFetchKeyRef.current = fetchKey

    // In wave mode, we need to fetch all wave constituent symbols
    let symbolsToFetch = selectedSymbols
    if (isWaveMode) {
      const allWaveSymbols = new Set<string>()
      Object.values(WAVE_GROUPS).forEach((group) => {
        group.tickers.forEach((ticker) => allWaveSymbols.add(ticker))
      })
      symbolsToFetch = Array.from(allWaveSymbols)
    }

    // Add benchmark ticker if benchmark mode is active
    if (isBenchmarkMode && benchmarkTicker.trim()) {
      const bTicker = benchmarkTicker.toUpperCase().trim()
      if (!symbolsToFetch.includes(bTicker)) {
        symbolsToFetch = [...symbolsToFetch, bTicker]
      }
    }

    if (symbolsToFetch.length === 0) {
      setSeriesData([])
      return
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setLoading(true)

    try {
      // Map timeframe to API format and calculate date range
      const timeframeMap: Record<Timeframe, string> = {
        '1D': '5m',
        '1W': '1h',
        '1M': '1d',
        '3M': '1d',
        '6M': '1d',
        '1Y': '1d',
        '2Y': '1d',
        '5Y': '1d',
        '10Y': '1d',
        '20Y': '1d',
        YTD: '1d',
      }

      const apiTimeframe = timeframeMap[timeframe]

      // Calculate start and end dates
      const now = new Date()
      let endDate: string
      let startDate: string

      if (useCustomDates && dateFrom) {
        startDate = dateFrom
        endDate = dateTo || now.toISOString().split('T')[0]
      } else if (timeframe === 'YTD') {
        startDate = `${now.getFullYear()}-01-01`
        endDate = now.toISOString().split('T')[0]
      } else {
        endDate = now.toISOString().split('T')[0]
        const daysBack: Record<Timeframe, number> = {
          '1D': 5, '1W': 10, '1M': 35, '3M': 95, '6M': 185,
          '1Y': 370, '2Y': 735, '5Y': 1830, '10Y': 3655, '20Y': 7305, YTD: 365,
        }
        const days = daysBack[timeframe]
        startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }

      // Batch symbols (max 10 per request)
      const chunks: string[][] = []
      for (let i = 0; i < symbolsToFetch.length; i += 10) {
        chunks.push(symbolsToFetch.slice(i, i + 10))
      }

      // Fetch all chunks with custom date range
      const responses = await Promise.all(
        chunks.map((chunk) =>
          fetch('/api/bulk-chart-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbols: chunk,
              timeframe: apiTimeframe,
              startDate,
              endDate,
              optimized: false, // Use custom date range
            }),
            signal: abortControllerRef.current!.signal,
          })
        )
      )

      // Parse responses
      const allData: Record<string, any[]> = {}
      for (const response of responses) {
        if (response.ok) {
          const json = await response.json()
          if (json.success && json.data) {
            Object.assign(allData, json.data)
          }
        }
      }

      // Get metadata for symbols (all known groups + dynamic)
      const allHoldings = Object.values(SECTOR_HOLDINGS).flat().concat(Object.values(INDUSTRY_HOLDINGS).flat())
      const allSymbols = [...SECTORS, ...INDUSTRIES, ...SPECIAL, ...MAG7, ...INDICES, ...INTERNATIONAL, ...allHoldings, ...Object.values(dynamicSymbolMeta)]

      // First pass: filter and collect all data
      const symbolDataMap: Record<string, any[]> = {}
      const allTimestamps = new Set<number>()

      symbolsToFetch.forEach((symbol) => {
        const rawData = allData[symbol]
        if (rawData && rawData.length > 0) {
          // For 1D, show most recent day with extended hours filtering
          let filteredData = rawData
          if (timeframe === '1D') {
            // Find the most recent date in the dataset
            const mostRecentTimestamp = Math.max(...rawData.map((p) => p.timestamp))
            const mostRecentDate = new Date(mostRecentTimestamp)

            const formatter = new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/Los_Angeles',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: 'numeric',
              minute: 'numeric',
              hour12: false,
            })

            const recentParts = formatter.formatToParts(mostRecentDate)
            const targetYear = recentParts.find((p) => p.type === 'year')?.value
            const targetMonth = recentParts.find((p) => p.type === 'month')?.value
            const targetDay = recentParts.find((p) => p.type === 'day')?.value

            filteredData = rawData.filter((point) => {
              const pointDate = new Date(point.timestamp)
              const parts = formatter.formatToParts(pointDate)

              const year = parts.find((p) => p.type === 'year')?.value
              const month = parts.find((p) => p.type === 'month')?.value
              const day = parts.find((p) => p.type === 'day')?.value

              // Check if this point is from the most recent day
              if (year === targetYear && month === targetMonth && day === targetDay) {
                // Also check if it's within extended hours (4 AM - 8 PM ET)
                const hours = parseInt(parts.find((p) => p.type === 'hour')?.value || '0')
                const minutes = parseInt(parts.find((p) => p.type === 'minute')?.value || '0')
                const timeInMinutes = hours * 60 + minutes
                return timeInMinutes >= 240 && timeInMinutes <= 1200
              }
              return false
            })
          }

          if (filteredData.length > 0) {
            symbolDataMap[symbol] = filteredData
            // Collect all unique timestamps
            filteredData.forEach((point) => allTimestamps.add(point.timestamp))
          } else {
            console.warn(`No data after filtering for ${symbol}`)
          }
        } else {
          console.warn(`No data received for ${symbol}`)
        }
      })

      // Sort timestamps to create common timeline
      const commonTimestamps = Array.from(allTimestamps).sort((a, b) => a - b)

      if (commonTimestamps.length === 0) {
        console.error('No common timestamps found across symbols')
        setSeriesData([])
        return
      }

      // Process data into series with interpolation
      const series: SeriesData[] = symbolsToFetch
        .map((symbol) => {
          let metadata = allSymbols.find((s) => s.symbol === symbol)
          if (!metadata) {
            // fallback for any symbol not in known lists
            metadata = { symbol, name: symbol, color: DYNAMIC_COLORS[selectedSymbols.indexOf(symbol) % DYNAMIC_COLORS.length] }
          }
          const symbolData = symbolDataMap[symbol]

          if (!symbolData || symbolData.length === 0) {
            return null
          }

          // Create a map for quick lookup
          const dataMap = new Map(symbolData.map((point) => [point.timestamp, point.close]))

          // Build aligned data using common timestamps with forward-fill for missing values
          let lastKnownPrice = symbolData[0].close
          const alignedData: Array<{ timestamp: number; close: number }> = []

          for (const timestamp of commonTimestamps) {
            const price = dataMap.get(timestamp)
            if (price !== undefined) {
              lastKnownPrice = price
              alignedData.push({ timestamp, close: price })
            } else {
              // Forward-fill missing data
              alignedData.push({ timestamp, close: lastKnownPrice })
            }
          }

          if (alignedData.length === 0) {
            console.warn(`No aligned data for ${symbol}`)
            return null
          }

          // Calculate performance from first to last
          const firstPrice = alignedData[0].close
          const dataPoints: DataPoint[] = alignedData.map((point) => ({
            timestamp: point.timestamp,
            value: ((point.close - firstPrice) / firstPrice) * 100,
          }))

          const performance = dataPoints[dataPoints.length - 1]?.value || 0

          return {
            symbol: metadata.symbol,
            name: metadata.name,
            color: metadata.color,
            data: dataPoints,
            performance,
          }
        })
        .filter((s): s is SeriesData => s !== null)

      // Apply benchmark rebasing if benchmark mode is active
      if (isBenchmarkMode && benchmarkTicker.trim()) {
        const bTicker = benchmarkTicker.toUpperCase().trim()
        const benchmarkRawData = symbolDataMap[bTicker]
        if (benchmarkRawData && benchmarkRawData.length > 0) {
          const firstBenchPrice = benchmarkRawData[0].close
          const benchDataMap = new Map(benchmarkRawData.map((p) => [p.timestamp, p.close]))
          let lastBenchPrice = firstBenchPrice
          const benchValues = commonTimestamps.map((ts) => {
            const price = benchDataMap.get(ts)
            if (price !== undefined) lastBenchPrice = price
            return ((lastBenchPrice - firstBenchPrice) / firstBenchPrice) * 100
          })
          const rebasedSeries = series.map((s) => ({
            ...s,
            data: s.data.map((point, idx) => ({
              timestamp: point.timestamp,
              value: point.value - (benchValues[idx] ?? 0),
            })),
            performance: s.performance - (benchValues[benchValues.length - 1] ?? 0),
          }))
          setSeriesData(rebasedSeries)
          setZoomRange({ start: 0, end: 1 })
          return
        }
      }

      setSeriesData(series)
      setZoomRange({ start: 0, end: 1 })
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Performance Dashboard fetch error:', error)
        // Keep existing data on error to prevent chart from disappearing
      }
    } finally {
      setLoading(false)
    }
  }, [selectedSymbols, timeframe, isWaveMode, useCustomDates, dateFrom, dateTo, dynamicSymbolMeta, isBenchmarkMode, benchmarkTicker])

  // Save timeframe to localStorage
  // Load persisted state from localStorage after mount (avoids SSR/CSR hydration mismatch)
  useEffect(() => {
    const savedTimeframe = localStorage.getItem('performanceDashboard_timeframe')
    if (savedTimeframe) setTimeframe(savedTimeframe as Timeframe)

    const savedSymbols = localStorage.getItem('performanceDashboard_selectedSymbols_v2')
    if (savedSymbols) {
      try {
        setSelectedSymbols(JSON.parse(savedSymbols))
      } catch {
        // ignore malformed data
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('performanceDashboard_timeframe', timeframe)
  }, [timeframe])

  // Save selectedSymbols to localStorage
  useEffect(() => {
    localStorage.setItem('performanceDashboard_selectedSymbols_v2', JSON.stringify(selectedSymbols))
  }, [selectedSymbols])

  // Fetch data when symbols or timeframe or wave mode change
  useEffect(() => {
    if (isVisible && (selectedSymbols.length > 0 || isWaveMode)) {
      fetchData()
    } else if (selectedSymbols.length === 0 && !isWaveMode) {
      // Clear data when no symbols selected
      setSeriesData([])
      lastFetchKeyRef.current = '' // Reset fetch key
    }
  }, [isVisible, fetchData, selectedSymbols.length])

  // Calculate wave data when in wave mode
  useEffect(() => {
    if (!isWaveMode || seriesData.length === 0) {
      setWaveData([])
      return
    }

    // Calculate aggregate performance for each wave group
    const waves: SeriesData[] = []

    Object.entries(WAVE_GROUPS).forEach(([groupKey, group]) => {
      // Find all series that belong to this group
      const groupSeries = seriesData.filter((s) => group.tickers.includes(s.symbol))

      if (groupSeries.length === 0) return

      // Calculate average performance across all data points
      // First, find common data length (minimum across group)
      const minLength = Math.min(...groupSeries.map((s) => s.data.length))
      if (minLength === 0) return

      // Calculate average value at each timestamp
      const avgData: DataPoint[] = []
      for (let i = 0; i < minLength; i++) {
        const timestamp = groupSeries[0].data[i].timestamp
        const avgValue =
          groupSeries.reduce((sum, s) => sum + s.data[i].value, 0) / groupSeries.length
        avgData.push({ timestamp, value: avgValue })
      }

      const avgPerformance = avgData[avgData.length - 1]?.value || 0

      waves.push({
        symbol: group.name.toUpperCase(),
        name: group.name,
        color: group.color,
        data: avgData,
        performance: avgPerformance,
      })
    })

    setWaveData(waves)
  }, [isWaveMode, seriesData])

  // Measure container dimensions
  useEffect(() => {
    if (!containerRef.current) return

    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          setDimensions({ width: rect.width, height: rect.height })
        }
      }
    }

    updateDimensions()
    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [])

  // Draw chart
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')

    if (
      !canvas ||
      !ctx ||
      dimensions.width === 0 ||
      dimensions.height === 0 ||
      seriesData.length === 0
    ) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    canvas.width = dimensions.width * dpr
    canvas.height = dimensions.height * dpr
    canvas.style.width = `${dimensions.width}px`
    canvas.style.height = `${dimensions.height}px`
    ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transform
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)

    const isSmall = dimensions.width < 450
    const margin = { top: isSmall ? 30 : 50, right: isSmall ? 110 : 140, bottom: isSmall ? 35 : 60, left: isSmall ? 42 : 70 }
    const chartWidth = dimensions.width - margin.left - margin.right
    const chartHeight = dimensions.height - margin.top - margin.bottom

    if (chartWidth <= 0 || chartHeight <= 0) return

    // Calculate visible data range - use waveData in wave mode (skip hidden series)
    const activeData = isWaveMode ? waveData : seriesData.filter(s => !hiddenSeries.has(s.symbol))
    const maxDataPoints = Math.max(...(activeData.length ? activeData : seriesData).map((s) => s.data.length))
    const startIdx = Math.floor(zoomRange.start * maxDataPoints)
    const endIdx = Math.ceil(zoomRange.end * maxDataPoints)

    // Find min/max values in visible range
    let minVal = Infinity
    let maxVal = -Infinity

    // Use waveData if in wave mode, otherwise use visible (non-hidden) series
    const dataForRange = activeData

    dataForRange.forEach((series) => {
      const start = Math.min(startIdx, series.data.length - 1)
      const end = Math.min(endIdx, series.data.length)

      for (let i = start; i < end; i++) {
        const val = series.data[i]?.value
        if (val !== undefined) {
          minVal = Math.min(minVal, val)
          maxVal = Math.max(maxVal, val)
        }
      }
    })

    if (!isFinite(minVal) || !isFinite(maxVal)) return

    const padding = (maxVal - minVal) * 0.1
    minVal -= padding
    maxVal += padding
    const valueRange = maxVal - minVal || 1

    // Scales
    const xScale = (dataIdx: number, totalPoints: number) => {
      const normalized = (dataIdx - startIdx) / (endIdx - startIdx)
      return margin.left + normalized * chartWidth
    }

    const yScale = (value: number) => {
      const normalized = (value - minVal) / valueRange
      return margin.top + chartHeight - normalized * chartHeight
    }

    // Y-axis labels - enhanced with 20% bigger font
    ctx.font = isSmall ? 'bold 11px monospace' : 'bold 18px monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.imageSmoothingEnabled = false // Crispy rendering

    for (let i = 0; i <= 10; i++) {
      const value = minVal + (valueRange * (10 - i)) / 10
      const y = margin.top + (chartHeight * i) / 10

      // Color based on positive/negative
      if (value > 0) {
        ctx.fillStyle = '#00ff00' // Crispy green for positive
      } else if (value < 0) {
        ctx.fillStyle = '#ff0000' // Crispy red for negative
      } else {
        ctx.fillStyle = '#888888' // Gray for zero
      }

      ctx.fillText(`${Math.abs(value).toFixed(1)}%`, margin.left - 10, y)
    }

    ctx.imageSmoothingEnabled = true // Reset

    // Draw L-shaped axis lines to separate axes
    ctx.strokeStyle = '#cc4400' // Dark navy orange
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.beginPath()
    // Vertical line (Y-axis left)
    ctx.moveTo(margin.left, margin.top)
    ctx.lineTo(margin.left, margin.top + chartHeight)
    // Horizontal line (X-axis)
    ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight)
    ctx.stroke()

    // Right Y-axis vertical line
    ctx.strokeStyle = '#cc4400'
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(margin.left + chartWidth, margin.top)
    ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight)
    ctx.stroke()

    // Zero line with dashes
    if (minVal < 0 && maxVal > 0) {
      const zeroY = yScale(0)
      ctx.strokeStyle = '#666666'
      ctx.lineWidth = 2
      ctx.setLineDash([10, 5]) // Dashed line
      ctx.beginPath()
      ctx.moveTo(margin.left, zeroY)
      ctx.lineTo(margin.left + chartWidth, zeroY)
      ctx.stroke()
      ctx.setLineDash([]) // Reset to solid line
    }

    // Draw pre-market and after-hours shading for intraday timeframes
    if (timeframe === '1D' || timeframe === '1W') {
      ctx.globalAlpha = 0.15

      // Shade entire visible area first, then we'll overlay with correct periods
      for (let i = startIdx; i < endIdx; i++) {
        if (seriesData[0]?.data[i]) {
          const timestamp = seriesData[0].data[i].timestamp
          const date = new Date(timestamp)

          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Los_Angeles',
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
          })
          const parts = formatter.formatToParts(date)
          const hours = parseInt(parts.find((p) => p.type === 'hour')?.value || '0')
          const minutes = parseInt(parts.find((p) => p.type === 'minute')?.value || '0')
          const timeInMinutes = hours * 60 + minutes

          const x = xScale(i, maxDataPoints)
          const nextX =
            i < endIdx - 1 ? xScale(i + 1, maxDataPoints) : x + (x - xScale(i - 1, maxDataPoints))
          const width = nextX - x

          // Determine color based on time
          let color: string
          if (timeInMinutes >= 240 && timeInMinutes < 570) {
            // Pre-market: 4:00 AM - 9:30 AM
            color = 'rgba(255, 140, 0, 1)'
          } else if (timeInMinutes >= 960 && timeInMinutes <= 1200) {
            // After-hours: 4:00 PM - 8:00 PM
            color = 'rgba(30, 58, 138, 1)'
          } else if (timeInMinutes > 1200 || timeInMinutes < 240) {
            // Overnight: after 8 PM or before 4 AM
            color = 'rgba(20, 20, 40, 1)'
          } else {
            // Market hours: 9:30 AM - 4:00 PM (no shading)
            continue
          }

          ctx.fillStyle = color
          ctx.fillRect(x, margin.top, width, chartHeight)
        }
      }

      ctx.globalAlpha = 1
    }

    // Draw lines and collect end positions
    const labelPositions: Array<{
      symbol: string
      color: string
      performance: number
      x: number
      y: number
      isHovered: boolean
    }> = []

    // Choose which data to render: waves or regular series (filtered by hiddenSeries)
    const dataToRender = isWaveMode ? waveData : seriesData.filter(s => !hiddenSeries.has(s.symbol))

    // Helper function to calculate activity status at each point in time
    const calculateActivityMap = (waveSeries: SeriesData): boolean[] => {
      if (!isWaveMode) return []

      // Find the wave group
      const waveGroup = Object.values(WAVE_GROUPS).find((g) => g.name === waveSeries.name)
      if (!waveGroup) return []

      // Get all individual series for this wave
      const constituents = seriesData.filter((s) => waveGroup.tickers.includes(s.symbol))
      if (constituents.length < 2) return []

      const activityMap: boolean[] = []
      const windowSize = Math.max(5, Math.floor(waveSeries.data.length * 0.05)) // 5% window or minimum 5 points

      // Calculate activity for each point using a rolling window
      for (let i = 0; i < waveSeries.data.length; i++) {
        const windowStart = Math.max(0, i - windowSize)
        const windowEnd = Math.min(waveSeries.data.length, i + 1)

        // Calculate direction vectors for each constituent in this window
        const vectors = constituents
          .map((series) => {
            if (series.data.length < windowEnd) return null

            const startVal = series.data[windowStart]?.value
            const endVal = series.data[i]?.value
            if (startVal === undefined || endVal === undefined) return null

            return endVal - startVal
          })
          .filter((v): v is number => v !== null)

        if (vectors.length < 2) {
          activityMap.push(false)
          continue
        }

        // Check if vectors are aligned (same direction and similar magnitude)
        const avgVector = vectors.reduce((sum, v) => sum + v, 0) / vectors.length

        // Calculate alignment score
        const alignmentScores = vectors.map((v) => {
          if (avgVector === 0) return 0
          const ratio = v / avgVector
          return Math.abs(ratio) > 0.5 ? Math.min(1, Math.abs(ratio)) : 0
        })

        const avgAlignment = alignmentScores.reduce((sum, s) => sum + s, 0) / alignmentScores.length

        // Active if average alignment > 0.7 (70% aligned)
        activityMap.push(avgAlignment > 0.7)
      }

      return activityMap
    }

    dataToRender.forEach((series) => {
      const isHovered = hoveredSeries === series.symbol

      ctx.strokeStyle = series.color
      ctx.lineWidth = isHovered ? 4 : isWaveMode ? 3 : 2
      ctx.globalAlpha = isHovered ? 1 : 0.85
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      const visibleData = series.data.slice(
        Math.max(0, startIdx),
        Math.min(series.data.length, endIdx)
      )

      let lastX = 0
      let lastY = 0

      // For wave mode, calculate activity at each point
      if (isWaveMode) {
        const activityMap = calculateActivityMap(series)

        // Draw line in segments based on activity
        let currentSegmentActive: boolean | null = null
        let segmentPath: Array<{ x: number; y: number }> = []

        visibleData.forEach((point, idx) => {
          const actualIdx = startIdx + idx
          const x = xScale(actualIdx, maxDataPoints)
          const y = yScale(point.value)

          const isActive = activityMap[actualIdx] ?? false

          // If activity state changed, draw previous segment and start new one
          if (currentSegmentActive !== null && currentSegmentActive !== isActive) {
            // Draw previous segment if exists
            if (segmentPath.length > 1) {
              ctx.setLineDash(currentSegmentActive ? [] : [10, 5])
              ctx.beginPath()
              ctx.moveTo(segmentPath[0].x, segmentPath[0].y)
              for (let i = 1; i < segmentPath.length; i++) {
                ctx.lineTo(segmentPath[i].x, segmentPath[i].y)
              }
              ctx.stroke()
            }

            // Start new segment with LAST point from previous segment to connect smoothly
            segmentPath =
              segmentPath.length > 0 ? [segmentPath[segmentPath.length - 1], { x, y }] : [{ x, y }]
            currentSegmentActive = isActive
          } else {
            // Continue current segment or start first segment
            segmentPath.push({ x, y })
            if (currentSegmentActive === null) {
              currentSegmentActive = isActive
            }
          }

          lastX = x
          lastY = y
        })

        // Draw final segment
        if (segmentPath.length > 1) {
          ctx.setLineDash(currentSegmentActive ? [] : [10, 5])
          ctx.beginPath()
          ctx.moveTo(segmentPath[0].x, segmentPath[0].y)
          for (let i = 1; i < segmentPath.length; i++) {
            ctx.lineTo(segmentPath[i].x, segmentPath[i].y)
          }
          // Extend to right edge to close the gap
          ctx.lineTo(margin.left + chartWidth, lastY)
          ctx.stroke()
        }

        // Reset dash
        ctx.setLineDash([])
      } else {
        // Regular mode: draw entire line as solid
        ctx.setLineDash([])
        ctx.beginPath()
        let started = false

        visibleData.forEach((point, idx) => {
          const actualIdx = startIdx + idx
          const x = xScale(actualIdx, maxDataPoints)
          const y = yScale(point.value)

          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else {
            ctx.lineTo(x, y)
          }

          lastX = x
          lastY = y
        })

        // Extend to right edge to close the gap
        if (lastX < margin.left + chartWidth) ctx.lineTo(margin.left + chartWidth, lastY)
        ctx.stroke()
      }

      // Store end position for label
      if (visibleData.length > 0) {
        labelPositions.push({
          symbol: series.symbol,
          color: series.color,
          performance: series.performance,
          x: lastX,
          y: lastY,
          isHovered,
        })
      }
    })

    ctx.globalAlpha = 1

    // Adjust label positions to prevent overlap
    const labelHeight = 16
    const minSpacing = 20
    labelPositions.sort((a, b) => a.y - b.y)
    for (let i = 1; i < labelPositions.length; i++) {
      const current = labelPositions[i]
      const previous = labelPositions[i - 1]
      if (current.y - previous.y < minSpacing) current.y = previous.y + minSpacing
    }

    const storedLabelPositions: Array<{ symbol: string; x: number; y: number; width: number; height: number }> = []

    // Always draw canvas labels for visible series
    {
      const labelFont = isSmall ? 'bold 20px monospace' : 'bold 23px monospace'
      const labelFontHovered = isSmall ? 'bold 21px monospace' : 'bold 25px monospace'
      labelPositions.forEach((label) => {
        const rightEdgeX = margin.left + chartWidth

        // Draw thin connector tick
        ctx.strokeStyle = label.color
        ctx.globalAlpha = 0.4
        ctx.lineWidth = 1
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(rightEdgeX, label.y)
        ctx.lineTo(rightEdgeX + 6, label.y)
        ctx.stroke()
        ctx.globalAlpha = 1

        // Dot at right edge
        ctx.fillStyle = label.color
        ctx.beginPath()
        ctx.arc(rightEdgeX, label.y, 3, 0, Math.PI * 2)
        ctx.fill()

        // Symbol label with dark outline
        ctx.font = label.isHovered ? labelFontHovered : labelFont
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.imageSmoothingEnabled = false
        ctx.shadowColor = 'rgba(0,0,0,0.95)'
        ctx.shadowBlur = 4
        ctx.fillStyle = label.color
        ctx.fillText(label.symbol, rightEdgeX + 8, label.y)

        // Perf % label with dark outline
        const perfColor = label.performance >= 0 ? '#00ff00' : '#ff0000'
        ctx.fillStyle = perfColor
        ctx.font = label.isHovered ? labelFontHovered : labelFont
        const perfText = isSmall ? `${label.performance.toFixed(1)}%` : `${label.performance.toFixed(2)}%`
        const symbolWidth = ctx.measureText(label.symbol).width
        const perfWidth = ctx.measureText(perfText).width
        ctx.fillText(perfText, rightEdgeX + 12 + symbolWidth, label.y)
        ctx.shadowBlur = 0
        ctx.imageSmoothingEnabled = true

        const totalWidth = symbolWidth + perfWidth + 20
        storedLabelPositions.push({ symbol: label.symbol, x: rightEdgeX + 8, y: label.y - 10, width: totalWidth, height: 20 })
      })
    }

    // Store in ref for mouse handler
    labelPositionsRef.current = storedLabelPositions

    // X-axis labels
    ctx.fillStyle = '#ffffff'
    ctx.font = isSmall ? 'bold 11px monospace' : 'bold 22px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    const numXLabels = isSmall ? 4 : 7
    const visiblePoints = endIdx - startIdx
    const rightEdgeForXLabel = margin.left + chartWidth

    // For weekly view, find indices where market opens (6:30 AM PST) to mark day boundaries
    const dayBoundaries: number[] = []
    if (timeframe === '1W') {
      let lastDate = ''
      for (let i = startIdx; i < endIdx; i++) {
        if (seriesData[0]?.data[i]) {
          const timestamp = seriesData[0].data[i].timestamp
          const date = new Date(timestamp)

          const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
          })
          const parts = formatter.formatToParts(date)
          const dateStr = `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`
          const hours = parseInt(parts.find((p) => p.type === 'hour')?.value || '0')
          const minutes = parseInt(parts.find((p) => p.type === 'minute')?.value || '0')
          const timeInMinutes = hours * 60 + minutes

          // Mark first point at or after 9:30 AM each day
          if (dateStr !== lastDate && timeInMinutes >= 570) {
            dayBoundaries.push(i)
            lastDate = dateStr
          }
        }
      }
    }

    for (let i = 0; i <= numXLabels; i++) {
      let dataIdx = startIdx + Math.floor((visiblePoints * i) / numXLabels)

      // For weekly view, snap to day boundaries (9:30 AM)
      if (timeframe === '1W' && dayBoundaries.length > 0) {
        const targetIdx = startIdx + Math.floor((visiblePoints * i) / numXLabels)
        // Find closest day boundary
        const closestBoundary = dayBoundaries.reduce((prev, curr) =>
          Math.abs(curr - targetIdx) < Math.abs(prev - targetIdx) ? curr : prev
        )
        dataIdx = closestBoundary
      }

      if (seriesData[0]?.data[dataIdx]) {
        const x = xScale(dataIdx, maxDataPoints)
        // Skip if too close to right edge (final date drawn separately)
        if (x > rightEdgeForXLabel - 60) continue
        const timestamp = seriesData[0].data[dataIdx].timestamp
        const date = new Date(timestamp)

        let label = ''

        if (timeframe === '1D') {
          // Show time with AM/PM for intraday in PST
          label = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Los_Angeles',
          })
        } else if (timeframe === '1W') {
          // Show day, date and time for 1 week in PST (at 6:30 AM)
          const dayLabel = date.toLocaleDateString('en-US', {
            weekday: 'short',
            day: 'numeric',
            timeZone: 'America/Los_Angeles',
          })
          const timeLabel = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Los_Angeles',
          })
          label = `${dayLabel} ${timeLabel}`
        } else if (timeframe === '1M') {
          // Show date for 1 month
          label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        } else {
          // Show month/year for longer timeframes
          label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        }

        ctx.fillText(label, x, margin.top + chartHeight + 10)
      }
    }

    // Always draw the final date at the right edge
    const lastDataSeries = seriesData[0] || (isWaveMode ? waveData[0] : null)
    const lastDataIdx = endIdx - 1
    if (lastDataSeries?.data[lastDataIdx]) {
      const timestamp = lastDataSeries.data[lastDataIdx].timestamp
      const date = new Date(timestamp)
      let lastLabel = ''
      if (timeframe === '1D') {
        lastLabel = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' })
      } else if (timeframe === '1W') {
        lastLabel = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
      } else if (timeframe === '1M') {
        lastLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      } else {
        lastLabel = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      }
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'right'
      ctx.fillText(lastLabel, margin.left + chartWidth, margin.top + chartHeight + 10)
    }

    // Draw crosshair with labels
    if (crosshair) {
      ctx.strokeStyle = '#ff8800' // Crispy orange 100% opacity
      ctx.lineWidth = 1
      ctx.setLineDash([])

      // Vertical line
      if (crosshair.x >= margin.left && crosshair.x <= margin.left + chartWidth) {
        ctx.beginPath()
        ctx.moveTo(crosshair.x, margin.top)
        ctx.lineTo(crosshair.x, margin.top + chartHeight)
        ctx.stroke()

        // Find the data point at crosshair position
        const normalizedX = (crosshair.x - margin.left) / chartWidth
        const dataIdx = Math.floor(startIdx + normalizedX * (endIdx - startIdx))

        if (seriesData[0]?.data[dataIdx]) {
          const timestamp = seriesData[0].data[dataIdx].timestamp
          const date = new Date(timestamp)

          let label = ''

          if (timeframe === '1D') {
            label = date.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'America/Los_Angeles',
            })
          } else if (timeframe === '1W') {
            const dayLabel = date.toLocaleDateString('en-US', {
              weekday: 'short',
              timeZone: 'America/Los_Angeles',
            })
            const timeLabel = date.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'America/Los_Angeles',
            })
            label = `${dayLabel} ${timeLabel}`
          } else if (timeframe === '1M') {
            label = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          } else {
            label = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          }

          // Draw label box at bottom
          ctx.fillStyle = '#ff8800'
          ctx.font = 'bold 16px monospace' // Increased from 12px to 16px (33% bigger, rounded to 30%)
          const textWidth = ctx.measureText(label).width
          ctx.fillRect(
            crosshair.x - textWidth / 2 - 5,
            margin.top + chartHeight + 5,
            textWidth + 10,
            24
          )
          ctx.fillStyle = '#000000'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(label, crosshair.x, margin.top + chartHeight + 17)
        }
      }

      // Horizontal line
      if (crosshair.y >= margin.top && crosshair.y <= margin.top + chartHeight) {
        ctx.beginPath()
        ctx.moveTo(margin.left, crosshair.y)
        ctx.lineTo(margin.left + chartWidth, crosshair.y)
        ctx.stroke()

        // Calculate Y value
        const normalizedY = 1 - (crosshair.y - margin.top) / chartHeight
        const yValue = minVal + normalizedY * valueRange

        // Draw label box on left — clamped so it never overflows the left canvas edge
        ctx.fillStyle = '#ff8800'
        const yLabel = `${yValue >= 0 ? '+' : ''}${yValue.toFixed(2)}%`
        ctx.font = isSmall ? 'bold 11px monospace' : 'bold 16px monospace'
        const yTextWidth = ctx.measureText(yLabel).width
        const yBoxX = Math.max(0, margin.left - yTextWidth - 15)
        ctx.fillRect(yBoxX, crosshair.y - 12, yTextWidth + 10, 24)
        ctx.fillStyle = '#000000'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(yLabel, yBoxX + 4, crosshair.y)
      }

      ctx.setLineDash([])
    }
  }, [dimensions, seriesData, zoomRange, hoveredSeries, timeframe, crosshair, hiddenSeries, isWaveMode, waveData])

  // Redraw on changes
  useEffect(() => {
    if (seriesData.length === 0 || dimensions.width === 0 || dimensions.height === 0) {
      return
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    const draw = () => {
      try {
        drawChart()
      } catch (err) {
        console.error('Chart draw error:', err)
      }
    }

    animationFrameRef.current = requestAnimationFrame(draw)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [
    dimensions.width,
    dimensions.height,
    seriesData,
    zoomRange,
    timeframe,
    hoveredSeries,
    crosshair,
  ])

  // Mouse handlers for panning
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left

      setIsPanning(true)
      setPanStart({ x, rangeStart: zoomRange.start, rangeEnd: zoomRange.end })
    },
    [zoomRange]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas || dimensions.width === 0) return

      const rect = canvas.getBoundingClientRect()
      const isSmall = dimensions.width < 450
      const margin = { top: isSmall ? 30 : 50, right: isSmall ? 110 : 140, bottom: isSmall ? 35 : 60, left: isSmall ? 42 : 70 }
      const legendX = dimensions.width - margin.right
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Update crosshair position if in chart area
      if (
        mouseX >= margin.left &&
        mouseX <= dimensions.width - margin.right &&
        mouseY >= margin.top &&
        mouseY <= dimensions.height - margin.bottom
      ) {
        setCrosshair({ x: mouseX, y: mouseY })
      } else {
        setCrosshair(null)
      }

      // Check hover over ticker labels at end of lines
      let foundHover = false
      for (const labelPos of labelPositionsRef.current) {
        if (
          mouseX >= labelPos.x &&
          mouseX <= labelPos.x + labelPos.width &&
          mouseY >= labelPos.y &&
          mouseY <= labelPos.y + labelPos.height
        ) {
          setHoveredSeries(labelPos.symbol)
          foundHover = true
          break
        }
      }

      if (!foundHover && hoveredSeries !== null) {
        setHoveredSeries(null)
      }

      // Panning
      if (isPanning) {
        const chartWidth = dimensions.width - margin.left - margin.right
        const dx = (e.clientX - rect.left - panStart.x) / chartWidth
        const rangeSize = panStart.rangeEnd - panStart.rangeStart

        let newStart = panStart.rangeStart - dx
        let newEnd = panStart.rangeEnd - dx

        // Clamp
        if (newStart < 0) {
          newStart = 0
          newEnd = rangeSize
        }
        if (newEnd > 1) {
          newEnd = 1
          newStart = 1 - rangeSize
        }

        setZoomRange({ start: newStart, end: newEnd })
      }
    },
    [dimensions.width, seriesData, hoveredSeries, isPanning, panStart]
  )

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false)
    setHoveredSeries(null)
    setCrosshair(null)
  }, [])

  // Zoom with wheel - prevent page zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (dimensions.width === 0) return

      const rect = canvas.getBoundingClientRect()
      const isSmall = dimensions.width < 450
      const margin = { top: isSmall ? 30 : 50, right: isSmall ? 110 : 140, bottom: isSmall ? 35 : 60, left: isSmall ? 42 : 70 }
      const chartWidth = dimensions.width - margin.left - margin.right
      const mouseX = e.clientX - rect.left

      // Only zoom in chart area
      if (mouseX < margin.left || mouseX > margin.left + chartWidth) return

      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9
      const mousePos = (mouseX - margin.left) / chartWidth
      const currentRange = zoomRange.end - zoomRange.start
      const newRange = Math.min(1, Math.max(0.05, currentRange * zoomFactor))

      const pivot = zoomRange.start + currentRange * mousePos
      let newStart = pivot - newRange * mousePos
      let newEnd = newStart + newRange

      // Clamp
      if (newStart < 0) {
        newStart = 0
        newEnd = newRange
      }
      if (newEnd > 1) {
        newEnd = 1
        newStart = 1 - newRange
      }

      setZoomRange({ start: newStart, end: newEnd })
    }

    // Add listener with passive: false to prevent default zoom
    canvas.addEventListener('wheel', wheelHandler, { passive: false })

    return () => {
      canvas.removeEventListener('wheel', wheelHandler)
    }
  }, [dimensions.width, zoomRange])

  // Reset zoom
  const resetZoom = () => {
    setZoomRange({ start: 0, end: 1 })
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-dropdown]') && !target.closest('[data-dropdown-button]')) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])


  if (!isVisible) return null

  // ── Shared button/dropdown style helpers ─────────────────────────────────
  const btnStyle = (active: boolean, open: boolean): React.CSSProperties => ({
    height: '45px', padding: '0 18px', display: 'flex', alignItems: 'center', gap: '6px',
    background: active || open
      ? 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.20) 100%)'
      : 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.15) 100%)',
    color: active ? '#FF6600' : '#ffffff',
    border: active || open ? '1px solid rgba(255,102,0,0.55)' : '1px solid rgba(255,255,255,0.10)',
    borderRadius: '6px', fontSize: '15px', fontWeight: '700', fontFamily: 'monospace',
    cursor: 'pointer', textTransform: 'uppercase' as const, userSelect: 'none' as const,
    letterSpacing: '0.8px', whiteSpace: 'nowrap' as const,
    backdropFilter: 'blur(12px)',
    boxShadow: active || open
      ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 1px rgba(255,102,0,0.15), 0 2px 8px rgba(0,0,0,0.5)'
      : 'inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 6px rgba(0,0,0,0.4)',
    transition: 'all 0.15s',
  })

  const chevronStyle = (open: boolean): React.CSSProperties => ({
    fontSize: '10px', color: 'currentColor', opacity: open ? 1 : 0.5,
    transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
    display: 'inline-block',
  })

  const dropdownContainerStyle: React.CSSProperties = {
    position: 'fixed', background: 'rgba(6,6,8,0.98)',
    border: '1px solid rgba(255,255,255,0.11)', borderTop: '2px solid #FF6600',
    borderRadius: '0 0 8px 8px', padding: '6px', zIndex: 999999,
    minWidth: '260px', maxHeight: '480px', overflowY: 'auto',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.98)',
    top: dropdownPosition ? `${dropdownPosition.top}px` : 0,
    left: dropdownPosition ? `${dropdownPosition.left}px` : 0,
  }

  const dropdownSelectAll = (allSel: boolean, onToggle: () => void) => (
    <div onClick={e => { e.stopPropagation(); e.preventDefault(); onToggle() }}
      style={{
        padding: '8px 12px', cursor: 'pointer', color: '#ffffff',
        fontSize: '11px', fontWeight: '700', borderBottom: '1px solid #181818',
        marginBottom: '4px', background: allSel ? 'rgba(255,102,0,0.08)' : 'transparent',
        userSelect: 'none', letterSpacing: '1px', display: 'flex', alignItems: 'center',
        gap: '10px', borderRadius: '2px', transition: 'background 0.1s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = allSel ? 'rgba(255,102,0,0.08)' : 'transparent' }}
    >
      <span style={{
        width: '14px', height: '14px', borderRadius: '2px', flexShrink: 0,
        border: allSel ? '2px solid #FF6600' : '2px solid #333',
        background: allSel ? '#FF6600' : 'transparent',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '9px', color: '#000', fontWeight: '900',
      }}>{allSel ? '✓' : ''}</span>
      SELECT ALL
    </div>
  )

  const dropdownItem = (
    item: { symbol: string; name: string; color: string },
    isSelected: boolean,
    onToggle: () => void,
    hasHoldings: boolean,
    expandedHoldingsArg: string | null,
    setExpandedHoldingsArg: ((v: string | null) => void) | null,
    holdings?: Array<{ symbol: string; name: string; color: string }>,
    selectedSymbolsArg?: string[],
    toggleSymbolArg?: (s: string) => void,
  ) => (
    <React.Fragment key={item.symbol}>
      <div
        onClick={e => { e.stopPropagation(); e.preventDefault(); onToggle() }}
        style={{
          padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: '10px', fontSize: '12px', color: '#ffffff',
          background: isSelected ? 'rgba(255,255,255,0.04)' : 'transparent',
          borderRadius: '2px', transition: 'background 0.1s', userSelect: 'none',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(255,255,255,0.04)' : 'transparent' }}
      >
        <span style={{
          width: '14px', height: '14px', borderRadius: '2px', flexShrink: 0,
          border: isSelected ? '2px solid #FF6600' : '2px solid #333',
          background: isSelected ? '#FF6600' : 'transparent',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '9px', color: '#000', fontWeight: '900',
        }}>{isSelected ? '✓' : ''}</span>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
        <span style={{ fontWeight: '700', letterSpacing: '0.5px', minWidth: '48px' }}>{item.symbol}</span>
        <span style={{ fontSize: '11px', color: '#ffffff', opacity: 0.5, marginLeft: 'auto' }}>{item.name}</span>
        {hasHoldings && setExpandedHoldingsArg && (
          <span
            onClick={e => { e.stopPropagation(); e.preventDefault(); setExpandedHoldingsArg(expandedHoldingsArg === item.symbol ? null : item.symbol) }}
            style={{
              marginLeft: '6px', padding: '2px 6px', fontSize: '10px', fontWeight: '700',
              color: expandedHoldingsArg === item.symbol ? '#00d4ff' : '#ffffff',
              border: expandedHoldingsArg === item.symbol ? '1px solid #00d4ff44' : '1px solid #333',
              borderRadius: '2px', cursor: 'pointer', opacity: expandedHoldingsArg === item.symbol ? 1 : 0.6,
            }}>TOP 10</span>
        )}
      </div>
      {/* Holdings sub-list */}
      {hasHoldings && expandedHoldingsArg === item.symbol && holdings && holdings.map(h => {
        const hSelected = selectedSymbolsArg?.includes(h.symbol) ?? false
        return (
          <div key={h.symbol}
            onClick={e => { e.stopPropagation(); e.preventDefault(); toggleSymbolArg?.(h.symbol) }}
            style={{
              padding: '5px 12px 5px 36px', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: '10px', fontSize: '11px', color: '#ffffff',
              background: hSelected ? 'rgba(255,255,255,0.04)' : 'transparent',
              borderRadius: '2px', userSelect: 'none', transition: 'background 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = hSelected ? 'rgba(255,255,255,0.04)' : 'transparent' }}
          >
            <span style={{
              width: '12px', height: '12px', borderRadius: '2px', flexShrink: 0,
              border: hSelected ? '2px solid #00d4ff' : '2px solid #2a2a2a',
              background: hSelected ? '#00d4ff' : 'transparent',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '8px', color: '#000', fontWeight: '900',
            }}>{hSelected ? '✓' : ''}</span>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: h.color, flexShrink: 0 }} />
            <span style={{ fontWeight: '700', minWidth: '48px' }}>{h.symbol}</span>
            <span style={{ fontSize: '11px', color: '#ffffff', opacity: 0.45, marginLeft: 'auto' }}>{h.name}</span>
          </div>
        )
      })}
    </React.Fragment>
  )

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#000000',
        fontFamily: 'monospace',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── HEADER: 2-row professional bar ─────────────────────────────── */}
      <div className="perf-header" style={{ background: 'rgba(5,5,7,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'relative', zIndex: 1, overflow: 'visible' }}>

        {/* ── ROW 1: symbol selector toolbar ── */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', height: '63px', gap: '4px', overflowX: 'auto', overflowY: 'visible' }}>

          {/* Ticker input */}
          <input
            type="text"
            value={tickerInput}
            onChange={e => setTickerInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleTickerSearch()}
            placeholder="AAPL,TSLA..."
            style={{
              height: '43px', width: '200px', flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.3) 100%)',
              color: '#ffffff', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '5px 0 0 5px', borderRight: 'none',
              fontSize: '14px', fontWeight: '700', fontFamily: 'monospace',
              padding: '0 10px', outline: 'none', letterSpacing: '0.6px',
              backdropFilter: 'blur(14px)',
            }}
          />
          <button onClick={handleTickerSearch} style={{ ...btnStyle(false, false), borderRadius: '0 5px 5px 0', borderLeft: 'none', flexShrink: 0 }}>ADD</button>

          {/* BENCHMARK right next to ADD */}
          <button id="perf-benchmark-btn"
            onClick={e => { e.stopPropagation(); e.preventDefault(); setIsBenchmarkMode(!isBenchmarkMode); lastFetchKeyRef.current = ''; setOpenDropdown(null) }}
            style={{ ...btnStyle(isBenchmarkMode, false), marginLeft: '2px', flexShrink: 0 }}>BENCHMARK</button>
          {isBenchmarkMode && (
            <input type="text" value={benchmarkInput}
              onChange={e => setBenchmarkInput(e.target.value.toUpperCase())}
              onBlur={() => { const t = benchmarkInput.trim().toUpperCase(); if (t && t !== benchmarkTicker) { setBenchmarkTicker(t); lastFetchKeyRef.current = '' } }}
              onKeyDown={e => { if (e.key === 'Enter') { const t = benchmarkInput.trim().toUpperCase(); if (t && t !== benchmarkTicker) { setBenchmarkTicker(t); lastFetchKeyRef.current = '' } e.currentTarget.blur() } }}
              style={{ width: '90px', height: '43px', padding: '0 8px', flexShrink: 0, background: 'linear-gradient(135deg, rgba(0,255,136,0.08) 0%, rgba(0,0,0,0.3) 100%)', color: '#00ff88', border: '1px solid rgba(0,204,85,0.45)', borderRadius: '5px', fontSize: '14px', fontWeight: '700', fontFamily: 'monospace', outline: 'none', letterSpacing: '0.8px', textTransform: 'uppercase' }}
              placeholder="SPY" />
          )}

          {/* Divider */}
          <div style={{ width: '1px', height: '35px', background: 'rgba(255,255,255,0.09)', margin: '0 4px', flexShrink: 0 }} />

          {/* Timeframe */}
          <select value={timeframe} onChange={e => { setTimeframe(e.target.value as Timeframe); setUseCustomDates(false) }}
            style={{ height: '43px', padding: '0 6px', flexShrink: 0, background: 'linear-gradient(180deg, #1a1a1a 0%, #050505 100%)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '5px', fontSize: '14px', fontWeight: '700', fontFamily: 'monospace', cursor: 'pointer', outline: 'none', letterSpacing: '0.6px', colorScheme: 'dark', accentColor: '#ff6600' }}>
            {(['1D', '1W', '1M', '3M', '6M', '1Y', '2Y', '5Y', '10Y', '20Y', 'YTD'] as Timeframe[]).map(tf => <option key={tf} value={tf}>{tf}</option>)}
          </select>

          {/* Date range */}
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); if (e.target.value) setUseCustomDates(true) }}
            style={{ height: '43px', padding: '0 6px', flexShrink: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(8,8,8,0.90) 100%)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '5px', fontSize: '14px', fontFamily: 'monospace', cursor: 'pointer', outline: 'none', colorScheme: 'dark', backdropFilter: 'blur(14px)' }} />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', flexShrink: 0 }}>{String.fromCharCode(0x2014)}</span>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); if (e.target.value) setUseCustomDates(true) }}
            style={{ height: '43px', padding: '0 6px', flexShrink: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(8,8,8,0.90) 100%)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '5px', fontSize: '14px', fontFamily: 'monospace', cursor: 'pointer', outline: 'none', colorScheme: 'dark', backdropFilter: 'blur(14px)' }} />
          {useCustomDates && (
            <button onClick={() => { setUseCustomDates(false); setDateFrom(''); setDateTo(''); lastFetchKeyRef.current = '' }}
              style={{ ...btnStyle(false, false), color: '#ff4444', border: '1px solid rgba(255,68,68,0.35)', flexShrink: 0 }}>X</button>
          )}

          {/* Divider */}
          <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.09)', margin: '0 4px', flexShrink: 0 }} />

          {/* INDICES */}
          {(() => {
            const key = 'indices'; const isOpen = openDropdown === key
            const someSelected = INDICES.some(s => selectedSymbols.includes(s.symbol))
            const allSel = INDICES.every(s => selectedSymbols.includes(s.symbol))
            return (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button ref={el => { buttonRefs.current[key] = el }} data-dropdown-button
                  onClick={e => { e.stopPropagation(); if (isOpen) { setOpenDropdown(null); setDropdownPosition(null) } else { const r = buttonRefs.current[key]?.getBoundingClientRect(); if (r) setDropdownPosition({ top: r.bottom + 4, left: r.left }); setOpenDropdown(key) } }}
                  style={btnStyle(someSelected, isOpen)}>
                  INDICES <span style={chevronStyle(isOpen)}>{String.fromCharCode(0x25BC)}</span>
                </button>
                {isOpen && dropdownPosition && typeof window !== 'undefined' && createPortal(
                  <div data-dropdown onClick={e => { e.stopPropagation(); e.preventDefault() }} style={dropdownContainerStyle}>
                    {dropdownSelectAll(allSel, () => { INDICES.forEach(s => { if (allSel) setSelectedSymbols(p => p.filter(x => x !== s.symbol)); else setSelectedSymbols(p => Array.from(new Set([...p, s.symbol]))) }) })}
                    {INDICES.map(item => dropdownItem(item, selectedSymbols.includes(item.symbol), () => toggleSymbol(item.symbol), false, null, null))}
                  </div>, document.body
                )}
              </div>
            )
          })()}

          {/* SECTORS — WAVES inside at top */}
          {(() => {
            const key = 'sectors'; const isOpen = openDropdown === key
            const someSelected = SECTORS.some(s => selectedSymbols.includes(s.symbol))
            const allSel = isAllSelected(SECTORS)
            return (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button ref={el => { buttonRefs.current[key] = el }} data-dropdown-button
                  onClick={e => { e.stopPropagation(); if (isOpen) { setOpenDropdown(null); setDropdownPosition(null); setExpandedHoldings(null) } else { const r = buttonRefs.current[key]?.getBoundingClientRect(); if (r) setDropdownPosition({ top: r.bottom + 4, left: r.left }); setOpenDropdown(key) } }}
                  onDoubleClick={e => { e.stopPropagation(); toggleCategory(SECTORS); setOpenDropdown(null) }}
                  style={btnStyle(someSelected || isWaveMode, isOpen)}>
                  SECTORS <span style={chevronStyle(isOpen)}>{String.fromCharCode(0x25BC)}</span>
                </button>
                {isOpen && dropdownPosition && typeof window !== 'undefined' && createPortal(
                  <div data-dropdown onClick={e => { e.stopPropagation(); e.preventDefault() }} style={{ ...dropdownContainerStyle, minWidth: '320px' }}>
                    {/* WAVES at top of sectors dropdown */}
                    <div onClick={e => { e.stopPropagation(); setIsWaveMode(!isWaveMode); setOpenDropdown(null); setDropdownPosition(null) }}
                      style={{ padding: '8px 12px', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '8px', background: isWaveMode ? 'rgba(255,102,0,0.12)' : 'transparent', borderRadius: '4px', marginBottom: '4px', border: isWaveMode ? '1px solid rgba(255,102,0,0.35)' : '1px solid rgba(255,255,255,0.06)', color: isWaveMode ? '#FF6600' : '#aaa', fontSize: '11px', fontWeight: '700', fontFamily: 'monospace', letterSpacing: '0.7px', transition: 'all 0.14s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = isWaveMode ? 'rgba(255,102,0,0.18)' : 'rgba(255,255,255,0.06)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isWaveMode ? 'rgba(255,102,0,0.12)' : 'transparent' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="2,18 7,8 12,14 17,6 22,12" /></svg>
                      WAVES {isWaveMode ? '— ON' : ''}
                    </div>
                    {dropdownSelectAll(allSel, () => toggleCategory(SECTORS))}
                    {SECTORS.map(item => {
                      const holdings = SECTOR_HOLDINGS[item.symbol] || []
                      return dropdownItem(item, selectedSymbols.includes(item.symbol), () => toggleSymbol(item.symbol), holdings.length > 0, expandedHoldings, setExpandedHoldings, holdings, selectedSymbols, toggleSymbol)
                    })}
                  </div>, document.body
                )}
              </div>
            )
          })()}

          {/* INDUSTRIES with holdings */}
          {(() => {
            const key = 'industries'; const isOpen = openDropdown === key
            const someSelected = INDUSTRIES.some(s => selectedSymbols.includes(s.symbol))
            const allSel = isAllSelected(INDUSTRIES)
            return (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button ref={el => { buttonRefs.current[key] = el }} data-dropdown-button
                  onClick={e => { e.stopPropagation(); if (isOpen) { setOpenDropdown(null); setDropdownPosition(null); setExpandedHoldings(null) } else { const r = buttonRefs.current[key]?.getBoundingClientRect(); if (r) setDropdownPosition({ top: r.bottom + 4, left: r.left }); setOpenDropdown(key) } }}
                  onDoubleClick={e => { e.stopPropagation(); toggleCategory(INDUSTRIES); setOpenDropdown(null) }}
                  style={btnStyle(someSelected, isOpen)}>
                  INDUSTRIES <span style={chevronStyle(isOpen)}>{String.fromCharCode(0x25BC)}</span>
                </button>
                {isOpen && dropdownPosition && typeof window !== 'undefined' && createPortal(
                  <div data-dropdown onClick={e => { e.stopPropagation(); e.preventDefault() }} style={{ ...dropdownContainerStyle, minWidth: '320px' }}>
                    {dropdownSelectAll(allSel, () => toggleCategory(INDUSTRIES))}
                    {INDUSTRIES.map(item => {
                      const holdings = INDUSTRY_HOLDINGS[item.symbol] || []
                      return dropdownItem(item, selectedSymbols.includes(item.symbol), () => toggleSymbol(item.symbol), holdings.length > 0, expandedHoldings, setExpandedHoldings, holdings, selectedSymbols, toggleSymbol)
                    })}
                  </div>, document.body
                )}
              </div>
            )
          })()}

          {/* MAG7 */}
          {(() => {
            const key = 'mag7'; const isOpen = openDropdown === key
            const someSelected = MAG7.some(s => selectedSymbols.includes(s.symbol))
            const allSel = MAG7.every(s => selectedSymbols.includes(s.symbol))
            return (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button ref={el => { buttonRefs.current[key] = el }} data-dropdown-button
                  onClick={e => { e.stopPropagation(); if (isOpen) { setOpenDropdown(null); setDropdownPosition(null) } else { const r = buttonRefs.current[key]?.getBoundingClientRect(); if (r) setDropdownPosition({ top: r.bottom + 4, left: r.left }); setOpenDropdown(key) } }}
                  style={btnStyle(someSelected, isOpen)}>
                  MAG 7 <span style={chevronStyle(isOpen)}>{String.fromCharCode(0x25BC)}</span>
                </button>
                {isOpen && dropdownPosition && typeof window !== 'undefined' && createPortal(
                  <div data-dropdown onClick={e => { e.stopPropagation(); e.preventDefault() }} style={dropdownContainerStyle}>
                    {dropdownSelectAll(allSel, () => { MAG7.forEach(s => { if (allSel) setSelectedSymbols(p => p.filter(x => x !== s.symbol)); else setSelectedSymbols(p => Array.from(new Set([...p, s.symbol]))) }) })}
                    {MAG7.map(item => dropdownItem(item, selectedSymbols.includes(item.symbol), () => toggleSymbol(item.symbol), false, null, null))}
                  </div>, document.body
                )}
              </div>
            )
          })()}

          {/* SPECIAL */}
          {(() => {
            const key = 'special'; const isOpen = openDropdown === key
            const someSelected = SPECIAL.some(s => selectedSymbols.includes(s.symbol))
            const allSel = isAllSelected(SPECIAL)
            return (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button ref={el => { buttonRefs.current[key] = el }} data-dropdown-button
                  onClick={e => { e.stopPropagation(); if (isOpen) { setOpenDropdown(null); setDropdownPosition(null) } else { const r = buttonRefs.current[key]?.getBoundingClientRect(); if (r) setDropdownPosition({ top: r.bottom + 4, left: r.left }); setOpenDropdown(key) } }}
                  onDoubleClick={e => { e.stopPropagation(); toggleCategory(SPECIAL); setOpenDropdown(null) }}
                  style={btnStyle(someSelected, isOpen)}>
                  SPECIAL <span style={chevronStyle(isOpen)}>{String.fromCharCode(0x25BC)}</span>
                </button>
                {isOpen && dropdownPosition && typeof window !== 'undefined' && createPortal(
                  <div data-dropdown onClick={e => { e.stopPropagation(); e.preventDefault() }} style={dropdownContainerStyle}>
                    {dropdownSelectAll(allSel, () => toggleCategory(SPECIAL))}
                    {SPECIAL.map(item => dropdownItem(item, selectedSymbols.includes(item.symbol), () => toggleSymbol(item.symbol), false, null, null))}
                  </div>, document.body
                )}
              </div>
            )
          })()}

          {/* INTERNATIONAL */}
          {(() => {
            const key = 'international'; const isOpen = openDropdown === key
            const someSelected = INTERNATIONAL.some(s => selectedSymbols.includes(s.symbol))
            const allSel = INTERNATIONAL.every(s => selectedSymbols.includes(s.symbol))
            return (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button ref={el => { buttonRefs.current[key] = el }} data-dropdown-button
                  onClick={e => { e.stopPropagation(); if (isOpen) { setOpenDropdown(null); setDropdownPosition(null) } else { const r = buttonRefs.current[key]?.getBoundingClientRect(); if (r) setDropdownPosition({ top: r.bottom + 4, left: r.left }); setOpenDropdown(key) } }}
                  style={btnStyle(someSelected, isOpen)}>
                  INTERNATIONAL <span style={chevronStyle(isOpen)}>{String.fromCharCode(0x25BC)}</span>
                </button>
                {isOpen && dropdownPosition && typeof window !== 'undefined' && createPortal(
                  <div data-dropdown onClick={e => { e.stopPropagation(); e.preventDefault() }} style={dropdownContainerStyle}>
                    {dropdownSelectAll(allSel, () => { INTERNATIONAL.forEach(s => { if (allSel) setSelectedSymbols(p => p.filter(x => x !== s.symbol)); else setSelectedSymbols(p => Array.from(new Set([...p, s.symbol]))) }) })}
                    {INTERNATIONAL.map(item => dropdownItem(item, selectedSymbols.includes(item.symbol), () => toggleSymbol(item.symbol), false, null, null))}
                  </div>, document.body
                )}
              </div>
            )
          })()}

          {/* Swing presets */}
          <div style={{ width: '1px', height: '35px', background: 'rgba(255,255,255,0.09)', margin: '0 4px', flexShrink: 0 }} />
          <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: '700', letterSpacing: '1px', whiteSpace: 'nowrap', fontFamily: 'monospace', lineHeight: '1.2', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: '6px' }}><span>TREND</span><span>SHIFT</span></span>
          <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
            {dynamicSwingDates.map(sd => (
              <button key={sd.label}
                title={sd.description}
                onClick={() => { setDateFrom(sd.date); setDateTo(''); setUseCustomDates(true); lastFetchKeyRef.current = '' }}
                style={{ ...btnStyle(false, false), flexShrink: 0, padding: '0 9px', fontSize: '13px' }}>{sd.label}</button>
            ))}
          </div>

          {/* Legend toggle — far right */}
          <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <button onClick={() => setShowLegend(v => !v)} style={btnStyle(showLegend, false)}>LEGEND</button>
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          minHeight: '500px',
          overflow: 'hidden',
        }}
      >
        {loading && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: '#ffffff',
              fontSize: '13px',
              fontFamily: 'monospace',
              letterSpacing: '1px',
              fontWeight: '700',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                border: '2px solid #1e1e1e',
                borderTop: '2px solid #00d4ff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 14px',
              }}
            />
            LOADING {selectedSymbols.length} SYMBOL{selectedSymbols.length !== 1 ? 'S' : ''}...
          </div>
        )}

        {!loading && selectedSymbols.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: '#ffffff',
              fontSize: '12px',
              fontFamily: 'monospace',
              letterSpacing: '1px',
              fontWeight: '700',
            }}
          >
            <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.4 }}>ðŸ“Š</div>
            <div>SELECT SYMBOLS TO VIEW PERFORMANCE</div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={(e) => {
            e.preventDefault()
            if (zoomRange.start !== 0 || zoomRange.end !== 1) {
              resetZoom()
            }
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            cursor: isPanning ? 'grabbing' : 'grab',
            display: !loading && seriesData.length > 0 ? 'block' : 'none',
            touchAction: 'none',
          }}
        />
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .perf-header select option {
          background: #0a0a0a;
          color: #ffffff;
        }
        .perf-header select {
          color-scheme: dark;
        }
      `}</style>
    </div>
  )
}

export default PerformanceDashboard
