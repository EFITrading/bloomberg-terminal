'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  TbPlus, 
  TbEdit, 
  TbTrash, 
  TbChartLine, 
  TbTarget, 
  TbTrendingUp, 
  TbTrendingDown,
  TbCalendar,
  TbClock,
  TbCurrencyDollar,
  TbPercentage,
  TbFileText,
  TbCamera,
  TbTag,
  TbFilter,
  TbDownload,
  TbSettings,
  TbAnalyze,
  TbEye,
  TbX,
  TbRefresh,
  TbDatabase,
  TbArrowUp,
  TbArrowDown,
  TbActivity,
  TbAlertTriangle,
  TbCheck,
  TbClipboard
} from 'react-icons/tb';

interface Trade {
  id: string;
  symbol: string;
  type: 'long' | 'short' | 'call' | 'put' | 'spread';
  strategy: string;
  setup: string;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  entryDate: string;
  entryTime?: string;
  exitDate?: string;
  exitTime?: string;
  pnl?: number;
  pnlPercent?: number;
  status: 'open' | 'closed' | 'partial';
  stopLoss?: number;
  takeProfit?: number;
  fees?: number;
  maxRisk: number;
  notes: string;
  tags: string[];
  currentPrice?: number;
  unrealizedPnL?: number;
  realizedPnL?: number;
  commission?: number;
  slippage?: number;
  timeInTrade?: number;
  sector?: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 1-5 scale
  // Options-specific fields
  isOptions?: boolean;
  strike?: number;
  expiry?: string;
  optionType?: 'call' | 'put';
  contractSize?: number;
  premium?: number;
  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  underlyingPrice?: number;
  daysToExpiry?: number;
  intrinsicValue?: number;
  timeValue?: number;
}

interface TradingGoal {
  id: string;
  title: string;
  description: string;
  category: 'performance' | 'risk' | 'skill';
  target: number;
  targetValue: number;
  current: number;
  currentValue: number;
  progress: number;
  unit: string;
  deadline: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  type: 'profit' | 'winRate' | 'trades' | 'maxDrawdown' | 'sharpeRatio';
  createdDate: string;
  targetDate: string;
  isActive: boolean;
}

interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  totalFees: number;
  netPnL: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  calmarRatio: number;
  largestWin: number;
  largestLoss: number;
  avgHoldTime: number;
  totalRisk: number;
  riskAdjustedReturn: number;
}

