import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

interface Position {
  id: string
  symbol: string
  quantity: number
  avgPrice: number
  currentPrice: number
  pnl: number
  pnlPercent: number
  sector: string
  type: 'long' | 'short'
  openDate: string
}

interface WatchlistItem {
  id: string
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  sector: string
  marketCap: number
  volume: number
}

interface Alert {
  id: string
  symbol: string
  condition: 'above' | 'below' | 'crosses_above' | 'crosses_below'
  price: number
  isActive: boolean
  createdAt: string
  triggeredAt?: string
}

interface ChartData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface MarketData {
  [symbol: string]: ChartData[]
}

interface TradingStore {
  // Portfolio
  positions: Position[]
  totalPnL: number
  totalValue: number
  cashBalance: number
  
  // Watchlist
  watchlist: WatchlistItem[]
  
  // Alerts
  alerts: Alert[]
  
  // Chart data
  marketData: MarketData
  selectedSymbol: string
  chartInterval: string
  
  // UI State
  activeTab: string
  sidebarCollapsed: boolean
  
  // Actions
  addPosition: (position: Omit<Position, 'id' | 'pnl' | 'pnlPercent'>) => void
  removePosition: (id: string) => void
  updatePositionPrice: (id: string, currentPrice: number) => void
  
  addToWatchlist: (item: Omit<WatchlistItem, 'id'>) => void
  removeFromWatchlist: (id: string) => void
  updateWatchlistPrices: (updates: { symbol: string; price: number; change: number; changePercent: number }[]) => void
  
  addAlert: (alert: Omit<Alert, 'id' | 'isActive' | 'createdAt'>) => void
  removeAlert: (id: string) => void
  triggerAlert: (id: string) => void
  
  setMarketData: (symbol: string, data: ChartData[]) => void
  setSelectedSymbol: (symbol: string) => void
  setChartInterval: (interval: string) => void
  
  setActiveTab: (tab: string) => void
  toggleSidebar: () => void
  
  // Calculated values
  getPortfolioMetrics: () => {
    totalPositions: number
    winnersCount: number
    losersCount: number
    biggestWinner: Position | null
    biggestLoser: Position | null
    sectorExposure: { [sector: string]: number }
  }
}