const TradingPlan: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'journal' | 'analytics' | 'goals' | 'settings'>('journal');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [goals, setGoals] = useState<TradingGoal[]>([]);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showTradeDetails, setShowTradeDetails] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [editingGoal, setEditingGoal] = useState<TradingGoal | null>(null);
  const [marketData, setMarketData] = useState<{ [symbol: string]: MarketData }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountSize, setAccountSize] = useState(100000);
  const [maxRiskPerTrade, setMaxRiskPerTrade] = useState(2);
  const [filters, setFilters] = useState({
    strategy: '',
    status: '',
    symbol: '',
    type: '',
    dateFrom: '',
    dateTo: '',
    minPnL: '',
    maxPnL: ''
  });
  
  const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

  // Real-time market data fetching
  const fetchMarketData = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    
    setLoading(true);
    try {
      const promises = symbols.map(async (symbol) => {
        const response = await fetch(
          `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_API_KEY}`
        );
        const data = await response.json();
        
        if (data.status === 'OK' && data.results) {
          const prevCloseResponse = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apikey=${POLYGON_API_KEY}`
          );
          const prevCloseData = await prevCloseResponse.json();
          
          const currentPrice = data.results.p;
          const prevClose = prevCloseData.results?.[0]?.c || currentPrice;
          const change = currentPrice - prevClose;
          const changePercent = (change / prevClose) * 100;
          
          return {
            symbol,
            price: currentPrice,
            change,
            changePercent,
            timestamp: data.results.t
          };
        }
        return null;
      });
      
      const results = await Promise.all(promises);
      const marketDataMap: { [symbol: string]: MarketData } = {};
      
      results.forEach((result) => {
        if (result) {
          marketDataMap[result.symbol] = result;
        }
      });
      
      setMarketData(marketDataMap);
    } catch (error) {
      console.error('Failed to fetch market data:', error);
      setError('Failed to fetch real-time market data');
    } finally {
      setLoading(false);
    }
  }, [POLYGON_API_KEY]);

  // Load trades from localStorage and fetch market data (only on mount)
  useEffect(() => {
    const savedTrades = localStorage.getItem('tradingPlanTrades');
    const savedGoals = localStorage.getItem('tradingPlanGoals');
    const savedAccountSize = localStorage.getItem('tradingPlanAccountSize');
    const savedMaxRisk = localStorage.getItem('tradingPlanMaxRisk');
    
    if (savedTrades) {
      const parsedTrades = JSON.parse(savedTrades);
      setTrades(parsedTrades);
      
      // Fetch market data for open positions
      const openSymbols = parsedTrades
        .filter((trade: Trade) => trade.status === 'open')
        .map((trade: Trade) => trade.symbol);
      
      if (openSymbols.length > 0) {
        fetchMarketData([...new Set(openSymbols)] as string[]);
      }
    }

    if (savedGoals) {
      setGoals(JSON.parse(savedGoals));
    } else {
      // Default goals
      const defaultGoals: TradingGoal[] = [
        {
          id: '1',
          title: 'Monthly Profit Target',
          description: 'Achieve $5,000 monthly profit',
          category: 'performance',
          target: 5000,
          targetValue: 5000,
          current: 1250,
          currentValue: 1250,
          progress: 25,
          unit: '$',
          deadline: new Date(2024, 11, 31).toISOString(),
          period: 'monthly',
          type: 'profit',
          createdDate: new Date().toISOString(),
          targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true
        },
        {
          id: '2',
          title: 'Win Rate Improvement',
          description: 'Maintain 65% win rate or higher',
          category: 'performance',
          target: 65,
          targetValue: 65,
          current: 58,
          currentValue: 58,
          progress: 89,
          unit: '%',
          deadline: new Date(2024, 11, 31).toISOString(),
          period: 'monthly',
          type: 'winRate',
          createdDate: new Date().toISOString(),
          targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true
        },
        {
          id: '3',
          title: 'Risk Management',
          description: 'Never risk more than 2% per trade',
          category: 'risk',
          target: 100,
          targetValue: 100,
          current: 95,
          currentValue: 95,
          progress: 95,
          unit: '%',
          deadline: new Date(2024, 11, 31).toISOString(),
          period: 'daily',
          type: 'trades',
          createdDate: new Date().toISOString(),
          targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true
        }
      ];
      setGoals(defaultGoals);
    }
    
    if (savedAccountSize) {
      setAccountSize(Number(savedAccountSize));
    }
    
    if (savedMaxRisk) {
      setMaxRiskPerTrade(Number(savedMaxRisk));
    }
  }, []); // Empty dependency array - only run on mount  // Save data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('tradingPlanTrades', JSON.stringify(trades));
  }, [trades]);

  useEffect(() => {
    localStorage.setItem('tradingPlanGoals', JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem('tradingPlanAccountSize', accountSize.toString());
  }, [accountSize]);

  useEffect(() => {
    localStorage.setItem('tradingPlanMaxRisk', maxRiskPerTrade.toString());
  }, [maxRiskPerTrade]);

  // Compute trades with market data - no state updates, pure computation
  const tradesWithMarketData = useMemo(() => {
    return trades.map(trade => {
      if (trade.status === 'open' && marketData[trade.symbol]) {
        const currentPrice = marketData[trade.symbol].price;
        const unrealizedPnL = trade.type === 'long' 
          ? (currentPrice - trade.entryPrice) * trade.quantity - (trade.fees || 0)
          : (trade.entryPrice - currentPrice) * trade.quantity - (trade.fees || 0);
        
        return {
          ...trade,
          currentPrice,
          unrealizedPnL,
          marketValue: currentPrice * trade.quantity
        };
      }
      return trade;
    });
  }, [trades, marketData]);

  // Memoize open symbols to prevent unnecessary re-renders
  const openSymbols = useMemo(() => {
    return trades
      .filter(trade => trade.status === 'open')
      .map(trade => trade.symbol);
  }, [trades]);

  // Auto-refresh market data every 30 seconds for open positions
  useEffect(() => {
    if (openSymbols.length === 0) return;
    
    const refreshMarketData = () => {
      fetchMarketData([...new Set(openSymbols)]);
    };
    
    // Initial fetch
    refreshMarketData();
    
    // Set up interval
    const interval = setInterval(refreshMarketData, 30000);
    
    return () => clearInterval(interval);
  }, [openSymbols, fetchMarketData]); // Use memoized openSymbols

  const calculatePerformanceMetrics = useCallback((): PerformanceMetrics => {
    const closedTrades = tradesWithMarketData.filter((t: Trade) => t.status === 'closed');
    const openTrades = tradesWithMarketData.filter((t: Trade) => t.status === 'open');
    
    // Basic P&L calculations
    const totalPnL = closedTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
    const totalFees = tradesWithMarketData.reduce((sum, trade) => sum + (trade.fees || 0), 0);
    const netPnL = totalPnL - totalFees;
    
    // Unrealized P&L from open positions (with real-time market data)
    const unrealizedPnL = openTrades.reduce((sum, trade) => sum + (trade.unrealizedPnL || 0), 0);
    
    // Win/Loss analysis
    const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0);
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
    
    // Average win/loss
    const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
    
    // Profit factor
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;
    
    // Risk metrics
    const totalRisk = trades.reduce((sum, trade) => sum + trade.maxRisk, 0);
    const riskAdjustedReturn = totalRisk > 0 ? (netPnL / totalRisk) * 100 : 0;
    
    // Drawdown calculation
    let runningPnL = 0;
    let peakPnL = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    
    closedTrades.forEach(trade => {
      runningPnL += (trade.pnl || 0);
      if (runningPnL > peakPnL) {
        peakPnL = runningPnL;
      }
      const drawdown = peakPnL - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = peakPnL > 0 ? (drawdown / peakPnL) * 100 : 0;
      }
    });
    
    // Largest win/loss
    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl || 0)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl || 0)) : 0;
    
    // Average hold time
    const tradesWithDuration = closedTrades.filter(t => t.exitDate && t.entryDate);
    const avgHoldTime = tradesWithDuration.length > 0 
      ? tradesWithDuration.reduce((sum, trade) => {
          const entryTime = new Date(`${trade.entryDate}T${trade.entryTime || '09:30:00'}`).getTime();
          const exitTime = new Date(`${trade.exitDate}T${trade.exitTime || '16:00:00'}`).getTime();
          return sum + (exitTime - entryTime);
        }, 0) / tradesWithDuration.length / (1000 * 60 * 60) // in hours
      : 0;
    
    // Sharpe ratio (simplified - using daily returns)
    const dailyReturns = closedTrades.map(trade => (trade.pnl || 0) / accountSize);
    const avgDailyReturn = dailyReturns.length > 0 ? dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length : 0;
    const returnVariance = dailyReturns.length > 0 
      ? dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgDailyReturn, 2), 0) / dailyReturns.length 
      : 0;
    const returnStdDev = Math.sqrt(returnVariance);
    const sharpeRatio = returnStdDev > 0 ? (avgDailyReturn / returnStdDev) * Math.sqrt(252) : 0;
    
    // Calmar ratio
    const calmarRatio = maxDrawdownPercent > 0 ? (netPnL / accountSize * 100) / maxDrawdownPercent : 0;
    
    return {
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalPnL: totalPnL + unrealizedPnL,
      totalFees,
      netPnL: netPnL + unrealizedPnL,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      calmarRatio,
      largestWin,
      largestLoss,
      avgHoldTime,
      totalRisk,
      riskAdjustedReturn
    };
  }, [tradesWithMarketData, accountSize]);

  const performanceMetrics = calculatePerformanceMetrics();

  // Trade management functions
  const addTrade = useCallback((tradeData: Partial<Trade>) => {
    const newTrade: Trade = {
      id: Date.now().toString(),
      symbol: tradeData.symbol || '',
      type: tradeData.type || 'long',
      strategy: tradeData.strategy || '',
      setup: tradeData.setup || '',
      entryPrice: tradeData.entryPrice || 0,
      quantity: tradeData.quantity || 0,
      entryDate: tradeData.entryDate || new Date().toISOString().split('T')[0],
      entryTime: tradeData.entryTime || new Date().toTimeString().split(' ')[0],
      maxRisk: tradeData.maxRisk || (accountSize * maxRiskPerTrade / 100),
      notes: tradeData.notes || '',
      tags: tradeData.tags || [],
      status: 'open',
      fees: tradeData.fees || 2.50,
      stopLoss: tradeData.stopLoss || 0,
      takeProfit: tradeData.takeProfit || 0,
      confidence: tradeData.confidence || 3,
      sentiment: tradeData.sentiment || 'neutral',
      ...tradeData
    };

    setTrades(prev => [...prev, newTrade]);
    
    // Fetch market data for the new symbol
    if (newTrade.status === 'open') {
      fetchMarketData([newTrade.symbol]);
    }
  }, [accountSize, maxRiskPerTrade, fetchMarketData]);

  const updateTrade = useCallback((tradeId: string, updates: Partial<Trade>) => {
    setTrades(prev => prev.map(trade => 
      trade.id === tradeId ? { ...trade, ...updates } : trade
    ));
  }, []);

  const closeTrade = useCallback(async (tradeId: string, exitPrice: number, exitDate?: string, exitTime?: string) => {
    const trade = trades.find(t => t.id === tradeId);
    if (!trade) return;

    const pnl = trade.type === 'long' 
      ? (exitPrice - trade.entryPrice) * trade.quantity - (trade.fees || 0)
      : (trade.entryPrice - exitPrice) * trade.quantity - (trade.fees || 0);
    
    const pnlPercent = ((pnl / (trade.entryPrice * trade.quantity)) * 100);

    updateTrade(tradeId, {
      exitPrice,
      exitDate: exitDate || new Date().toISOString().split('T')[0],
      exitTime: exitTime || new Date().toTimeString().split(' ')[0],
      pnl,
      pnlPercent,
      status: 'closed'
    });

    // Goals will be updated automatically by the useEffect that watches trades
  }, [trades, updateTrade]);

  const deleteTrade = useCallback((tradeId: string) => {
    setTrades(prev => prev.filter(trade => trade.id !== tradeId));
  }, []);

  // Goal management functions
  const addGoal = useCallback((goalData: Partial<TradingGoal>) => {
    const newGoal: TradingGoal = {
      id: Date.now().toString(),
      title: goalData.title || '',
      description: goalData.description || '',
      category: goalData.category || 'performance',
      target: goalData.target || 0,
      targetValue: goalData.targetValue || goalData.target || 0,
      current: 0,
      currentValue: 0,
      progress: 0,
      unit: goalData.unit || '$',
      deadline: goalData.deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      period: goalData.period || 'monthly',
      type: goalData.type || 'profit',
      createdDate: new Date().toISOString(),
      targetDate: goalData.targetDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: true,
      ...goalData
    };

    setGoals(prev => [...prev, newGoal]);
  }, []);



  // Update goal progress whenever trades change
  useEffect(() => {
    const now = new Date();
    const performanceMetrics = calculatePerformanceMetrics();
    
    setGoals(prevGoals => prevGoals.map(goal => {
      let current = 0;
      
      // Filter trades based on goal period
      const relevantTrades = trades.filter(trade => {
        const tradeDate = new Date(trade.entryDate);
        
        switch (goal.period) {
          case 'daily':
            return tradeDate.toDateString() === now.toDateString();
          case 'weekly':
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            return tradeDate >= weekStart;
          case 'monthly':
            return tradeDate.getMonth() === now.getMonth() && tradeDate.getFullYear() === now.getFullYear();
          case 'yearly':
            return tradeDate.getFullYear() === now.getFullYear();
          default:
            return false;
        }
      });

      // Calculate current progress based on goal type
      switch (goal.type) {
        case 'profit':
          current = relevantTrades
            .filter(t => t.status === 'closed')
            .reduce((sum, trade) => sum + (trade.pnl || 0), 0);
          break;
        case 'winRate':
          const closedTrades = relevantTrades.filter(t => t.status === 'closed');
          const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
          current = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
          break;
        case 'trades':
          current = relevantTrades.length;
          break;
        case 'maxDrawdown':
          current = performanceMetrics.maxDrawdownPercent;
          break;
        case 'sharpeRatio':
          current = performanceMetrics.sharpeRatio;
          break;
      }

      return { ...goal, current };
    }));
  }, [trades, tradesWithMarketData]); // Depend on actual data, not callbacks

  const AddTradeModal = () => {
    const [formData, setFormData] = useState({
      symbol: editingTrade?.symbol || '',
      type: editingTrade?.type || 'long',
      strategy: editingTrade?.strategy || '',
      setup: editingTrade?.setup || '',
      entryPrice: editingTrade?.entryPrice || 0,
      quantity: editingTrade?.quantity || 0,
      stopLoss: editingTrade?.stopLoss || 0,
      takeProfit: editingTrade?.takeProfit || 0,
      maxRisk: editingTrade?.maxRisk || (accountSize * maxRiskPerTrade / 100),
      notes: editingTrade?.notes || '',
      tags: editingTrade?.tags?.join(', ') || '',
      confidence: editingTrade?.confidence || 3,
      sentiment: editingTrade?.sentiment || 'neutral',
      // Options-specific fields
      isOptions: editingTrade?.isOptions || false,
      strike: editingTrade?.strike || 0,
      expiry: editingTrade?.expiry || '',
      optionType: editingTrade?.optionType || 'call',
      contractSize: editingTrade?.contractSize || 100,
      premium: editingTrade?.premium || 0,
      impliedVolatility: editingTrade?.impliedVolatility || 0
    });

    const [fetchingPrice, setFetchingPrice] = useState(false);

    const fetchCurrentPrice = async () => {
      if (!formData.symbol) return;
      
      setFetchingPrice(true);
      try {
        const response = await fetch(
          `https://api.polygon.io/v2/last/trade/${formData.symbol.toUpperCase()}?apikey=${POLYGON_API_KEY}`
        );
        const data = await response.json();
        
        if (data.status === 'OK' && data.results) {
          setFormData(prev => ({ ...prev, entryPrice: data.results.p }));
        }
      } catch (error) {
        console.error('Failed to fetch current price:', error);
      } finally {
        setFetchingPrice(false);
      }
    };

    const calculatePositionSize = () => {
      if (formData.entryPrice && formData.stopLoss && formData.maxRisk) {
        const riskPerShare = Math.abs(formData.entryPrice - formData.stopLoss);
        const maxShares = Math.floor(formData.maxRisk / riskPerShare);
        setFormData(prev => ({ ...prev, quantity: maxShares }));
      }
    };

    const handleSubmit = () => {
      const tradeData = {
        ...formData,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
        // Calculate options-specific values if it's an options trade
        ...(formData.isOptions && {
          daysToExpiry: formData.expiry ? Math.max(0, Math.ceil((new Date(formData.expiry).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0,
          intrinsicValue: formData.strike && ['call', 'put'].includes(formData.type) ? 
            (formData.type === 'call' || formData.optionType === 'call' ? 
              Math.max(0, (formData.entryPrice || 0) - formData.strike) :
              Math.max(0, formData.strike - (formData.entryPrice || 0))) : 0,
          timeValue: (formData.premium || 0) - (formData.strike && ['call', 'put'].includes(formData.type) ? 
            (formData.type === 'call' || formData.optionType === 'call' ? 
              Math.max(0, (formData.entryPrice || 0) - formData.strike) :
              Math.max(0, formData.strike - (formData.entryPrice || 0))) : 0)
        })
      };

      if (editingTrade) {
        updateTrade(editingTrade.id, tradeData);
      } else {
        addTrade(tradeData);
      }
      
      setShowAddTrade(false);
      setEditingTrade(null);
      setFormData({
        symbol: '',
        type: 'long',
        strategy: '',
        setup: '',
        entryPrice: 0,
        quantity: 0,
        stopLoss: 0,
        takeProfit: 0,
        maxRisk: accountSize * maxRiskPerTrade / 100,
        notes: '',
        tags: '',
        confidence: 3,
        sentiment: 'neutral',
        isOptions: false,
        strike: 0,
        expiry: '',
        optionType: 'call',
        contractSize: 100,
        premium: 0,
        impliedVolatility: 0
      });
    };

    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border-2 border-orange-500/30 w-full max-w-6xl max-h-[95vh] overflow-y-auto font-mono">
          {/* Bloomberg Terminal Header */}
          <div className="bg-gradient-to-r from-orange-900/30 to-black border-b border-orange-500/30 p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                <h3 className="text-2xl font-bold text-orange-400 uppercase tracking-wider">
                  {editingTrade ? 'MODIFY POSITION' : 'NEW POSITION ENTRY'}
                </h3>
              </div>
              <button 
                onClick={() => {
                  setShowAddTrade(false);
                  setEditingTrade(null);
                }}
                className="text-gray-400 hover:text-white p-2 border border-gray-600 hover:border-red-500 transition-colors"
              >
                <TbX size={20} />
              </button>
            </div>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column - Basic Info */}
              <div className="space-y-4">
                <div className="bg-black/50 border border-gray-700/50 p-4">
                  <h4 className="text-lg font-bold text-blue-400 uppercase tracking-wider mb-4">INSTRUMENT</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-base font-bold text-gray-400 uppercase mb-2">Symbol</label>
                      <div className="flex space-x-2">
                        <input 
                          type="text" 
                          value={formData.symbol}
                          onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                          className="flex-1 bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg font-mono uppercase focus:border-orange-500 focus:outline-none"
                          placeholder="AAPL"
                        />
                        <button
                          onClick={fetchCurrentPrice}
                          disabled={fetchingPrice || !formData.symbol}
                          className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm font-bold border border-blue-500/50"
                        >
                          {fetchingPrice ? <TbRefresh className="animate-spin" size={14} /> : 'PRICE'}
                        </button>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-base font-bold text-gray-400 uppercase mb-2">Trade Type</label>
                      <select 
                        value={formData.type}
                        onChange={(e) => {
                          const selectedType = e.target.value;
                          const isOptionsType = selectedType === 'call' || selectedType === 'put' || selectedType === 'spread';
                          console.log('Selected type:', selectedType, 'Is options:', isOptionsType);
                          setFormData(prev => ({ 
                            ...prev, 
                            type: selectedType as any, 
                            isOptions: isOptionsType 
                          }));
                        }}
                        className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg font-mono focus:border-orange-500 focus:outline-none"
                      >
                        <option value="long">📈 STOCK - LONG</option>
                        <option value="short">📉 STOCK - SHORT</option>
                        <option value="call">🔥 CALL OPTION</option>
                        <option value="put">💥 PUT OPTION</option>
                        <option value="spread">⚡ OPTIONS SPREAD</option>
                      </select>
                    </div>
                    
                    {/* Options-specific fields */}
                    {(formData.type === 'call' || formData.type === 'put' || formData.type === 'spread') && (
                      <div className="md:col-span-3 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-2 border-blue-400/50 p-6 rounded-lg">
                        <h5 className="text-xl font-bold text-blue-400 uppercase tracking-wider mb-4 flex items-center">
                          � OPTIONS CONTRACT DETAILS
                          <span className="ml-3 text-sm text-green-400 bg-green-900/30 px-2 py-1 rounded">ACTIVE</span>
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-base font-bold text-gray-400 uppercase mb-2">Strike Price</label>
                            <input 
                              type="number"
                              step="0.50"
                              value={formData.strike || ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, strike: Number(e.target.value) }))}
                              className="w-full bg-gray-800 border border-gray-600 px-3 py-2 text-white font-mono focus:border-orange-500 focus:outline-none"
                              placeholder="150.00"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-base font-bold text-gray-400 uppercase mb-2">Expiry Date</label>
                            <input 
                              type="date"
                              value={formData.expiry || ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, expiry: e.target.value }))}
                              className="w-full bg-gray-800 border border-gray-600 px-3 py-2 text-white font-mono focus:border-orange-500 focus:outline-none"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-base font-bold text-gray-400 uppercase mb-2">Premium ($)</label>
                            <input 
                              type="number"
                              step="0.01"
                              value={formData.premium || ''}
                              onChange={(e) => {
                                const premium = Number(e.target.value);
                                setFormData(prev => ({ ...prev, premium, entryPrice: premium }));
                              }}
                              className="w-full bg-gray-800 border border-gray-600 px-3 py-2 text-white font-mono focus:border-orange-500 focus:outline-none"
                              placeholder="2.50"
                            />
                            <div className="text-sm text-gray-400 mt-1">Cost per contract</div>
                          </div>
                          
                          <div>
                            <label className="block text-base font-bold text-gray-400 uppercase mb-2">Implied Vol (%)</label>
                            <input 
                              type="number"
                              step="0.1"
                              value={formData.impliedVolatility || ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, impliedVolatility: Number(e.target.value) }))}
                              className="w-full bg-gray-800 border border-gray-600 px-3 py-2 text-white font-mono focus:border-orange-500 focus:outline-none"
                              placeholder="25.0"
                            />
                          </div>
                        </div>
                        
                        {/* Options Calculations */}
                        <div className="bg-black/50 border border-gray-600/30 p-3 mt-3">
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-400">Total Premium:</span>
                              <div className="text-white font-mono font-bold">
                                ${((formData.premium || 0) * (formData.quantity || 0) * 100).toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <span className="text-gray-400">Breakeven:</span>
                              <div className="text-white font-mono font-bold">
                                ${(formData.type === 'call' || formData.optionType === 'call')
                                  ? ((formData.strike || 0) + (formData.premium || 0)).toFixed(2)
                                  : ((formData.strike || 0) - (formData.premium || 0)).toFixed(2)
                                }
                              </div>
                            </div>
                            <div>
                              <span className="text-gray-400">Days to Expiry:</span>
                              <div className="text-white font-mono font-bold">
                                {formData.expiry ? Math.max(0, Math.ceil((new Date(formData.expiry).getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : 0}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-base font-bold text-gray-400 uppercase mb-2">Strategy</label>
                      <input 
                        type="text"
                        value={formData.strategy}
                        onChange={(e) => setFormData(prev => ({ ...prev, strategy: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                        placeholder="Breakout, Mean Reversion, etc."
                      />
                    </div>
                    
                    <div>
                      <label className="block text-base font-bold text-gray-400 uppercase mb-2">Setup</label>
                      <input 
                        type="text"
                        value={formData.setup}
                        onChange={(e) => setFormData(prev => ({ ...prev, setup: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                        placeholder="Bull Flag, Support Bounce, etc."
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Middle Column - Execution */}
              <div className="space-y-4">
                <div className="bg-black/50 border border-gray-700/50 p-4">
                  <h4 className="text-lg font-bold text-green-400 uppercase tracking-wider mb-4">EXECUTION</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-base font-bold text-gray-400 uppercase mb-2">Entry Price</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={formData.entryPrice}
                        onChange={(e) => setFormData(prev => ({ ...prev, entryPrice: Number(e.target.value) }))}
                        className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg font-mono focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-base font-bold text-gray-400 uppercase mb-2">Quantity</label>
                      <input 
                        type="number"
                        value={formData.quantity}
                        onChange={(e) => setFormData(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                        className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg font-mono focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-base font-bold text-gray-400 uppercase mb-2">Stop Loss</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={formData.stopLoss}
                        onChange={(e) => setFormData(prev => ({ ...prev, stopLoss: Number(e.target.value) }))}
                        className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg font-mono focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-base font-bold text-gray-400 uppercase mb-2">Take Profit</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={formData.takeProfit}
                        onChange={(e) => setFormData(prev => ({ ...prev, takeProfit: Number(e.target.value) }))}
                        className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg font-mono focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                    
                    <button
                      onClick={calculatePositionSize}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold py-3 px-4 border border-purple-500/50"
                    >
                      CALCULATE SIZE
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Right Column - Risk & Analysis */}
              <div className="space-y-4">
                <div className="bg-black/50 border border-gray-700/50 p-4">
                  <h4 className="text-lg font-bold text-red-400 uppercase tracking-wider mb-4">RISK MANAGEMENT</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-base font-bold text-gray-400 uppercase mb-2">Max Risk ($)</label>
                      <input 
                        type="number"
                        value={formData.maxRisk}
                        onChange={(e) => setFormData(prev => ({ ...prev, maxRisk: Number(e.target.value) }))}
                        className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg font-mono focus:border-orange-500 focus:outline-none"
                      />
                      <div className="text-sm text-gray-400 mt-1">
                        {((formData.maxRisk / accountSize) * 100).toFixed(2)}% of account
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-base font-bold text-gray-400 uppercase mb-2">Confidence (1-5)</label>
                      <input 
                        type="range"
                        min="1"
                        max="5"
                        value={formData.confidence}
                        onChange={(e) => setFormData(prev => ({ ...prev, confidence: Number(e.target.value) }))}
                        className="w-full"
                      />
                      <div className="text-base text-center text-white font-bold mt-1">{formData.confidence}/5</div>
                    </div>
                    
                    <div>
                      <label className="block text-base font-bold text-gray-400 uppercase mb-2">Sentiment</label>
                      <select 
                        value={formData.sentiment}
                        onChange={(e) => setFormData(prev => ({ ...prev, sentiment: e.target.value as any }))}
                        className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg font-mono focus:border-orange-500 focus:outline-none"
                      >
                        <option value="bullish">BULLISH</option>
                        <option value="neutral">NEUTRAL</option>
                        <option value="bearish">BEARISH</option>
                      </select>
                    </div>
                    
                    {/* Risk Calculations */}
                    <div className="bg-gray-900/50 border border-gray-600/30 p-3 mt-4">
                      <div className="text-xs space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Position Value:</span>
                          <span className="text-white font-mono">${(formData.entryPrice * formData.quantity).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Risk per Share:</span>
                          <span className="text-red-400 font-mono">${Math.abs(formData.entryPrice - formData.stopLoss).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">R:R Ratio:</span>
                          <span className="text-blue-400 font-mono">
                            {formData.entryPrice && formData.stopLoss && formData.takeProfit
                              ? (Math.abs(formData.takeProfit - formData.entryPrice) / Math.abs(formData.entryPrice - formData.stopLoss)).toFixed(2)
                              : '0.00'
                            }:1
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Bottom Section - Notes and Tags */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-base font-bold text-gray-400 uppercase mb-2">Trade Notes</label>
                <textarea 
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg h-32 focus:border-orange-500 focus:outline-none"
                  placeholder="Market conditions, entry reasons, analysis..."
                />
              </div>
              
              <div>
                <label className="block text-base font-bold text-gray-400 uppercase mb-2">Tags</label>
                <input 
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                  placeholder="tech, earnings, swing (comma separated)"
                />
                <div className="text-sm text-gray-400 mt-1">
                  Separate tags with commas
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-700/50">
              <button 
                onClick={() => {
                  setShowAddTrade(false);
                  setEditingTrade(null);
                }}
                className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white text-base font-bold uppercase tracking-wider border border-gray-500/50"
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmit}
                disabled={!formData.symbol || !formData.quantity || 
                  (formData.isOptions ? (!formData.strike || !formData.expiry || !formData.premium) : !formData.entryPrice)}
                className="px-8 py-4 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 disabled:from-gray-600 disabled:to-gray-700 text-white text-base font-bold uppercase tracking-wider border border-orange-500/50 disabled:border-gray-500/50"
              >
                {editingTrade ? 'UPDATE POSITION' : 'ENTER POSITION'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const AddGoalModal = () => {
    const [formData, setFormData] = useState({
      title: editingGoal?.title || '',
      type: editingGoal?.type || 'profit',
      target: editingGoal?.target || 0,
      period: editingGoal?.period || 'monthly',
      description: editingGoal?.description || '',
      category: editingGoal?.category || 'performance',
      unit: editingGoal?.unit || '$',
      deadline: editingGoal?.deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });

    const handleSubmit = () => {
      if (editingGoal) {
        const updatedGoal = {
          ...editingGoal,
          ...formData,
          targetValue: formData.target,
          currentValue: editingGoal.currentValue
        };
        setGoals(prev => prev.map(goal => goal.id === editingGoal.id ? updatedGoal : goal));
      } else {
        const newGoal: TradingGoal = {
          id: Date.now().toString(),
          title: formData.title,
          description: formData.description,
          category: formData.category as 'performance' | 'risk' | 'skill',
          target: formData.target,
          targetValue: formData.target,
          current: 0,
          currentValue: 0,
          progress: 0,
          unit: formData.unit,
          deadline: formData.deadline,
          period: formData.period as 'daily' | 'weekly' | 'monthly' | 'yearly',
          type: formData.type as 'profit' | 'winRate' | 'trades' | 'maxDrawdown' | 'sharpeRatio',
          createdDate: new Date().toISOString().split('T')[0],
          targetDate: formData.deadline,
          isActive: true
        };
        setGoals(prev => [...prev, newGoal]);
      }
      setShowAddGoal(false);
      setEditingGoal(null);
    };

    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border-2 border-orange-500/30 w-full max-w-4xl max-h-[95vh] overflow-y-auto font-mono">
          <div className="bg-gradient-to-r from-orange-900/30 to-black border-b border-orange-500/30 p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                <h3 className="text-2xl font-bold text-orange-400 uppercase tracking-wider">
                  {editingGoal ? 'MODIFY GOAL' : 'NEW TRADING GOAL'}
                </h3>
              </div>
              <button 
                onClick={() => {
                  setShowAddGoal(false);
                  setEditingGoal(null);
                }}
                className="text-gray-400 hover:text-white p-2 border border-gray-600 hover:border-red-500"
              >
                <TbX size={20} />
              </button>
            </div>
          </div>
          
          <div className="p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">Goal Title</label>
                  <input 
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                    placeholder="Achieve 15% Monthly Return"
                  />
                </div>
                
                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">Category</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value as any }))}
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                  >
                    <option value="performance">Performance</option>
                    <option value="risk">Risk Management</option>
                    <option value="skill">Skill Development</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-base font-bold text-gray-400 uppercase mb-2">Description</label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg h-28 focus:border-orange-500 focus:outline-none"
                  placeholder="Detailed description of the goal and success criteria..."
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">Goal Type</label>
                  <select 
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                  >
                    <option value="profit">Profit Target</option>
                    <option value="winRate">Win Rate</option>
                    <option value="trades">Number of Trades</option>
                    <option value="maxDrawdown">Max Drawdown</option>
                    <option value="sharpeRatio">Sharpe Ratio</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">Time Period</label>
                  <select 
                    value={formData.period}
                    onChange={(e) => setFormData(prev => ({ ...prev, period: e.target.value as any }))}
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">Target Value</label>
                  <input 
                    type="number"
                    value={formData.target}
                    onChange={(e) => setFormData(prev => ({ ...prev, target: Number(e.target.value) }))}
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                    placeholder="100"
                  />
                </div>
                
                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">Unit</label>
                  <input 
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                    placeholder="%, $, trades"
                  />
                </div>
                
                <div>
                  <label className="block text-base font-bold text-gray-400 uppercase mb-2">Deadline</label>
                  <input 
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 px-4 py-3 text-white text-lg focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-700/50">
              <button 
                onClick={() => {
                  setShowAddGoal(false);
                  setEditingGoal(null);
                }}
                className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white text-base font-bold uppercase tracking-wider border border-gray-500/50"
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmit}
                disabled={!formData.title || !formData.target}
                className="px-8 py-4 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 disabled:from-gray-600 disabled:to-gray-700 text-white text-base font-bold uppercase tracking-wider border border-orange-500/50 disabled:border-gray-500/50"
              >
                {editingGoal ? 'UPDATE GOAL' : 'CREATE GOAL'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-black text-white font-mono">
      {/* Bloomberg Terminal Header */}
      <div className="border-b border-orange-500/30 bg-gradient-to-r from-black via-gray-900 to-black">
        <div className="p-4">

          
          {/* Tab Navigation - Bloomberg Style */}
          <div className="flex space-x-0 bg-black border border-orange-500/20">
            {[
              { id: 'journal', label: 'POSITIONS', icon: TbActivity, color: 'orange' },
              { id: 'analytics', label: 'ANALYTICS', icon: TbChartLine, color: 'blue' },
              { id: 'goals', label: 'TARGETS', icon: TbTarget, color: 'green' },
              { id: 'settings', label: 'CONFIG', icon: TbSettings, color: 'purple' }
            ].map((tab, index) => {
              const IconComponent = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative flex items-center space-x-2 px-8 py-4 text-base font-bold uppercase tracking-wider transition-all border-r border-orange-500/20 ${
                    isActive
                      ? `bg-gradient-to-b from-${tab.color}-900/30 to-black text-${tab.color}-400 shadow-lg border-b-2 border-${tab.color}-500`
                      : 'text-gray-400 hover:text-white hover:bg-gray-900/50'
                  }`}
                  style={{
                    background: isActive 
                      ? `linear-gradient(to bottom, rgba(${tab.color === 'orange' ? '251, 146, 60' : tab.color === 'blue' ? '59, 130, 246' : tab.color === 'green' ? '34, 197, 94' : '168, 85, 247'}, 0.1), black)`
                      : undefined
                  }}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
                  )}
                  <IconComponent size={14} />
                  <span>{tab.label}</span>
                  {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500"></div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-black">
        {activeTab === 'journal' && (
          <div className="p-4">
            {/* Bloomberg Terminal Action Bar */}
            <div className="flex justify-between items-center mb-6 bg-gradient-to-r from-gray-900 to-black border border-orange-500/20 p-4 rounded">
              <div className="flex space-x-2">
                <button 
                  onClick={() => setShowAddTrade(true)}
                  className="flex items-center space-x-2 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 px-6 py-3 text-base font-bold uppercase tracking-wider border border-orange-400/50 shadow-lg"
                >
                  <TbPlus size={18} />
                  <span>NEW POSITION</span>
                </button>
                <button 
                  onClick={() => fetchMarketData(trades.filter(t => t.status === 'open').map(t => t.symbol))}
                  className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wider border border-blue-400/50"
                >
                  <TbRefresh size={14} />
                  <span>REFRESH</span>
                </button>
                <button className="flex items-center space-x-2 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 px-4 py-2 text-xs font-bold uppercase tracking-wider border border-gray-500/50">
                  <TbFilter size={14} />
                  <span>FILTER</span>
                </button>
                <button className="flex items-center space-x-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 px-4 py-2 text-xs font-bold uppercase tracking-wider border border-green-400/50">
                  <TbDownload size={14} />
                  <span>EXPORT</span>
                </button>
              </div>
              
              <div className="flex items-center space-x-4 text-xs">
                <div className="text-gray-400">ACCOUNT:</div>
                <div className="text-orange-400 font-bold">${accountSize.toLocaleString()}</div>
                <div className="text-gray-400">|</div>
                <div className="text-gray-400">RISK:</div>
                <div className="text-red-400 font-bold">{maxRiskPerTrade}%</div>
              </div>
            </div>

            {/* Bloomberg Terminal Performance Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-orange-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-orange-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-orange-400 font-bold uppercase tracking-wider mb-2">NET P&L</div>
                <div className={`text-4xl font-bold font-mono ${performanceMetrics.netPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {performanceMetrics.netPnL >= 0 ? '+' : ''}${performanceMetrics.netPnL.toFixed(2)}
                </div>
                <div className="text-base text-gray-500 mt-2">
                  {((performanceMetrics.netPnL / accountSize) * 100).toFixed(2)}% Account
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-blue-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-blue-400 font-bold uppercase tracking-wider mb-2">WIN RATE</div>
                <div className="text-4xl font-bold font-mono text-blue-400">
                  {performanceMetrics.winRate.toFixed(1)}%
                </div>
                <div className="text-base text-gray-500 mt-2">
                  {performanceMetrics.winningTrades}W / {performanceMetrics.losingTrades}L
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-purple-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-purple-400 font-bold uppercase tracking-wider mb-2">PROFIT FACTOR</div>
                <div className="text-4xl font-bold font-mono text-purple-400">
                  {performanceMetrics.profitFactor.toFixed(2)}
                </div>
                <div className="text-base text-gray-500 mt-2">
                  Risk Adjusted
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-green-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-green-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-green-400 font-bold uppercase tracking-wider mb-2">SHARPE RATIO</div>
                <div className="text-4xl font-bold font-mono text-green-400">
                  {performanceMetrics.sharpeRatio.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Risk Return
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-red-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-red-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-red-400 font-bold uppercase tracking-wider mb-2">MAX DD</div>
                <div className="text-4xl font-bold font-mono text-red-400">
                  -{performanceMetrics.maxDrawdownPercent.toFixed(1)}%
                </div>
                <div className="text-base text-gray-500 mt-2">
                  ${performanceMetrics.maxDrawdown.toFixed(0)}
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-yellow-500/30 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-yellow-500/10 to-transparent rounded-full -mr-8 -mt-8"></div>
                <div className="text-base text-yellow-400 font-bold uppercase tracking-wider mb-2">TOTAL TRADES</div>
                <div className="text-4xl font-bold font-mono text-yellow-400">
                  {performanceMetrics.totalTrades}
                </div>
                <div className="text-base text-gray-500 mt-2">
                  {trades.filter(t => t.status === 'open').length} Open
                </div>
              </div>
            </div>

            {/* Bloomberg Terminal Trades Table */}
            <div className="bg-black border border-orange-500/20 overflow-hidden">
              {/* Table Header */}
              <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border-b border-orange-500/30 p-2">
                <h3 className="text-xl font-bold text-orange-400 uppercase tracking-wider">ACTIVE POSITIONS & TRADE HISTORY</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-base font-mono">
                  <thead className="bg-gradient-to-r from-gray-800 via-black to-gray-800 border-b border-orange-500/30">
                    <tr>
                      <th className="px-4 py-4 text-left text-lg font-bold text-orange-400 uppercase tracking-wider">SYMBOL</th>
                      <th className="px-4 py-4 text-left text-lg font-bold text-orange-400 uppercase tracking-wider">SIDE</th>
                      <th className="px-4 py-4 text-left text-lg font-bold text-orange-400 uppercase tracking-wider">QTY</th>
                      <th className="px-4 py-4 text-left text-lg font-bold text-orange-400 uppercase tracking-wider">ENTRY</th>
                      <th className="px-4 py-4 text-left text-lg font-bold text-orange-400 uppercase tracking-wider">CURRENT</th>
                      <th className="px-4 py-4 text-left text-lg font-bold text-orange-400 uppercase tracking-wider">P&L</th>
                      <th className="px-4 py-4 text-left text-lg font-bold text-orange-400 uppercase tracking-wider">%</th>
                      <th className="px-4 py-4 text-left text-lg font-bold text-orange-400 uppercase tracking-wider">RISK</th>
                      <th className="px-4 py-4 text-left text-lg font-bold text-orange-400 uppercase tracking-wider">STATUS</th>
                      <th className="px-4 py-4 text-left text-lg font-bold text-orange-400 uppercase tracking-wider">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {tradesWithMarketData.map((trade, index) => {
                      const isOpen = trade.status === 'open';
                      const currentPrice = trade.currentPrice || marketData[trade.symbol]?.price;
                      const unrealizedPnL = trade.unrealizedPnL || 0;
                      const realizedPnL = trade.pnl || 0;
                      const totalPnL = isOpen ? unrealizedPnL : realizedPnL;
                      const pnlPercent = isOpen 
                        ? (currentPrice ? ((currentPrice - trade.entryPrice) / trade.entryPrice * 100 * (trade.type === 'long' ? 1 : -1)) : 0)
                        : (trade.pnlPercent || 0);
                      
                      return (
                        <tr 
                          key={trade.id} 
                          className={`hover:bg-gray-900/50 transition-colors ${
                            isOpen ? 'bg-gradient-to-r from-blue-900/10 to-transparent border-l-2 border-blue-500' : ''
                          }`}
                        >
                          <td className="px-3 py-3">
                            <div className="flex items-center space-x-2">
                              <div className="font-bold text-white">{trade.symbol}</div>
                              {marketData[trade.symbol] && (
                                <div className={`w-2 h-2 rounded-full ${
                                  marketData[trade.symbol].changePercent >= 0 ? 'bg-green-500' : 'bg-red-500'
                                } animate-pulse`}></div>
                              )}
                            </div>
                            {trade.isOptions && (
                              <div className="text-xs text-blue-400 font-mono">
                                {trade.strike && trade.expiry && (
                                  `$${trade.strike} ${trade.optionType?.toUpperCase()} ${new Date(trade.expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                )}
                              </div>
                            )}
                            <div className="text-gray-400 text-xs">{trade.strategy}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div className={`inline-flex items-center px-2 py-1 text-xs font-bold border ${
                              ['long', 'call'].includes(trade.type)
                                ? 'text-green-400 border-green-500/50 bg-green-900/20' 
                                : ['short', 'put'].includes(trade.type)
                                ? 'text-red-400 border-red-500/50 bg-red-900/20'
                                : 'text-blue-400 border-blue-500/50 bg-blue-900/20'
                            }`}>
                              {['long', 'call'].includes(trade.type) ? <TbArrowUp size={10} className="mr-1" /> : 
                               ['short', 'put'].includes(trade.type) ? <TbArrowDown size={10} className="mr-1" /> :
                               <TbTrendingUp size={10} className="mr-1" />}
                              {trade.type.toUpperCase()}
                            </div>
                            {trade.isOptions && trade.delta && (
                              <div className="text-xs text-gray-400 mt-1">
                                Δ {trade.delta.toFixed(2)}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-white font-bold">{trade.quantity.toLocaleString()}</div>
                            <div className="text-xs text-gray-400">
                              {trade.isOptions ? 'contracts' : 'shares'}
                            </div>
                            {trade.isOptions && trade.contractSize && (
                              <div className="text-xs text-blue-400">
                                {(trade.quantity * trade.contractSize).toLocaleString()} underlying
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-white font-mono">${trade.entryPrice.toFixed(2)}</td>
                          <td className="px-3 py-3">
                            {isOpen && currentPrice ? (
                              <div className="font-mono">
                                <div className="text-white font-bold">${currentPrice.toFixed(2)}</div>
                                {marketData[trade.symbol] && (
                                  <div className={`text-xs ${
                                    marketData[trade.symbol].changePercent >= 0 ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {marketData[trade.symbol].changePercent >= 0 ? '+' : ''}{marketData[trade.symbol].changePercent.toFixed(2)}%
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-gray-500 font-mono">
                                {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '--'}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className={`font-bold font-mono ${
                              totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                            </div>
                            {isOpen && (
                              <div className="text-xs text-gray-400">UNREALIZED</div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className={`font-bold font-mono ${
                              pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-red-400 font-mono">
                              ${trade.maxRisk.toFixed(0)}
                            </div>
                            <div className="text-xs text-gray-400">
                              {((trade.maxRisk / accountSize) * 100).toFixed(1)}%
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className={`inline-flex items-center px-2 py-1 text-xs font-bold border ${
                              trade.status === 'open' 
                                ? 'text-blue-400 border-blue-500/50 bg-blue-900/20 animate-pulse' :
                              trade.status === 'closed' 
                                ? 'text-gray-400 border-gray-500/50 bg-gray-900/20' :
                                'text-yellow-400 border-yellow-500/50 bg-yellow-900/20'
                            }`}>
                              {trade.status.toUpperCase()}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex space-x-1">
                              <button 
                                onClick={() => {
                                  setSelectedTrade(trade);
                                  setShowTradeDetails(true);
                                }}
                                className="p-1 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 border border-blue-500/30 transition-colors"
                                title="View Details"
                              >
                                <TbEye size={12} />
                              </button>
                              <button 
                                onClick={() => {
                                  setEditingTrade(trade);
                                  setShowAddTrade(true);
                                }}
                                className="p-1 text-orange-400 hover:text-orange-300 hover:bg-orange-900/20 border border-orange-500/30 transition-colors"
                                title="Edit Trade"
                              >
                                <TbEdit size={12} />
                              </button>
                              {trade.status === 'open' && (
                                <button 
                                  onClick={() => {
                                    const exitPrice = currentPrice || trade.entryPrice;
                                    closeTrade(trade.id, exitPrice);
                                  }}
                                  className="p-1 text-green-400 hover:text-green-300 hover:bg-green-900/20 border border-green-500/30 transition-colors"
                                  title="Close Position"
                                >
                                  <TbCheck size={12} />
                                </button>
                              )}
                              <button 
                                onClick={() => deleteTrade(trade.id)}
                                className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-500/30 transition-colors"
                                title="Delete Trade"
                              >
                                <TbTrash size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                
                {trades.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <TbActivity size={80} className="mx-auto mb-6 opacity-50" />
                    <p className="text-4xl font-bold uppercase tracking-wider">NO POSITIONS</p>
                    <p className="text-xl mt-4">Add your first trade to start tracking performance</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {/* Equity Curve */}
              <div className="lg:col-span-2 bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-orange-500/30 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wider">EQUITY CURVE</h3>
                  <div className="text-xs text-gray-400">REAL-TIME</div>
                </div>
                <div className="h-64 bg-black border border-gray-700/50 rounded flex items-center justify-center relative overflow-hidden">
                  {/* Simulated Chart */}
                  <div className="absolute inset-0 p-4">
                    <svg width="100%" height="100%" className="text-green-400">
                      <defs>
                        <linearGradient id="equityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="currentColor" stopOpacity="0.3"/>
                          <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      {/* Generate equity curve path */}
                      <path
                        d={(() => {
                          let value = 50;
                          let path = `M 0 ${value}`;
                          for (let i = 1; i <= 100; i++) {
                            value += (Math.random() - 0.4) * 8;
                            value = Math.max(10, Math.min(90, value));
                            path += ` L ${i * 2} ${value}`;
                          }
                          return path;
                        })()}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="drop-shadow-lg"
                      />
                      <path
                        d={(() => {
                          let value = 50;
                          let path = `M 0 ${value}`;
                          for (let i = 1; i <= 100; i++) {
                            value += (Math.random() - 0.4) * 8;
                            value = Math.max(10, Math.min(90, value));
                            path += ` L ${i * 2} ${value}`;
                          }
                          path += ` L 200 100 L 0 100 Z`;
                          return path;
                        })()}
                        fill="url(#equityGradient)"
                        className="opacity-60"
                      />
                    </svg>
                  </div>
                  <div className="absolute bottom-2 right-2 text-xs text-green-400 font-mono">
                    ${performanceMetrics.netPnL >= 0 ? '+' : ''}{performanceMetrics.netPnL.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-blue-500/30 p-6">
                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-4">RISK ANALYTICS</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-xs text-gray-400 uppercase">Max Drawdown</span>
                    <span className="text-red-400 font-bold font-mono">-{performanceMetrics.maxDrawdownPercent.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-xs text-gray-400 uppercase">Sharpe Ratio</span>
                    <span className="text-green-400 font-bold font-mono">{performanceMetrics.sharpeRatio.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-xs text-gray-400 uppercase">Calmar Ratio</span>
                    <span className="text-blue-400 font-bold font-mono">{performanceMetrics.calmarRatio.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-xs text-gray-400 uppercase">Avg Win</span>
                    <span className="text-green-400 font-bold font-mono">${performanceMetrics.avgWin.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-xs text-gray-400 uppercase">Avg Loss</span>
                    <span className="text-red-400 font-bold font-mono">-${performanceMetrics.avgLoss.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-xs text-gray-400 uppercase">Best Trade</span>
                    <span className="text-green-400 font-bold font-mono">+${performanceMetrics.largestWin.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-xs text-gray-400 uppercase">Worst Trade</span>
                    <span className="text-red-400 font-bold font-mono">${performanceMetrics.largestLoss.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Strategy Performance */}
              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-purple-500/30 p-6">
                <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider mb-4">STRATEGY BREAKDOWN</h3>
                <div className="space-y-3">
                  {(() => {
                    const strategies = [...new Set(trades.map(t => t.strategy))];
                    return strategies.map(strategy => {
                      const strategyTrades = trades.filter(t => t.strategy === strategy && t.status === 'closed');
                      const strategyPnL = strategyTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
                      const strategyWins = strategyTrades.filter(t => (t.pnl || 0) > 0).length;
                      const strategyWinRate = strategyTrades.length > 0 ? (strategyWins / strategyTrades.length) * 100 : 0;
                      
                      return (
                        <div key={strategy} className="bg-black/50 border border-gray-700/50 p-3 rounded">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-white font-bold text-sm uppercase">{strategy}</span>
                            <span className={`text-xs font-bold ${strategyPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {strategyPnL >= 0 ? '+' : ''}${strategyPnL.toFixed(0)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>{strategyTrades.length} trades</span>
                            <span>{strategyWinRate.toFixed(0)}% win rate</span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Monthly Performance Heatmap */}
              <div className="lg:col-span-2 bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-green-500/30 p-6">
                <h3 className="text-sm font-bold text-green-400 uppercase tracking-wider mb-4">MONTHLY PERFORMANCE</h3>
                <div className="grid grid-cols-6 gap-2">
                  {Array.from({ length: 12 }, (_, i) => {
                    const monthTrades = trades.filter(trade => {
                      const tradeDate = new Date(trade.entryDate);
                      return tradeDate.getMonth() === i && trade.status === 'closed';
                    });
                    const monthPnL = monthTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
                    
                    return (
                      <div key={i} className={`p-3 text-center text-xs border relative overflow-hidden ${
                        monthPnL > 1000 ? 'bg-green-900/60 border-green-500/50 text-green-300' :
                        monthPnL > 0 ? 'bg-green-900/30 border-green-500/30 text-green-400' :
                        monthPnL < -1000 ? 'bg-red-900/60 border-red-500/50 text-red-300' :
                        monthPnL < 0 ? 'bg-red-900/30 border-red-500/30 text-red-400' :
                        'bg-gray-800/50 border-gray-600/30 text-gray-400'
                      }`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent"></div>
                        <div className="relative">
                          <div className="font-bold">
                            {new Date(2024, i).toLocaleDateString('en', { month: 'short' })}
                          </div>
                          <div className="font-mono mt-1">
                            {monthPnL >= 0 ? '+' : ''}${monthPnL.toFixed(0)}
                          </div>
                          <div className="text-xs opacity-60 mt-1">
                            {monthTrades.length} trades
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Time Analysis */}
              <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-yellow-500/30 p-6">
                <h3 className="text-sm font-bold text-yellow-400 uppercase tracking-wider mb-4">TIME ANALYSIS</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-xs text-gray-400 uppercase">Avg Hold Time</span>
                    <span className="text-white font-bold font-mono">{performanceMetrics.avgHoldTime.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-xs text-gray-400 uppercase">Total Fees</span>
                    <span className="text-red-400 font-bold font-mono">${performanceMetrics.totalFees.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-800">
                    <span className="text-xs text-gray-400 uppercase">Risk Adjusted</span>
                    <span className="text-blue-400 font-bold font-mono">{performanceMetrics.riskAdjustedReturn.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-xs text-gray-400 uppercase">Open Positions</span>
                    <span className="text-orange-400 font-bold font-mono">{trades.filter(t => t.status === 'open').length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'goals' && (
          <div className="p-6">
            {/* Goals Header */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center space-x-3">
                <TbTarget className="text-orange-400" size={24} />
                <h3 className="text-xl font-bold text-white">TRADING GOALS</h3>
              </div>
              <button
                onClick={() => setShowAddGoal(true)}
                className="bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white px-4 py-2 text-sm font-bold uppercase tracking-wider border border-orange-500/50"
              >
                ADD GOAL
              </button>
            </div>

            {/* Goal Categories */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Performance Goals */}
              <div className="bg-black/50 border border-gray-700/50 p-4">
                <h4 className="text-sm font-bold text-green-400 uppercase tracking-wider mb-4">PERFORMANCE</h4>
                <div className="space-y-3">
                  {goals.filter(g => g.category === 'performance').map(goal => (
                    <div key={goal.id} className="bg-gray-900/50 border border-gray-600/30 p-3">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-white text-sm font-medium">{goal.title}</span>
                        <button
                          onClick={() => {
                            setEditingGoal(goal);
                            setShowAddGoal(true);
                          }}
                          className="text-gray-400 hover:text-white"
                        >
                          <TbEdit size={16} />
                        </button>
                      </div>
                      <div className="text-xs text-gray-400 mb-2">{goal.description}</div>
                      
                      <div className="mb-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">Progress</span>
                          <span className="text-white font-mono">{goal.currentValue}/{goal.targetValue} {goal.unit}</span>
                        </div>
                        <div className="w-full bg-gray-800 h-2">
                          <div 
                            className={`h-2 ${goal.progress >= 100 ? 'bg-green-500' : goal.progress >= 75 ? 'bg-blue-500' : goal.progress >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(goal.progress, 100)}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Due: {new Date(goal.deadline).toLocaleDateString()}</span>
                        <span className={`font-bold ${goal.progress >= 100 ? 'text-green-400' : goal.progress >= 75 ? 'text-blue-400' : goal.progress >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {goal.progress.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Management Goals */}
              <div className="bg-black/50 border border-gray-700/50 p-4">
                <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-4">RISK MANAGEMENT</h4>
                <div className="space-y-3">
                  {goals.filter(g => g.category === 'risk').map(goal => (
                    <div key={goal.id} className="bg-gray-900/50 border border-gray-600/30 p-3">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-white text-sm font-medium">{goal.title}</span>
                        <button
                          onClick={() => {
                            setEditingGoal(goal);
                            setShowAddGoal(true);
                          }}
                          className="text-gray-400 hover:text-white"
                        >
                          <TbEdit size={16} />
                        </button>
                      </div>
                      <div className="text-xs text-gray-400 mb-2">{goal.description}</div>
                      
                      <div className="mb-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">Progress</span>
                          <span className="text-white font-mono">{goal.currentValue}/{goal.targetValue} {goal.unit}</span>
                        </div>
                        <div className="w-full bg-gray-800 h-2">
                          <div 
                            className={`h-2 ${goal.progress >= 100 ? 'bg-green-500' : goal.progress >= 75 ? 'bg-blue-500' : goal.progress >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(goal.progress, 100)}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Due: {new Date(goal.deadline).toLocaleDateString()}</span>
                        <span className={`font-bold ${goal.progress >= 100 ? 'text-green-400' : goal.progress >= 75 ? 'text-blue-400' : goal.progress >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {goal.progress.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Skill Development Goals */}
              <div className="bg-black/50 border border-gray-700/50 p-4">
                <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-4">SKILL DEVELOPMENT</h4>
                <div className="space-y-3">
                  {goals.filter(g => g.category === 'skill').map(goal => (
                    <div key={goal.id} className="bg-gray-900/50 border border-gray-600/30 p-3">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-white text-sm font-medium">{goal.title}</span>
                        <button
                          onClick={() => {
                            setEditingGoal(goal);
                            setShowAddGoal(true);
                          }}
                          className="text-gray-400 hover:text-white"
                        >
                          <TbEdit size={16} />
                        </button>
                      </div>
                      <div className="text-xs text-gray-400 mb-2">{goal.description}</div>
                      
                      <div className="mb-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">Progress</span>
                          <span className="text-white font-mono">{goal.currentValue}/{goal.targetValue} {goal.unit}</span>
                        </div>
                        <div className="w-full bg-gray-800 h-2">
                          <div 
                            className={`h-2 ${goal.progress >= 100 ? 'bg-green-500' : goal.progress >= 75 ? 'bg-blue-500' : goal.progress >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(goal.progress, 100)}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Due: {new Date(goal.deadline).toLocaleDateString()}</span>
                        <span className={`font-bold ${goal.progress >= 100 ? 'text-green-400' : goal.progress >= 75 ? 'text-blue-400' : goal.progress >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {goal.progress.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Goals Summary */}
            <div className="bg-black/50 border border-gray-700/50 p-6">
              <h4 className="text-sm font-bold text-orange-400 uppercase tracking-wider mb-4">GOALS OVERVIEW</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white mb-1">{goals.length}</div>
                  <div className="text-xs text-gray-400 uppercase">Total Goals</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400 mb-1">
                    {goals.filter(g => g.progress >= 100).length}
                  </div>
                  <div className="text-xs text-gray-400 uppercase">Completed</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400 mb-1">
                    {goals.filter(g => g.progress >= 50 && g.progress < 100).length}
                  </div>
                  <div className="text-xs text-gray-400 uppercase">In Progress</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400 mb-1">
                    {goals.filter(g => new Date(g.deadline) < new Date() && g.progress < 100).length}
                  </div>
                  <div className="text-xs text-gray-400 uppercase">Overdue</div>
                </div>
              </div>
              
              {/* Progress Chart */}
              <div className="mt-6">
                <div className="text-sm text-gray-400 mb-2">Overall Goal Completion</div>
                <div className="w-full bg-gray-800 h-4 rounded">
                  <div 
                    className="h-4 bg-gradient-to-r from-orange-500 to-orange-600 rounded"
                    style={{ 
                      width: `${goals.length > 0 ? (goals.reduce((acc, g) => acc + g.progress, 0) / goals.length) : 0}%` 
                    }}
                  />
                </div>
                <div className="text-xs text-right text-white mt-1">
                  {goals.length > 0 ? (goals.reduce((acc, g) => acc + g.progress, 0) / goals.length).toFixed(1) : 0}% Average Completion
                </div>
              </div>
            </div>
          </div>
        )}



        {activeTab === 'settings' && (
          <div className="p-6">
            {/* Settings Header */}
            <div className="flex items-center space-x-3 mb-6">
              <TbSettings className="text-orange-400" size={24} />
              <h3 className="text-xl font-bold text-white">SYSTEM CONFIGURATION</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Account Settings */}
              <div className="bg-black/50 border border-gray-700/50 p-6">
                <h4 className="text-sm font-bold text-green-400 uppercase tracking-wider mb-4">ACCOUNT PARAMETERS</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Account Size ($)</label>
                    <input 
                      type="number"
                      value={accountSize}
                      onChange={(e) => setAccountSize(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-600 px-3 py-2 text-white font-mono focus:border-orange-500 focus:outline-none"
                    />
                    <div className="text-xs text-gray-400 mt-1">Total trading capital available</div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Max Risk Per Trade (%)</label>
                    <input 
                      type="number"
                      step="0.1"
                      value={maxRiskPerTrade}
                      onChange={(e) => setMaxRiskPerTrade(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-600 px-3 py-2 text-white font-mono focus:border-orange-500 focus:outline-none"
                    />
                    <div className="text-xs text-gray-400 mt-1">
                      Max ${((accountSize * maxRiskPerTrade) / 100).toFixed(0)} per trade
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Commission Per Trade ($)</label>
                    <input 
                      type="number"
                      step="0.01"
                      className="w-full bg-gray-800 border border-gray-600 px-3 py-2 text-white font-mono focus:border-orange-500 focus:outline-none"
                      placeholder="0.65"
                    />
                    <div className="text-xs text-gray-400 mt-1">Round-trip commission cost</div>
                  </div>
                </div>
              </div>

              {/* Risk Management */}
              <div className="bg-black/50 border border-gray-700/50 p-6">
                <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-4">RISK CONTROLS</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Daily Loss Limit ($)</label>
                    <input 
                      type="number"
                      className="w-full bg-gray-800 border border-gray-600 px-3 py-2 text-white font-mono focus:border-orange-500 focus:outline-none"
                      placeholder="1000"
                    />
                    <div className="text-xs text-gray-400 mt-1">Stop trading when hit</div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Max Open Positions</label>
                    <input 
                      type="number"
                      className="w-full bg-gray-800 border border-gray-600 px-3 py-2 text-white font-mono focus:border-orange-500 focus:outline-none"
                      placeholder="5"
                    />
                    <div className="text-xs text-gray-400 mt-1">Maximum concurrent trades</div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Portfolio Heat (%)</label>
                    <input 
                      type="number"
                      step="0.1"
                      className="w-full bg-gray-800 border border-gray-600 px-3 py-2 text-white font-mono focus:border-orange-500 focus:outline-none"
                      placeholder="10.0"
                    />
                    <div className="text-xs text-gray-400 mt-1">Max total portfolio risk</div>
                  </div>
                </div>
              </div>

              {/* Data Management */}
              <div className="bg-black/50 border border-gray-700/50 p-6">
                <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-4">DATA EXPORT</h4>
                
                <div className="space-y-3">
                  <button className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white px-4 py-3 text-sm font-bold uppercase tracking-wider border border-blue-500/50">
                    Export Trades (CSV)
                  </button>
                  
                  <button className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white px-4 py-3 text-sm font-bold uppercase tracking-wider border border-green-500/50">
                    Tax Report (PDF)
                  </button>
                  
                  <button className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white px-4 py-3 text-sm font-bold uppercase tracking-wider border border-purple-500/50">
                    Performance Report
                  </button>
                  
                  <button className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-4 py-3 text-sm font-bold uppercase tracking-wider border border-gray-500/50">
                    Backup Data
                  </button>
                </div>
              </div>

              {/* API Configuration */}
              <div className="bg-black/50 border border-gray-700/50 p-6">
                <h4 className="text-sm font-bold text-yellow-400 uppercase tracking-wider mb-4">API SETTINGS</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Update Frequency (sec)</label>
                    <select className="w-full bg-gray-800 border border-gray-600 px-3 py-2 text-white font-mono focus:border-orange-500 focus:outline-none">
                      <option value="30">30 seconds</option>
                      <option value="60">1 minute</option>
                      <option value="300">5 minutes</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Market Hours Only</label>
                    <div className="flex items-center space-x-3">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 text-orange-500 bg-gray-800 border-gray-600 focus:ring-orange-500"
                      />
                      <span className="text-white text-sm">Only update during market hours</span>
                    </div>
                  </div>
                  
                  <div className="bg-gray-900/50 border border-gray-600/30 p-3 mt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">API STATUS</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-green-400 font-bold">CONNECTED</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Last update: {new Date().toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* System Information */}
            <div className="bg-black/50 border border-gray-700/50 p-6 mt-6">
              <h4 className="text-sm font-bold text-orange-400 uppercase tracking-wider mb-4">SYSTEM STATUS</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white mb-1">{trades.length}</div>
                  <div className="text-xs text-gray-400 uppercase">Total Trades</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400 mb-1">
                    {trades.filter(t => t.status === 'open').length}
                  </div>
                  <div className="text-xs text-gray-400 uppercase">Open Positions</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400 mb-1">
                    {(Object.keys(marketData).length * 100 / Math.max(trades.length, 1)).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-400 uppercase">Data Coverage</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400 mb-1">
                    {goals.length}
                  </div>
                  <div className="text-xs text-gray-400 uppercase">Active Goals</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddTrade && <AddTradeModal />}
      {showAddGoal && <AddGoalModal />}
    </div>
  );
};

export default TradingPlan;