export const useTradingStore = create<TradingStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    positions: [
      {
        id: '1',
        symbol: 'AAPL',
        quantity: 100,
        avgPrice: 180.50,
        currentPrice: 185.20,
        pnl: 470,
        pnlPercent: 2.61,
        sector: 'Technology',
        type: 'long',
        openDate: '2024-01-15'
      },
      {
        id: '2',
        symbol: 'TSLA',
        quantity: 50,
        avgPrice: 220.00,
        currentPrice: 215.80,
        pnl: -210,
        pnlPercent: -1.91,
        sector: 'Automotive',
        type: 'long',
        openDate: '2024-01-20'
      },
      {
        id: '3',
        symbol: 'SPY',
        quantity: 200,
        avgPrice: 445.20,
        currentPrice: 448.90,
        pnl: 740,
        pnlPercent: 0.83,
        sector: 'ETF',
        type: 'long',
        openDate: '2024-01-10'
      }
    ],
    totalPnL: 1000,
    totalValue: 125000,
    cashBalance: 25000,
    
    watchlist: [
      {
        id: '1',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        price: 185.20,
        change: 2.50,
        changePercent: 1.37,
        sector: 'Technology',
        marketCap: 2900000000000,
        volume: 45000000
      },
      {
        id: '2',
        symbol: 'MSFT',
        name: 'Microsoft Corporation',
        price: 420.15,
        change: -1.85,
        changePercent: -0.44,
        sector: 'Technology',
        marketCap: 3100000000000,
        volume: 28000000
      },
      {
        id: '3',
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        price: 875.50,
        change: 15.20,
        changePercent: 1.77,
        sector: 'Technology',
        marketCap: 2200000000000,
        volume: 52000000
      },
      {
        id: '4',
        symbol: 'TSLA',
        name: 'Tesla Inc.',
        price: 215.80,
        change: -4.20,
        changePercent: -1.91,
        sector: 'Automotive',
        marketCap: 680000000000,
        volume: 35000000
      }
    ],
    
    alerts: [
      {
        id: '1',
        symbol: 'AAPL',
        condition: 'above',
        price: 190.00,
        isActive: true,
        createdAt: '2024-01-22T10:00:00Z'
      },
      {
        id: '2',
        symbol: 'TSLA',
        condition: 'below',
        price: 200.00,
        isActive: true,
        createdAt: '2024-01-22T11:30:00Z'
      }
    ],
    
    marketData: {},
    selectedSymbol: 'AAPL',
    chartInterval: '1D',
    
    activeTab: 'overview',
    sidebarCollapsed: false,
    
    // Actions
    addPosition: (position) => {
      const id = Math.random().toString(36).substr(2, 9)
      const newPosition: Position = {
        ...position,
        id,
        pnl: (position.currentPrice - position.avgPrice) * position.quantity,
        pnlPercent: ((position.currentPrice - position.avgPrice) / position.avgPrice) * 100
      }
      
      set((state) => ({
        positions: [...state.positions, newPosition],
        totalPnL: state.totalPnL + newPosition.pnl,
        totalValue: state.totalValue + (position.currentPrice * position.quantity)
      }))
    },
    
    removePosition: (id) => {
      set((state) => {
        const position = state.positions.find(p => p.id === id)
        if (!position) return state
        
        return {
          positions: state.positions.filter(p => p.id !== id),
          totalPnL: state.totalPnL - position.pnl,
          totalValue: state.totalValue - (position.currentPrice * position.quantity)
        }
      })
    },
    
    updatePositionPrice: (id, currentPrice) => {
      set((state) => ({
        positions: state.positions.map(position => {
          if (position.id === id) {
            const pnl = (currentPrice - position.avgPrice) * position.quantity
            const pnlPercent = ((currentPrice - position.avgPrice) / position.avgPrice) * 100
            return { ...position, currentPrice, pnl, pnlPercent }
          }
          return position
        })
      }))
    },
    
    addToWatchlist: (item) => {
      const id = Math.random().toString(36).substr(2, 9)
      set((state) => ({
        watchlist: [...state.watchlist, { ...item, id }]
      }))
    },
    
    removeFromWatchlist: (id) => {
      set((state) => ({
        watchlist: state.watchlist.filter(item => item.id !== id)
      }))
    },
    
    updateWatchlistPrices: (updates) => {
      set((state) => ({
        watchlist: state.watchlist.map(item => {
          const update = updates.find(u => u.symbol === item.symbol)
          return update ? { ...item, ...update } : item
        })
      }))
    },
    
    addAlert: (alert) => {
      const id = Math.random().toString(36).substr(2, 9)
      const newAlert: Alert = {
        ...alert,
        id,
        isActive: true,
        createdAt: new Date().toISOString()
      }
      set((state) => ({
        alerts: [...state.alerts, newAlert]
      }))
    },
    
    removeAlert: (id) => {
      set((state) => ({
        alerts: state.alerts.filter(alert => alert.id !== id)
      }))
    },
    
    triggerAlert: (id) => {
      set((state) => ({
        alerts: state.alerts.map(alert =>
          alert.id === id
            ? { ...alert, isActive: false, triggeredAt: new Date().toISOString() }
            : alert
        )
      }))
    },
    
    setMarketData: (symbol, data) => {
      set((state) => ({
        marketData: { ...state.marketData, [symbol]: data }
      }))
    },
    
    setSelectedSymbol: (symbol) => {
      set({ selectedSymbol: symbol })
    },
    
    setChartInterval: (interval) => {
      set({ chartInterval: interval })
    },
    
    setActiveTab: (tab) => {
      set({ activeTab: tab })
    },
    
    toggleSidebar: () => {
      set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
    },
    
    getPortfolioMetrics: () => {
      const state = get()
      const positions = state.positions
      
      const winners = positions.filter(p => p.pnl > 0)
      const losers = positions.filter(p => p.pnl < 0)
      
      const biggestWinner = winners.length > 0 
        ? winners.reduce((max, pos) => pos.pnl > max.pnl ? pos : max)
        : null
        
      const biggestLoser = losers.length > 0
        ? losers.reduce((min, pos) => pos.pnl < min.pnl ? pos : min)
        : null
      
      const sectorExposure = positions.reduce((acc, pos) => {
        const value = pos.currentPrice * pos.quantity
        acc[pos.sector] = (acc[pos.sector] || 0) + value
        return acc
      }, {} as { [sector: string]: number })
      
      return {
        totalPositions: positions.length,
        winnersCount: winners.length,
        losersCount: losers.length,
        biggestWinner,
        biggestLoser,
        sectorExposure
      }
    }
  }))
)
