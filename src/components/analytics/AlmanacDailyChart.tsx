'use client';

import React, { useState, useEffect, useRef } from 'react';
import '../../app/almanac.css';
import { AlmanacService, IndexSeasonalData } from '../../lib/almanacService';
import AlmanacCalendar from './AlmanacCalendar';
import WeeklyScanTable from './WeeklyScanTable';

interface AlmanacDailyChartProps {
  month?: number;
  showPostElection?: boolean;
  onMonthChange?: (month: number) => void;
  symbol?: string;
}

interface PriceData {
  date: Date;
  close: number;
  high: number;
  low: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const AlmanacDailyChart: React.FC<AlmanacDailyChartProps> = ({
  month = new Date().getMonth(),
  showPostElection = true,
  onMonthChange,
  symbol = 'SPY'
}) => {
  const isIndex = ['SPY', 'QQQ', 'DIA', 'IWM'].includes(symbol);
  const [seasonalData, setSeasonalData] = useState<IndexSeasonalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [showRecentYears, setShowRecentYears] = useState(true);
  const [showPostElectionYears, setShowPostElectionYears] = useState(true);
  const [activeView, setActiveView] = useState<'chart' | 'calendar' | 'table'>('chart');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; offset: number } | null>(null);
  const [showEventPerformance, setShowEventPerformance] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [isEventsDropdownOpen, setIsEventsDropdownOpen] = useState(false);
  const [eventPerformanceData, setEventPerformanceData] = useState<{ date: Date, avgReturn: number, tradingDay: number }[]>([]);

  // Pattern Analysis states
  const [showPatternPerformance, setShowPatternPerformance] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<string[]>([]); // Array for multiple patterns
  const [isPatternDropdownOpen, setIsPatternDropdownOpen] = useState(false);
  const [patternPerformanceData, setPatternPerformanceData] = useState<{
    patternName: string;
    data: { date: Date, avgReturn: number, tradingDay: number }[];
    occurrences: number;
    color: string;
    occurrenceDetails: { date: Date, priceAtEvent: number, changePercent?: number }[];
  }[]>([]);
  const [showPatternDetails, setShowPatternDetails] = useState(false);

  const almanacService = new AlmanacService();

  useEffect(() => {
    setSelectedMonth(month);
  }, [month]);

  useEffect(() => {
    loadData();
  }, [selectedMonth, symbol, isIndex]);

  useEffect(() => {
    if (seasonalData.length > 0 && canvasRef.current && activeView === 'chart') {
      requestAnimationFrame(() => drawChart());
    }
  }, [seasonalData, showRecentYears, showPostElectionYears, activeView]);

  useEffect(() => {
    const handleResize = () => {
      if (seasonalData.length > 0) {
        drawChart();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [seasonalData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (isDragging && dragStart) {
        const deltaX = x - dragStart.x;
        const maxPan = (zoomLevel - 1) * 0.5 + 0.3; // Extra 0.3 for extended range beyond month
        const newOffset = Math.max(-maxPan, Math.min(maxPan, dragStart.offset + deltaX / canvas.width));
        setPanOffset(newOffset);
      } else {
        setMousePos({ x, y });
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setIsDragging(true);
      setDragStart({ x, offset: panOffset });
      canvas.style.cursor = 'grabbing';
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStart(null);
      canvas.style.cursor = 'grab';
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.001;
      const delta = -e.deltaY * zoomSpeed;
      const newZoom = Math.max(1, Math.min(5, zoomLevel + delta));

      if (newZoom === 1) {
        setPanOffset(0);
      }

      setZoomLevel(newZoom);
    };

    const handleMouseLeave = () => {
      setMousePos(null);
      if (isDragging) {
        setIsDragging(false);
        setDragStart(null);
        canvas.style.cursor = 'grab';
      }
    };

    const handleDoubleClick = (e: MouseEvent) => {
      if (showPatternPerformance && (canvas as any).patternDetailsButton) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const btn = (canvas as any).patternDetailsButton;
        if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
          setShowPatternDetails(true);
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('dblclick', handleDoubleClick);
    canvas.style.cursor = 'grab';

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [isDragging, zoomLevel, panOffset, dragStart]);

  useEffect(() => {
    if (seasonalData.length > 0 && activeView === 'chart') {
      requestAnimationFrame(() => drawChart());
    }
  }, [mousePos, zoomLevel, panOffset, seasonalData, activeView, showRecentYears, showPostElectionYears, showEventPerformance, eventPerformanceData]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      if (isIndex) {
        // Load all 4 indices
        const data = await almanacService.getMonthlySeasonalData(selectedMonth, 18);
        setSeasonalData(data);
      } else {
        // Load single stock data
        const data = await almanacService.getSingleStockMonthlyData(symbol, selectedMonth, 18);
        setSeasonalData(data);
      }
    } catch (err) {
      setError('Failed to load seasonal data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const calculateEventPerformance = async (eventType: string) => {
    const currentYear = new Date().getFullYear();

    const getEventDates = (event: string): Date[] => {
      const dates: Date[] = [];
      for (let year = currentYear - 5; year <= currentYear + 1; year++) {
        switch (event) {
          case 'thanksgiving':
            const nov1 = new Date(year, 10, 1);
            const firstThursday = (4 - nov1.getDay() + 7) % 7 + 1;
            dates.push(new Date(year, 10, firstThursday + 21));
            break;
          case 'christmas':
            dates.push(new Date(year, 11, 25));
            break;
          case 'newyear':
            dates.push(new Date(year, 0, 1));
            break;
          case 'presidentsday':
            const feb1 = new Date(year, 1, 1);
            const firstMonday = (1 - feb1.getDay() + 7) % 7 + 1;
            dates.push(new Date(year, 1, firstMonday + 14));
            break;
          case 'mlkday':
            const jan1 = new Date(year, 0, 1);
            const firstMondayJan = (1 - jan1.getDay() + 7) % 7 + 1;
            dates.push(new Date(year, 0, firstMondayJan + 14));
            break;
          case 'memorialday':
            const may31 = new Date(year, 4, 31);
            const lastMonday = 31 - ((may31.getDay() + 6) % 7);
            dates.push(new Date(year, 4, lastMonday));
            break;
          case 'july4th':
            dates.push(new Date(year, 6, 4));
            break;
          case 'laborday':
            const sep1 = new Date(year, 8, 1);
            const firstMondaySep = (1 - sep1.getDay() + 7) % 7 + 1;
            dates.push(new Date(year, 8, firstMondaySep));
            break;
          case 'fomc-march':
            dates.push(new Date(year, 2, 20));
            break;
          case 'fomc-june':
            dates.push(new Date(year, 5, 15));
            break;
          case 'fomc-september':
            dates.push(new Date(year, 8, 20));
            break;
          case 'fomc-december':
            dates.push(new Date(year, 11, 15));
            break;
          case 'quad-witching-mar':
            const mar1 = new Date(year, 2, 1);
            const firstFridayMar = (5 - mar1.getDay() + 7) % 7 + 1;
            dates.push(new Date(year, 2, firstFridayMar + 14));
            break;
          case 'quad-witching-jun':
            const jun1 = new Date(year, 5, 1);
            const firstFridayJun = (5 - jun1.getDay() + 7) % 7 + 1;
            dates.push(new Date(year, 5, firstFridayJun + 14));
            break;
          case 'quad-witching-sep':
            const sep1qw = new Date(year, 8, 1);
            const firstFridaySep = (5 - sep1qw.getDay() + 7) % 7 + 1;
            dates.push(new Date(year, 8, firstFridaySep + 14));
            break;
          case 'quad-witching-dec':
            const dec1 = new Date(year, 11, 1);
            const firstFridayDec = (5 - dec1.getDay() + 7) % 7 + 1;
            dates.push(new Date(year, 11, firstFridayDec + 14));
            break;
          case 'monthlyopex':
            const today = new Date();
            const month1 = new Date(year, today.getMonth(), 1);
            const firstFridayMonth = (5 - month1.getDay() + 7) % 7 + 1;
            dates.push(new Date(year, today.getMonth(), firstFridayMonth + 14));
            break;
          case 'yearendrally':
            dates.push(new Date(year, 11, 31));
            break;
          case 'halloweenrally':
            dates.push(new Date(year, 9, 31));
            break;
          case 'santarally':
            dates.push(new Date(year, 11, 20));
            break;
          case 'q1-earnings':
            dates.push(new Date(year, 3, 15));
            break;
          case 'q2-earnings':
            dates.push(new Date(year, 6, 15));
            break;
          case 'q3-earnings':
            dates.push(new Date(year, 9, 15));
            break;
          case 'q4-earnings':
            dates.push(new Date(year, 0, 15));
            break;
        }
      }
      return dates;
    };

    const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = (date: Date) => {
      const month = date.getMonth(), day = date.getDate(), dayOfWeek = date.getDay();
      if (month === 0 && day === 1) return true;
      if (month === 6 && day === 4) return true;
      if (month === 11 && day === 25) return true;
      if (month === 0 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
      if (month === 1 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
      if (month === 4 && dayOfWeek === 1 && day >= 25) return true;
      if (month === 8 && dayOfWeek === 1 && day <= 7) return true;
      if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;
      return false;
    };

    const getTradingDays = (startDate: Date, count: number, forward: boolean): Date[] => {
      const days: Date[] = [];
      const current = new Date(startDate);
      let found = 0;
      while (found < count) {
        current.setDate(current.getDate() + (forward ? 1 : -1));
        if (!isWeekend(current) && !isHoliday(current)) {
          days.push(new Date(current));
          found++;
        }
      }
      return forward ? days : days.reverse();
    };

    try {
      const eventDates = getEventDates(eventType);

      // Find the event date for the current month being viewed
      const currentMonth = selectedMonth;
      const currentYear = new Date().getFullYear();
      let targetEventDate = eventDates.find(d => d.getMonth() === currentMonth && d.getFullYear() === currentYear);

      // If no event this month this year, try next year or last year
      if (!targetEventDate) {
        targetEventDate = eventDates.find(d => d.getMonth() === currentMonth && d.getFullYear() === currentYear + 1);
      }
      if (!targetEventDate) {
        targetEventDate = eventDates.find(d => d.getMonth() === currentMonth && d.getFullYear() === currentYear - 1);
      }
      if (!targetEventDate) {
        console.error('No event date found for month', currentMonth);
        return;
      }

      console.log('Target event date for display:', targetEventDate);

      const allReturns: number[][] = Array(11).fill(0).map(() => []); // 5 before + event + 5 after = 11

      let successfulFetches = 0;

      for (const eventDate of eventDates) {
        // Only use events from past years for average calculation
        if (eventDate.getFullYear() > currentYear) continue;

        const before = getTradingDays(eventDate, 5, false);
        const after = getTradingDays(eventDate, 5, true);
        const allDays = [...before, eventDate, ...after];

        const from = allDays[0].toISOString().split('T')[0];
        const to = allDays[allDays.length - 1].toISOString().split('T')[0];

        console.log(`Fetching ${eventType} data for ${eventDate.getFullYear()}: ${from} to ${to}`);

        const response = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`
        );

        if (!response.ok) {
          console.warn(`API error for ${eventDate.getFullYear()}:`, response.status);
          continue;
        }

        const data = await response.json();
        if (!data.results || data.results.length === 0) {
          console.warn(`No data results for ${eventDate.getFullYear()}`);
          continue;
        }

        const prices = data.results.map((r: any) => r.c);
        console.log(`Got ${prices.length} prices for ${eventDate.getFullYear()}:`, prices);

        // Accept any result with at least 7 data points (flexible for holidays)
        if (prices.length < 7) {
          console.warn(`Not enough prices (${prices.length} < 7) for ${eventDate.getFullYear()}`);
          continue;
        }

        successfulFetches++;

        // Use middle point as event reference (since event might be a holiday and excluded)
        const eventIndex = Math.floor(prices.length / 2);
        const eventPrice = prices[eventIndex];

        console.log(`Using index ${eventIndex} as event price:`, eventPrice);

        if (!eventPrice || eventPrice === 0) {
          console.warn(`Invalid event price for ${eventDate.getFullYear()}`);
          continue;
        }

        // Map to our 11-point array, centering around the event
        const offset = 5 - eventIndex; // How many slots to shift

        for (let i = 0; i < prices.length; i++) {
          const targetIndex = i + offset;
          if (targetIndex >= 0 && targetIndex < 11) {
            const returnPct = ((prices[i] - eventPrice) / eventPrice) * 100;
            allReturns[targetIndex].push(returnPct);
            if (i === 0 || i === eventIndex || i === prices.length - 1) {
              console.log(`Day ${i} -> slot ${targetIndex}: price=${prices[i]}, return=${returnPct.toFixed(2)}%`);
            }
          }
        }
      }

      console.log(`Successfully fetched ${successfulFetches} event occurrences`);

      if (successfulFetches === 0) {
        console.error('No successful data fetches - cannot calculate average');
        return;
      }

      const avgReturns = allReturns.map(returns =>
        returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
      );

      console.log('Average returns calculated:', avgReturns);

      // For holidays that don't have trading, find the closest trading day before the event
      let actualEventTradingDate = new Date(targetEventDate);
      while (isWeekend(actualEventTradingDate) || isHoliday(actualEventTradingDate)) {
        actualEventTradingDate.setDate(actualEventTradingDate.getDate() - 1);
      }

      console.log('Actual event trading date (adjusted for holiday):', actualEventTradingDate);

      // Get the trading day numbers - extend beyond month boundaries to handle events that span months
      const monthStart = new Date(currentYear, currentMonth, 1);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0);

      // Extend range to include 10 trading days before and after the month
      const extendedStart = new Date(monthStart);
      extendedStart.setDate(extendedStart.getDate() - 15); // Go back 15 calendar days
      const extendedEnd = new Date(monthEnd);
      extendedEnd.setDate(extendedEnd.getDate() + 15); // Go forward 15 calendar days

      // Build list of all trading days in the extended range
      const allMonthTradingDays: Date[] = [];
      const current = new Date(extendedStart);
      while (current <= extendedEnd) {
        if (!isWeekend(current) && !isHoliday(current)) {
          allMonthTradingDays.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
      }

      // Find the event trading day number
      const eventTradingDayNum = allMonthTradingDays.findIndex(d =>
        d.getDate() === actualEventTradingDate.getDate() &&
        d.getMonth() === actualEventTradingDate.getMonth() &&
        d.getFullYear() === actualEventTradingDate.getFullYear()
      ) + 1;

      console.log(`Event at trading day ${eventTradingDayNum} of ${allMonthTradingDays.length}`);
      console.log('Event date:', actualEventTradingDate.toLocaleDateString());

      // Create simple sequential data centered around the event
      // Use indices 0-10 where 5 is the event
      const perfData = avgReturns.map((avgReturn, index) => {
        const dayOffset = index - 5; // -5 to +5
        const tradingDayNum = eventTradingDayNum + dayOffset;

        // Only include if within the extended trading days range
        if (tradingDayNum < 1 || tradingDayNum > allMonthTradingDays.length) {
          console.log(`Skipping index ${index} (day ${tradingDayNum}) - out of range`);
          return null;
        }

        const displayDate = allMonthTradingDays[tradingDayNum - 1];
        console.log(`Index ${index}: Day ${tradingDayNum} = ${displayDate.toLocaleDateString()}, Return: ${avgReturn.toFixed(2)}%`);

        return {
          date: displayDate,
          avgReturn,
          tradingDay: tradingDayNum
        };
      }).filter(d => d !== null) as { date: Date, avgReturn: number, tradingDay: number }[];

      console.log('Performance data:', perfData.map(d => `Day ${d.tradingDay} (${d.date.toLocaleDateString()}): ${d.avgReturn.toFixed(2)}%`));

      setEventPerformanceData(perfData);
    } catch (error) {
      console.error('Event performance calculation failed:', error);
    }
  };

  // Calculate pattern-based performance (52-week highs/lows, % moves)
  const calculatePatternPerformance = async (patternType: string, patternLabel: string, ticker: string) => {
    console.log(`Calculating pattern performance for ${patternType} on ${ticker}`);

    // Assign color based on pattern type
    const getPatternColor = (label: string) => {
      if (label.includes('90d Cooldown')) return '#00CED1'; // Cyan for cooldown
      if (label.includes('Annual')) return '#FFD700'; // Gold for annual
      return '#00BFFF'; // Default blue
    };

    try {
      // Determine lookback period and forward period
      const yearsBack = 19;
      const forwardDays = patternType.includes('52week') ? 20 : 29;

      // Fetch historical data for pattern scanning
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - yearsBack);

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      console.log(`Fetching ${yearsBack} years of data from ${startStr} to ${endStr}`);

      const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startStr}/${endStr}?adjusted=true&sort=asc&apiKey=${apiKey}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!data.results || data.results.length < 252) {
        console.error('Insufficient historical data');
        return;
      }

      const prices: PriceData[] = data.results.map((r: any) => ({
        date: new Date(r.t),
        close: r.c,
        high: r.h,
        low: r.l
      }));

      console.log(`Loaded ${prices.length} days of historical data`);

      // Find pattern occurrences based on type
      const occurrences: Date[] = [];
      const occurrenceDetails: { date: Date, priceAtEvent: number, changePercent?: number }[] = [];

      if (patternType === '52week-high-cooldown' || patternType === '52week-high-annual') {
        // 52-week high breakouts
        for (let i = 252; i < prices.length; i++) {
          const last252 = prices.slice(i - 252, i);
          const high52Week = Math.max(...last252.map(p => p.high));

          if (prices[i].close > high52Week) {
            const occDate = prices[i].date;

            if (patternType === '52week-high-cooldown') {
              // Check 90-day cooldown
              const lastOcc = occurrences[occurrences.length - 1];
              if (!lastOcc || (occDate.getTime() - lastOcc.getTime()) / (1000 * 60 * 60 * 24) >= 90) {
                occurrences.push(occDate);
                occurrenceDetails.push({
                  date: occDate,
                  priceAtEvent: prices[i].close,
                  changePercent: ((prices[i].close - high52Week) / high52Week) * 100
                });
              }
            } else {
              // Annual: first occurrence per year
              const year = occDate.getFullYear();
              if (!occurrences.find(d => d.getFullYear() === year)) {
                occurrences.push(occDate);
                occurrenceDetails.push({
                  date: occDate,
                  priceAtEvent: prices[i].close,
                  changePercent: ((prices[i].close - high52Week) / high52Week) * 100
                });
              }
            }
          }
        }
      } else if (patternType === '52week-low-cooldown' || patternType === '52week-low-annual') {
        // 52-week low breakdowns
        for (let i = 252; i < prices.length; i++) {
          const last252 = prices.slice(i - 252, i);
          const low52Week = Math.min(...last252.map(p => p.low));

          if (prices[i].close < low52Week) {
            const occDate = prices[i].date;

            if (patternType === '52week-low-cooldown') {
              const lastOcc = occurrences[occurrences.length - 1];
              if (!lastOcc || (occDate.getTime() - lastOcc.getTime()) / (1000 * 60 * 60 * 24) >= 90) {
                occurrences.push(occDate);
                occurrenceDetails.push({
                  date: occDate,
                  priceAtEvent: prices[i].close,
                  changePercent: ((prices[i].close - low52Week) / low52Week) * 100
                });
              }
            } else {
              const year = occDate.getFullYear();
              if (!occurrences.find(d => d.getFullYear() === year)) {
                occurrences.push(occDate);
                occurrenceDetails.push({
                  date: occDate,
                  priceAtEvent: prices[i].close,
                  changePercent: ((prices[i].close - low52Week) / low52Week) * 100
                });
              }
            }
          }
        }
      } else if (patternType.startsWith('move-8-11') || patternType.startsWith('move-18-22')) {
        // Percentage move detection
        const [_, minPct, maxPct, direction, method] = patternType.split('-');
        const minMove = parseFloat(minPct);
        const maxMove = parseFloat(maxPct);

        for (let i = 1; i < prices.length; i++) {
          const pctChange = ((prices[i].close - prices[i - 1].close) / prices[i - 1].close) * 100;
          const absChange = Math.abs(pctChange);

          if (absChange >= minMove && absChange <= maxMove) {
            if ((direction === 'up' && pctChange > 0) || (direction === 'down' && pctChange < 0)) {
              const occDate = prices[i].date;

              if (method === 'cooldown') {
                const lastOcc = occurrences[occurrences.length - 1];
                if (!lastOcc || (occDate.getTime() - lastOcc.getTime()) / (1000 * 60 * 60 * 24) >= 90) {
                  occurrences.push(occDate);
                  occurrenceDetails.push({
                    date: occDate,
                    priceAtEvent: prices[i].close,
                    changePercent: pctChange
                  });
                }
              } else if (method === 'annual') {
                const year = occDate.getFullYear();
                if (!occurrences.find(d => d.getFullYear() === year)) {
                  occurrences.push(occDate);
                  occurrenceDetails.push({
                    date: occDate,
                    priceAtEvent: prices[i].close,
                    changePercent: pctChange
                  });
                }
              }
            }
          }
        }
      }

      console.log(`Found ${occurrences.length} pattern occurrences`);

      if (occurrences.length === 0) {
        console.error('No pattern occurrences found');
        return;
      }

      // Calculate average performance after each occurrence
      const allReturns: number[][] = Array.from({ length: forwardDays + 1 }, () => []);

      for (const occDate of occurrences) {
        const occIndex = prices.findIndex(p => p.date.getTime() === occDate.getTime());
        if (occIndex === -1 || occIndex + forwardDays >= prices.length) continue;

        const basePrice = prices[occIndex].close;

        for (let day = 0; day <= forwardDays; day++) {
          if (occIndex + day < prices.length) {
            const returnPct = ((prices[occIndex + day].close - basePrice) / basePrice) * 100;
            allReturns[day].push(returnPct);
          }
        }
      }

      // Calculate averages
      const avgReturns = allReturns.map(returns =>
        returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
      );

      console.log('Average returns calculated:', avgReturns.slice(0, 5).map(r => r.toFixed(2)));
      console.log(`Pattern analysis complete: ${occurrences.length} occurrences found`);

      // Create simple sequential data for display
      const perfData = avgReturns.map((avgReturn, index) => ({
        date: new Date(), // Placeholder - not used for pattern display
        avgReturn,
        tradingDay: index + 1
      }));

      // Add to or update pattern performance data
      setPatternPerformanceData(prev => {
        const filtered = prev.filter(p => p.patternName !== patternLabel);
        return [...filtered, {
          patternName: patternLabel,
          data: perfData,
          occurrences: occurrences.length,
          color: getPatternColor(patternLabel),
          occurrenceDetails: occurrenceDetails
        }];
      });
    } catch (error) {
      console.error('Pattern performance calculation failed:', error);
    }
  };

  const drawChart = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || seasonalData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width, 300);
    const height = Math.max(rect.height, 300);

    if (width < 50 || height < 50) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // CRITICAL: 70px bottom padding ensures x-axis labels never get cropped
    const PADDING = { top: 20, right: 10, bottom: 70, left: 60 };
    const chartWidth = width - PADDING.left - PADDING.right;
    const chartHeight = height - PADDING.top - PADDING.bottom;

    // Clear canvas with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Calculate value range based on visible data when zoomed
    let minValue = Infinity;
    let maxValue = -Infinity;

    const maxTradingDays = Math.max(...seasonalData.map(d => d.dailyData.length));

    // If showing event or pattern performance, use that data for Y-axis scale
    if ((showEventPerformance && eventPerformanceData.length > 0) || (showPatternPerformance && patternPerformanceData.length > 0)) {
      if (showPatternPerformance) {
        // For multiple patterns, find min/max across all datasets
        patternPerformanceData.forEach(patternSet => {
          patternSet.data.forEach(point => {
            minValue = Math.min(minValue, point.avgReturn);
            maxValue = Math.max(maxValue, point.avgReturn);
          });
        });
      } else {
        eventPerformanceData.forEach(point => {
          minValue = Math.min(minValue, point.avgReturn);
          maxValue = Math.max(maxValue, point.avgReturn);
        });
      }

      // Ensure 0% is always visible and centered
      const absMax = Math.max(Math.abs(minValue), Math.abs(maxValue));
      minValue = -absMax;
      maxValue = absMax;

      // Add padding
      const range = maxValue - minValue;
      minValue -= range * 0.15;
      maxValue += range * 0.15;
    } else {
      // Determine visible trading day range based on zoom and pan for seasonal data
      const getVisibleRange = () => {
        if (zoomLevel === 1) return { start: 1, end: maxTradingDays };

        const chartCenter = 0.5;
        const visibleStart = Math.max(0, (0 - panOffset - chartCenter) / zoomLevel + chartCenter);
        const visibleEnd = Math.min(1, (1 - panOffset - chartCenter) / zoomLevel + chartCenter);

        return {
          start: Math.max(1, Math.floor(visibleStart * (maxTradingDays - 1)) + 1),
          end: Math.min(maxTradingDays, Math.ceil(visibleEnd * (maxTradingDays - 1)) + 1)
        };
      };

      const visibleRange = getVisibleRange();

      seasonalData.forEach(index => {
        index.dailyData.forEach(point => {
          if (point.tradingDay >= visibleRange.start && point.tradingDay <= visibleRange.end) {
            minValue = Math.min(minValue, point.cumulativeReturn, point.postElectionCumulative);
            maxValue = Math.max(maxValue, point.cumulativeReturn, point.postElectionCumulative);
          }
        });
      });

      // Fallback if no visible data
      if (minValue === Infinity || maxValue === -Infinity) {
        seasonalData.forEach(index => {
          index.dailyData.forEach(point => {
            minValue = Math.min(minValue, point.cumulativeReturn, point.postElectionCumulative);
            maxValue = Math.max(maxValue, point.cumulativeReturn, point.postElectionCumulative);
          });
        });
      }

      const range = maxValue - minValue;
      minValue -= range * 0.1;
      maxValue += range * 0.1;
    }

    // Helper functions for positioning with zoom and pan
    const getX = (tradingDay: number) => {
      const chartCenter = 0.5;
      const baseX = (tradingDay - 1) / (maxTradingDays - 1);
      const zoomedX = chartCenter + (baseX - chartCenter) * zoomLevel + panOffset;
      return PADDING.left + zoomedX * chartWidth;
    };

    // Simpler X calculation for event data - just spread points evenly
    const getEventX = (index: number, totalPoints: number) => {
      const chartCenter = 0.5;
      const baseX = index / (totalPoints - 1);
      const zoomedX = chartCenter + (baseX - chartCenter) * zoomLevel + panOffset;
      return PADDING.left + zoomedX * chartWidth;
    };

    const getY = (value: number) => {
      return PADDING.top + chartHeight * ((maxValue - value) / (maxValue - minValue));
    };

    // Draw horizontal grid lines and Y-axis labels
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';

    const numHLines = 8;
    for (let i = 0; i <= numHLines; i++) {
      const y = PADDING.top + (chartHeight / numHLines) * i;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(width - PADDING.right, y);
      ctx.stroke();

      const value = maxValue - ((maxValue - minValue) / numHLines) * i;
      ctx.fillText(`${value.toFixed(1)}%`, PADDING.left - 8, y + 5);
    }

    // Draw zero line
    if (minValue < 0 && maxValue > 0) {
      const zeroY = getY(0);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, zeroY);
      ctx.lineTo(width - PADDING.right, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Index colors
    const colors: Record<string, string> = {
      'DJIA': '#FFFFFF',
      'S&P 500': '#00C853',
      'NASDAQ': '#2196F3',
      'Russell 2000': '#FF5722'
    };

    // Draw data lines (only if event or pattern performance is not active)
    if (!showEventPerformance && !showPatternPerformance) {
      seasonalData.forEach(index => {
        // For individual stocks, use white for normal years, yellow for election years
        const normalColor = isIndex ? (colors[index.name] || '#FFFFFF') : '#FFFFFF';
        const electionColor = isIndex ? (colors[index.name] || '#FFFFFF') : '#FFD700';

        if (showRecentYears) {
          ctx.strokeStyle = normalColor;
          ctx.lineWidth = 2;
          ctx.beginPath();

          index.dailyData.forEach((point, i) => {
            const x = getX(point.tradingDay);
            const y = getY(point.cumulativeReturn);

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        }

        if (showPostElectionYears) {
          ctx.strokeStyle = electionColor;
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 4]);
          ctx.beginPath();

          index.dailyData.forEach((point, i) => {
            const x = getX(point.tradingDay);
            const y = getY(point.postElectionCumulative);

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    }

    // Draw event performance overlay if active
    if (showEventPerformance && eventPerformanceData.length > 0) {
      // Find the event point (middle of the data)
      const eventIndex = Math.floor(eventPerformanceData.length / 2);
      const eventX = getEventX(eventIndex, eventPerformanceData.length);

      // Draw vertical dashed line at event date
      ctx.strokeStyle = '#FF6600';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(eventX, PADDING.top);
      ctx.lineTo(eventX, height - PADDING.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw event label at top
      ctx.fillStyle = '#FF6600';
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('EVENT', eventX, PADDING.top - 5);

      // Draw event performance line
      ctx.strokeStyle = '#00FFFF'; // Cyan for event performance line
      ctx.lineWidth = 3;
      ctx.beginPath();

      eventPerformanceData.forEach((point, i) => {
        const x = getEventX(i, eventPerformanceData.length);
        const y = getY(point.avgReturn);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Add label
      const lastPoint = eventPerformanceData[eventPerformanceData.length - 1];
      const lastX = getEventX(eventPerformanceData.length - 1, eventPerformanceData.length);
      const lastY = getY(lastPoint.avgReturn);

      ctx.fillStyle = '#00FFFF';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${lastPoint.avgReturn.toFixed(2)}%`, lastX + 5, lastY);
    }

    // Draw pattern performance overlay if active
    if (showPatternPerformance && patternPerformanceData.length > 0) {
      // Draw each pattern line with its own color
      patternPerformanceData.forEach((patternSet, setIndex) => {
        ctx.strokeStyle = patternSet.color;
        ctx.lineWidth = 3;
        ctx.beginPath();

        patternSet.data.forEach((point, i) => {
          const x = getEventX(i, patternSet.data.length);
          const y = getY(point.avgReturn);

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Add label for this pattern
        const lastPoint = patternSet.data[patternSet.data.length - 1];
        const lastX = getEventX(patternSet.data.length - 1, patternSet.data.length);
        const lastY = getY(lastPoint.avgReturn);

        ctx.fillStyle = patternSet.color;
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${lastPoint.avgReturn.toFixed(2)}%`, lastX + 5, lastY + (setIndex * 15));
      });

      // Add "DETAILS" button at the right side
      const detailsX = width - PADDING.right - 80;
      const detailsY = PADDING.top + 30;
      const detailsWidth = 70;
      const detailsHeight = 20;

      // Draw button background
      ctx.fillStyle = '#00CED1';
      ctx.fillRect(detailsX, detailsY - detailsHeight / 2, detailsWidth, detailsHeight);

      // Draw button text
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DETAILS', detailsX + detailsWidth / 2, detailsY + 4);

      // Store button position for click detection
      (canvas as any).patternDetailsButton = {
        x: detailsX,
        y: detailsY - detailsHeight / 2,
        width: detailsWidth,
        height: detailsHeight
      };

      // Add "Day 0" label at start
      ctx.fillStyle = '#00CED1';
      ctx.textAlign = 'left';
      ctx.fillText('Day 0', getEventX(0, patternPerformanceData[0].data.length), PADDING.top - 5);
    }

    // Draw X-axis labels in the bottom padding area
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    const xAxisY = height - PADDING.bottom + 35; // Position labels in the 70px bottom padding
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

    if (showEventPerformance && eventPerformanceData.length > 0) {
      // For event performance
      if (isMobile) {
        // Mobile: Show only 3 dates (start, middle, end)
        const indices = [0, Math.floor(eventPerformanceData.length / 2), eventPerformanceData.length - 1];
        indices.forEach(i => {
          const point = eventPerformanceData[i];
          const x = getEventX(i, eventPerformanceData.length);
          if (x >= PADDING.left && x <= width - PADDING.right) {
            const dateStr = `${point.date.getMonth() + 1}/${point.date.getDate()}`;
            ctx.fillText(dateStr, x, xAxisY);
          }
        });
      } else {
        // Desktop: Show every other date
        eventPerformanceData.forEach((point, i) => {
          if (i % 2 === 0 || i === eventPerformanceData.length - 1) {
            const x = getEventX(i, eventPerformanceData.length);
            if (x >= PADDING.left && x <= width - PADDING.right) {
              const dateStr = `${point.date.getMonth() + 1}/${point.date.getDate()}`;
              ctx.fillText(dateStr, x, xAxisY);
            }
          }
        });
      }
    } else if (showPatternPerformance && patternPerformanceData.length > 0) {
      // For pattern performance
      const firstPattern = patternPerformanceData[0];
      if (isMobile) {
        // Mobile: Show only 3 days (start, middle, end)
        const indices = [0, Math.floor(firstPattern.data.length / 2), firstPattern.data.length - 1];
        indices.forEach(i => {
          const x = getEventX(i, firstPattern.data.length);
          if (x >= PADDING.left && x <= width - PADDING.right) {
            ctx.fillText(`Day ${i}`, x, xAxisY);
          }
        });
      } else {
        // Desktop: Show every 5th day
        firstPattern.data.forEach((point, i) => {
          if (i % 5 === 0 || i === firstPattern.data.length - 1) {
            const x = getEventX(i, firstPattern.data.length);
            if (x >= PADDING.left && x <= width - PADDING.right) {
              ctx.fillText(`Day ${i}`, x, xAxisY);
            }
          }
        });
      }
    } else {
      // For seasonal data
      if (isMobile) {
        // Mobile: Show only 3 dates (start, middle, end)
        const dailyData = seasonalData[0]?.dailyData || [];
        const indices = [0, Math.floor(dailyData.length / 2), dailyData.length - 1];
        indices.forEach(i => {
          const point = dailyData[i];
          if (point) {
            const x = getX(point.tradingDay);
            ctx.fillText(point.date, x, xAxisY);
          }
        });
      } else {
        // Desktop: Show dates at regular intervals
        const step = maxTradingDays > 15 ? 2 : 1;
        seasonalData[0]?.dailyData.forEach((point, i) => {
          if (i % step === 0 || i === seasonalData[0].dailyData.length - 1) {
            const x = getX(point.tradingDay);
            ctx.fillText(point.date, x, xAxisY);
          }
        });
      }
    }

    // Draw crosshair
    if (mousePos) {
      const { x: mouseX, y: mouseY } = mousePos;

      // Check if mouse is within chart area
      if (mouseX >= PADDING.left && mouseX <= width - PADDING.right &&
        mouseY >= PADDING.top && mouseY <= height - PADDING.bottom) {

        // Draw vertical line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(mouseX, PADDING.top);
        ctx.lineTo(mouseX, height - PADDING.bottom);
        ctx.stroke();

        // Draw horizontal line
        ctx.beginPath();
        ctx.moveTo(PADDING.left, mouseY);
        ctx.lineTo(width - PADDING.right, mouseY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Calculate trading day from mouse position accounting for zoom and pan
        const chartCenter = 0.5;
        const normalizedX = (mouseX - PADDING.left) / chartWidth;
        const unzoomedX = (normalizedX - panOffset - chartCenter) / zoomLevel + chartCenter;
        const tradingDay = Math.round(unzoomedX * (maxTradingDays - 1)) + 1;
        const dataPoint = seasonalData[0]?.dailyData.find(d => d.tradingDay === tradingDay);

        // Calculate percentage from mouse position
        const percentage = maxValue - ((mouseY - PADDING.top) / chartHeight) * (maxValue - minValue);

        // Draw X-axis tooltip (date)
        if (dataPoint) {
          const dateText = dataPoint.date;
          ctx.font = '900 14px "JetBrains Mono", monospace';
          const textWidth = ctx.measureText(dateText).width;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.fillRect(mouseX - textWidth / 2 - 6, height - PADDING.bottom + 2, textWidth + 12, 20);

          ctx.fillStyle = '#ff6600';
          ctx.textAlign = 'center';
          ctx.fillText(dateText, mouseX, height - PADDING.bottom + 15);
        }

        // Draw Y-axis tooltip (percentage)
        const percentText = `${percentage.toFixed(2)}%`;
        ctx.font = '900 14px "JetBrains Mono", monospace';
        const percentWidth = ctx.measureText(percentText).width;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(PADDING.left - percentWidth - 18, mouseY - 10, percentWidth + 12, 20);

        ctx.fillStyle = '#ff6600';
        ctx.textAlign = 'right';
        ctx.fillText(percentText, PADDING.left - 8, mouseY + 4);
      }
    }
  };

  return (
    <div className="almanac-daily-chart" style={{ position: 'relative', overflow: 'visible' }}>
      <div className="chart-header-row" style={{ position: 'relative', zIndex: 5000, overflow: 'visible' }}>

        {/* Mobile Controls - Complete Redesign */}
        <div className="almanac-mobile-controls">
          {/* Row 1: Monthly, Chart, Calendar, Table */}
          <div className="almanac-mobile-row-1">
            <select
              value={selectedMonth}
              onChange={(e) => {
                const newMonth = parseInt(e.target.value);
                setSelectedMonth(newMonth);
                onMonthChange?.(newMonth);
              }}
              className="almanac-mobile-select"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>

            <button
              onClick={() => setActiveView('chart')}
              className={`almanac-mobile-btn ${activeView === 'chart' ? 'active' : ''}`}
            >
              Chart
            </button>

            <button
              onClick={() => setActiveView('calendar')}
              className={`almanac-mobile-btn ${activeView === 'calendar' ? 'active' : ''}`}
            >
              Calendar
            </button>

            <button
              onClick={() => setActiveView('table')}
              className={`almanac-mobile-btn ${activeView === 'table' ? 'active' : ''}`}
            >
              Table
            </button>
          </div>

          {/* Row 2: Solid/Dashed, Events, Patterns */}
          <div className="almanac-mobile-row-2">
            <button
              onClick={() => {
                setShowRecentYears(!showRecentYears);
                setShowPostElectionYears(!showPostElectionYears);
              }}
              className="almanac-mobile-btn"
            >
              {showRecentYears && showPostElectionYears ? 'Both' :
                showRecentYears ? 'Solid' :
                  showPostElectionYears ? 'Dashed' : 'None'}
            </button>

            <select
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'none') {
                  setSelectedEvent(null);
                  setShowEventPerformance(false);
                  setEventPerformanceData([]);
                } else {
                  setSelectedEvent(value);
                  setShowEventPerformance(true);
                  calculateEventPerformance(value);
                }
              }}
              className="almanac-mobile-select"
              value={selectedEvent || 'none'}
            >
              <option value="none">Event</option>
              <optgroup label="HOLIDAYS">
                <option value="thanksgiving">Thanksgiving</option>
                <option value="christmas">Christmas</option>
                <option value="newyear">New Year</option>
                <option value="presidentsday">Presidents Day</option>
                <option value="mlkday">MLK Day</option>
                <option value="memorialday">Memorial Day</option>
                <option value="july4th">July 4th</option>
                <option value="laborday">Labor Day</option>
              </optgroup>
              <optgroup label="FOMC MEETINGS">
                <option value="fomc-march">FOMC March</option>
                <option value="fomc-june">FOMC June</option>
                <option value="fomc-september">FOMC September</option>
                <option value="fomc-december">FOMC December</option>
              </optgroup>
              <optgroup label="QUAD WITCHING">
                <option value="quad-witching-mar">Quad Witching Mar</option>
                <option value="quad-witching-jun">Quad Witching Jun</option>
                <option value="quad-witching-sep">Quad Witching Sep</option>
                <option value="quad-witching-dec">Quad Witching Dec</option>
              </optgroup>
            </select>

            <select
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'none') {
                  setSelectedPattern([]);
                  setShowPatternPerformance(false);
                  setPatternPerformanceData([]);
                } else {
                  const patternMap: { [key: string]: { id: string, label: string } } = {
                    '52week-high-cooldown': { id: '52week-high-cooldown', label: '52W High (90d Cooldown)' },
                    '52week-high-annual': { id: '52week-high-annual', label: '52W High (Annual)' },
                    '52week-low-cooldown': { id: '52week-low-cooldown', label: '52W Low (90d Cooldown)' },
                    '52week-low-annual': { id: '52week-low-annual', label: '52W Low (Annual)' },
                    'move-8-11-up-cooldown': { id: 'move-8-11-up-cooldown', label: '8-11% UP (90d Cooldown)' },
                    'move-8-11-up-annual': { id: 'move-8-11-up-annual', label: '8-11% UP (Annual)' },
                    'move-8-11-down-cooldown': { id: 'move-8-11-down-cooldown', label: '8-11% DOWN (90d Cooldown)' },
                    'move-8-11-down-annual': { id: 'move-8-11-down-annual', label: '8-11% DOWN (Annual)' },
                    'move-18-22-up-cooldown': { id: 'move-18-22-up-cooldown', label: '18-22% UP (90d Cooldown)' },
                    'move-18-22-up-annual': { id: 'move-18-22-up-annual', label: '18-22% UP (Annual)' },
                    'move-18-22-down-cooldown': { id: 'move-18-22-down-cooldown', label: '18-22% DOWN (90d Cooldown)' },
                    'move-18-22-down-annual': { id: 'move-18-22-down-annual', label: '18-22% DOWN (Annual)' }
                  };
                  const pattern = patternMap[value];
                  if (pattern) {
                    setSelectedPattern([pattern.label]);
                    setShowPatternPerformance(true);
                    setShowEventPerformance(false);
                    calculatePatternPerformance(pattern.id, pattern.label, symbol);
                  }
                }
              }}
              className="almanac-mobile-select"
              value={
                selectedPattern[0] === '52W High (90d Cooldown)' ? '52week-high-cooldown' :
                  selectedPattern[0] === '52W High (Annual)' ? '52week-high-annual' :
                    selectedPattern[0] === '52W Low (90d Cooldown)' ? '52week-low-cooldown' :
                      selectedPattern[0] === '52W Low (Annual)' ? '52week-low-annual' :
                        selectedPattern[0] === '8-11% UP (90d Cooldown)' ? 'move-8-11-up-cooldown' :
                          selectedPattern[0] === '8-11% UP (Annual)' ? 'move-8-11-up-annual' :
                            selectedPattern[0] === '8-11% DOWN (90d Cooldown)' ? 'move-8-11-down-cooldown' :
                              selectedPattern[0] === '8-11% DOWN (Annual)' ? 'move-8-11-down-annual' :
                                selectedPattern[0] === '18-22% UP (90d Cooldown)' ? 'move-18-22-up-cooldown' :
                                  selectedPattern[0] === '18-22% UP (Annual)' ? 'move-18-22-up-annual' :
                                    selectedPattern[0] === '18-22% DOWN (90d Cooldown)' ? 'move-18-22-down-cooldown' :
                                      selectedPattern[0] === '18-22% DOWN (Annual)' ? 'move-18-22-down-annual' :
                                        'none'
              }
            >
              <option value="none">Pattern</option>
              <optgroup label="52-WEEK BREAKOUTS">
                <option value="52week-high-cooldown">52W High (90d)</option>
                <option value="52week-high-annual">52W High (Annual)</option>
                <option value="52week-low-cooldown">52W Low (90d)</option>
                <option value="52week-low-annual">52W Low (Annual)</option>
              </optgroup>
              <optgroup label="8-11% MOVES">
                <option value="move-8-11-up-cooldown">8-11% UP (90d)</option>
                <option value="move-8-11-up-annual">8-11% UP (Annual)</option>
                <option value="move-8-11-down-cooldown">8-11% DOWN (90d)</option>
                <option value="move-8-11-down-annual">8-11% DOWN (Annual)</option>
              </optgroup>
              <optgroup label="18-22% MOVES">
                <option value="move-18-22-up-cooldown">18-22% UP (90d)</option>
                <option value="move-18-22-up-annual">18-22% UP (Annual)</option>
                <option value="move-18-22-down-cooldown">18-22% DOWN (90d)</option>
                <option value="move-18-22-down-annual">18-22% DOWN (Annual)</option>
              </optgroup>
            </select>
          </div>
        </div>

        {/* Desktop: All controls in one row */}
        <div className="chart-controls-row chart-controls-desktop">
          <select
            value={selectedMonth}
            onChange={(e) => {
              const newMonth = parseInt(e.target.value);
              setSelectedMonth(newMonth);
              onMonthChange?.(newMonth);
            }}
            className="month-selector"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>

          {/* Desktop: Chart/Calendar/Table Buttons */}
          <button
            className={`toggle-btn desktop-only-btn ${activeView === 'chart' ? 'active' : ''}`}
            onClick={() => setActiveView('chart')}
            style={{ marginLeft: '12px' }}
          >
            Chart
          </button>

          <button
            className={`toggle-btn desktop-only-btn ${activeView === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveView('calendar')}
            style={{ marginLeft: '8px' }}
          >
            Calendar
          </button>

          <button
            className={`toggle-btn desktop-only-btn ${activeView === 'table' ? 'active' : ''}`}
            onClick={() => setActiveView(activeView === 'table' ? 'chart' : 'table')}
            style={{ marginLeft: '8px' }}
          >
            SeasonalTable
          </button>

          {/* Desktop: Events Dropdown */}
          <div className="desktop-only-btn" style={{ position: 'relative', display: 'inline-block' }}>
            <button
              className={`toggle-btn ${showEventPerformance ? 'active' : ''}`}
              onClick={() => setIsEventsDropdownOpen(!isEventsDropdownOpen)}
              style={{
                marginLeft: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#000000',
                color: '#fff',
                border: '1px solid #333333',
                boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
              }}
            >
              <span>Events {selectedEvent ? `(${selectedEvent})` : ''}</span>
              {selectedEvent && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEvent(null);
                    setShowEventPerformance(false);
                    setEventPerformanceData([]);
                  }}
                  style={{
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    color: '#ff6600',
                    marginLeft: '4px'
                  }}
                >
                  ✕
                </span>
              )}
            </button>

            {isEventsDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                background: '#0a1520',
                border: '1px solid #ff6600',
                borderRadius: '4px',
                marginTop: '4px',
                minWidth: '200px',
                maxHeight: '400px',
                overflowY: 'auto',
                zIndex: 9999,
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
              }}>
                <div style={{ padding: '8px', borderBottom: '1px solid #333' }}>
                  <div style={{ color: '#ff6600', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>HOLIDAYS</div>
                  {['thanksgiving', 'christmas', 'newyear', 'presidentsday', 'mlkday', 'memorialday', 'july4th', 'laborday'].map(event => (
                    <button
                      key={event}
                      onClick={() => {
                        setSelectedEvent(event);
                        setShowEventPerformance(true);
                        setIsEventsDropdownOpen(false);
                        calculateEventPerformance(event);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 12px',
                        background: selectedEvent === event ? '#ff6600' : 'transparent',
                        color: selectedEvent === event ? '#000' : '#fff',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontFamily: '"JetBrains Mono", monospace'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedEvent !== event) {
                          e.currentTarget.style.background = '#1a2530';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedEvent !== event) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {event.toUpperCase().replace(/-/g, ' ')}
                    </button>
                  ))}
                </div>

                <div style={{ padding: '8px', borderBottom: '1px solid #333' }}>
                  <div style={{ color: '#ff6600', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>FOMC MEETINGS</div>
                  {['fomc-march', 'fomc-june', 'fomc-september', 'fomc-december'].map(event => (
                    <button
                      key={event}
                      onClick={() => {
                        setSelectedEvent(event);
                        setShowEventPerformance(true);
                        setIsEventsDropdownOpen(false);
                        calculateEventPerformance(event);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 12px',
                        background: selectedEvent === event ? '#ff6600' : 'transparent',
                        color: selectedEvent === event ? '#000' : '#fff',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontFamily: '"JetBrains Mono", monospace'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedEvent !== event) {
                          e.currentTarget.style.background = '#1a2530';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedEvent !== event) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {event.toUpperCase().replace(/-/g, ' ')}
                    </button>
                  ))}
                </div>

                <div style={{ padding: '8px', borderBottom: '1px solid #333' }}>
                  <div style={{ color: '#ff6600', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>QUAD WITCHING</div>
                  {['quad-witching-mar', 'quad-witching-jun', 'quad-witching-sep', 'quad-witching-dec'].map(event => (
                    <button
                      key={event}
                      onClick={() => {
                        setSelectedEvent(event);
                        setShowEventPerformance(true);
                        setIsEventsDropdownOpen(false);
                        calculateEventPerformance(event);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 12px',
                        background: selectedEvent === event ? '#ff6600' : 'transparent',
                        color: selectedEvent === event ? '#000' : '#fff',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontFamily: '"JetBrains Mono", monospace'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedEvent !== event) {
                          e.currentTarget.style.background = '#1a2530';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedEvent !== event) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {event.toUpperCase().replace(/-/g, ' ')}
                    </button>
                  ))}
                </div>

                <div style={{ padding: '8px' }}>
                  <div style={{ color: '#ff6600', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>EARNINGS & RALLIES</div>
                  {['q1-earnings', 'q2-earnings', 'q3-earnings', 'q4-earnings', 'yearendrally', 'halloweenrally', 'santarally', 'monthlyopex'].map(event => (
                    <button
                      key={event}
                      onClick={() => {
                        setSelectedEvent(event);
                        setShowEventPerformance(true);
                        setIsEventsDropdownOpen(false);
                        calculateEventPerformance(event);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 12px',
                        background: selectedEvent === event ? '#ff6600' : 'transparent',
                        color: selectedEvent === event ? '#000' : '#fff',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontFamily: '"JetBrains Mono", monospace'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedEvent !== event) {
                          e.currentTarget.style.background = '#1a2530';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedEvent !== event) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {event.toUpperCase().replace(/-/g, ' ')}
                    </button>
                  ))}

                  {showEventPerformance && (
                    <button
                      onClick={() => {
                        setShowEventPerformance(false);
                        setSelectedEvent(null);
                        setEventPerformanceData([]);
                        setIsEventsDropdownOpen(false);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 12px',
                        background: '#ff0000',
                        color: '#fff',
                        border: 'none',
                        textAlign: 'center',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontFamily: '"JetBrains Mono", monospace',
                        marginTop: '8px',
                        fontWeight: 'bold'
                      }}
                    >
                      CLEAR
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Pattern Analysis Button */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              className={`toggle-btn ${showPatternPerformance ? 'active' : ''}`}
              onClick={() => setIsPatternDropdownOpen(!isPatternDropdownOpen)}
              style={{
                marginLeft: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#000000',
                color: '#fff',
                border: '1px solid #333333',
                boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
              }}
            >
              <span>Pattern Analysis {selectedPattern.length > 0 ? `(${selectedPattern.length})` : ''}</span>
              {selectedPattern.length > 0 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPattern([]);
                    setShowPatternPerformance(false);
                    setPatternPerformanceData([]);
                  }}
                  style={{
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    color: '#00CED1',
                    marginLeft: '4px'
                  }}
                >
                  ✕
                </span>
              )}
            </button>

            {isPatternDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                background: '#0a1520',
                border: '1px solid #00CED1',
                borderRadius: '4px',
                marginTop: '4px',
                minWidth: '250px',
                maxHeight: '500px',
                overflowY: 'auto',
                zIndex: 9999,
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
              }}>
                <div style={{ padding: '8px' }}>
                  <div style={{ color: '#00CED1', fontWeight: 'bold', fontSize: '12px', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>52-WEEK BREAKOUTS</div>

                  {[
                    { id: '52week-high-cooldown', label: '52W High (90d Cooldown)' },
                    { id: '52week-high-annual', label: '52W High (Annual)' },
                    { id: '52week-low-cooldown', label: '52W Low (90d Cooldown)' },
                    { id: '52week-low-annual', label: '52W Low (Annual)' }
                  ].map(pattern => (
                    <button
                      key={pattern.id}
                      onClick={() => {
                        const isSelected = selectedPattern.includes(pattern.label);
                        if (isSelected) {
                          // Remove pattern
                          setSelectedPattern(prev => prev.filter(p => p !== pattern.label));
                          setPatternPerformanceData(prev => prev.filter(p => p.patternName !== pattern.label));
                          if (selectedPattern.length === 1) {
                            setShowPatternPerformance(false);
                          }
                        } else {
                          // Add pattern
                          setSelectedPattern(prev => [...prev, pattern.label]);
                          setShowPatternPerformance(true);
                          setShowEventPerformance(false);
                          calculatePatternPerformance(pattern.id, pattern.label, symbol);
                        }
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 12px',
                        background: selectedPattern.includes(pattern.label) ? '#00CED1' : 'transparent',
                        color: selectedPattern.includes(pattern.label) ? '#000' : '#fff',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontFamily: '"JetBrains Mono", monospace'
                      }}
                      onMouseEnter={(e) => {
                        if (!selectedPattern.includes(pattern.label)) {
                          e.currentTarget.style.background = '#1a2530';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selectedPattern.includes(pattern.label)) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {pattern.label}
                    </button>
                  ))}

                  <div style={{ color: '#00CED1', fontWeight: 'bold', fontSize: '12px', margin: '12px 0 8px 0', borderBottom: '1px solid #333', paddingBottom: '4px' }}>8-11% MOVES</div>

                  {[
                    { id: 'move-8-11-up-cooldown', label: '8-11% UP (90d Cooldown)' },
                    { id: 'move-8-11-up-annual', label: '8-11% UP (Annual)' },
                    { id: 'move-8-11-down-cooldown', label: '8-11% DOWN (90d Cooldown)' },
                    { id: 'move-8-11-down-annual', label: '8-11% DOWN (Annual)' }
                  ].map(pattern => (
                    <button
                      key={pattern.id}
                      onClick={() => {
                        const isSelected = selectedPattern.includes(pattern.label);
                        if (isSelected) {
                          setSelectedPattern(prev => prev.filter(p => p !== pattern.label));
                          setPatternPerformanceData(prev => prev.filter(p => p.patternName !== pattern.label));
                          if (selectedPattern.length === 1) {
                            setShowPatternPerformance(false);
                          }
                        } else {
                          setSelectedPattern(prev => [...prev, pattern.label]);
                          setShowPatternPerformance(true);
                          setShowEventPerformance(false);
                          calculatePatternPerformance(pattern.id, pattern.label, symbol);
                        }
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 12px',
                        background: selectedPattern.includes(pattern.label) ? '#00CED1' : 'transparent',
                        color: selectedPattern.includes(pattern.label) ? '#000' : '#fff',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontFamily: '"JetBrains Mono", monospace'
                      }}
                      onMouseEnter={(e) => {
                        if (!selectedPattern.includes(pattern.label)) {
                          e.currentTarget.style.background = '#1a2530';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selectedPattern.includes(pattern.label)) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {pattern.label}
                    </button>
                  ))}

                  <div style={{ color: '#00CED1', fontWeight: 'bold', fontSize: '12px', margin: '12px 0 8px 0', borderBottom: '1px solid #333', paddingBottom: '4px' }}>18-22% MOVES</div>

                  {[
                    { id: 'move-18-22-up-cooldown', label: '18-22% UP (90d Cooldown)' },
                    { id: 'move-18-22-up-annual', label: '18-22% UP (Annual)' },
                    { id: 'move-18-22-down-cooldown', label: '18-22% DOWN (90d Cooldown)' },
                    { id: 'move-18-22-down-annual', label: '18-22% DOWN (Annual)' }
                  ].map(pattern => (
                    <button
                      key={pattern.id}
                      onClick={() => {
                        const isSelected = selectedPattern.includes(pattern.label);
                        if (isSelected) {
                          setSelectedPattern(prev => prev.filter(p => p !== pattern.label));
                          setPatternPerformanceData(prev => prev.filter(p => p.patternName !== pattern.label));
                          if (selectedPattern.length === 1) {
                            setShowPatternPerformance(false);
                          }
                        } else {
                          setSelectedPattern(prev => [...prev, pattern.label]);
                          setShowPatternPerformance(true);
                          setShowEventPerformance(false);
                          calculatePatternPerformance(pattern.id, pattern.label, symbol);
                        }
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 12px',
                        background: selectedPattern.includes(pattern.label) ? '#00CED1' : 'transparent',
                        color: selectedPattern.includes(pattern.label) ? '#000' : '#fff',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontFamily: '"JetBrains Mono", monospace'
                      }}
                      onMouseEnter={(e) => {
                        if (!selectedPattern.includes(pattern.label)) {
                          e.currentTarget.style.background = '#1a2530';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selectedPattern.includes(pattern.label)) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {pattern.label}
                    </button>
                  ))}

                  {selectedPattern.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedPattern([]);
                        setShowPatternPerformance(false);
                        setPatternPerformanceData([]);
                        setIsPatternDropdownOpen(false);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '6px 12px',
                        background: '#ff0000',
                        color: '#fff',
                        border: 'none',
                        textAlign: 'center',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontFamily: '"JetBrains Mono", monospace',
                        marginTop: '8px',
                        fontWeight: 'bold'
                      }}
                    >
                      CLEAR
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="chart-legend-inline desktop-only-btn" style={{ marginLeft: '250px' }}>
          <div className="toggle-buttons">
            <button
              className={`toggle-btn ${showRecentYears ? 'active' : ''}`}
              onClick={() => setShowRecentYears(!showRecentYears)}
              style={{
                background: '#000000',
                color: '#fff',
                border: '1px solid #333333',
                boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
              }}
            >
              Normal (Solid)
            </button>
            <button
              className={`toggle-btn ${showPostElectionYears ? 'active' : ''}`}
              onClick={() => setShowPostElectionYears(!showPostElectionYears)}
              style={{
                background: '#000000',
                color: '#fff',
                border: '1px solid #333333',
                boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
              }}
            >
              Election (Dashed)
            </button>
          </div>
        </div>
      </div>

      <div className="chart-container" ref={containerRef}>
        {loading && (
          <div className="chart-loading">
            <div className="loading-spinner"></div>
            <p>Loading {MONTH_NAMES[selectedMonth]} seasonal data...</p>
          </div>
        )}

        {error && (
          <div className="chart-error">
            <p>{error}</p>
            <button onClick={loadData}>Retry</button>
          </div>
        )}

        {activeView === 'chart' && <canvas ref={canvasRef} />}
        {activeView === 'calendar' && (
          <div style={{ width: '100%', overflow: 'auto', padding: typeof window !== 'undefined' && window.innerWidth <= 768 ? '8px' : '20px' }}>
            <style>{`
              .almanac-daily-chart .calendar-grid {
                display: block !important;
                border: 2px solid #ffffff !important;
                background: #000000 !important;
              }
              .almanac-daily-chart .calendar-header-row {
                display: grid !important;
                grid-template-columns: repeat(5, 1fr) !important;
                background: #000000 !important;
                border-bottom: 2px solid #ffffff !important;
              }
              .almanac-daily-chart .calendar-days {
                display: grid !important;
                grid-template-columns: repeat(5, 1fr) !important;
              }
              .almanac-daily-chart .day-header {
                padding: 12px 8px !important;
                text-align: center !important;
                font-weight: 700 !important;
                font-size: 20px !important;
                color: #ffffff !important;
                background: linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #0a0a0a 100%) !important;
                border-right: 1px solid #333333 !important;
                text-transform: uppercase !important;
                letter-spacing: 1px !important;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3) !important;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8), 0 -1px 0 rgba(255, 255, 255, 0.1) !important;
              }
              .almanac-daily-chart .day-header:last-child {
                border-right: none !important;
              }
              .almanac-daily-chart .calendar-day {
                min-height: 120px !important;
                border-right: 1px solid #333333 !important;
                border-bottom: 1px solid #333333 !important;
                padding: 8px !important;
                background: #000000 !important;
                position: relative !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 4px !important;
              }
              .almanac-daily-chart .calendar-day:nth-child(5n) {
                border-right: none !important;
              }
              .almanac-daily-chart .calendar-day.other-month {
                background: #050505 !important;
                opacity: 0.3 !important;
              }
              .almanac-daily-chart .calendar-day.holiday {
                background: #0f0a0a !important;
              }
              .almanac-daily-chart .calendar-day.bullish-day {
                background: linear-gradient(135deg, rgba(0, 255, 0, 0.03) 0%, #000000 100%) !important;
                border-left: 2px solid rgba(0, 255, 0, 0.4) !important;
              }
              .almanac-daily-chart .calendar-day.bearish-day {
                background: linear-gradient(135deg, rgba(255, 0, 0, 0.03) 0%, #000000 100%) !important;
                border-left: 2px solid rgba(255, 0, 0, 0.4) !important;
              }
            `}</style>
            <AlmanacCalendar month={selectedMonth} year={new Date().getFullYear()} symbol={symbol} />
          </div>
        )}
        {activeView === 'table' && (
          <div style={{
            padding: typeof window !== 'undefined' && window.innerWidth <= 768 ? '0' : 'inherit',
            margin: typeof window !== 'undefined' && window.innerWidth <= 768 ? '-20px 0 0 0' : '0'
          }}>
            <WeeklyScanTable />
          </div>
        )}
      </div>

      {activeView === 'chart' && (
        <div className="legend-row" style={{ marginTop: '4px', display: 'flex', justifyContent: 'center', gap: '20px' }}>
          {isIndex ? (
            <>
              <div className="legend-item"><span>DIA</span><span className="legend-line solid" style={{ backgroundColor: '#FFFFFF' }}></span><span className="legend-line dashed" style={{ background: 'repeating-linear-gradient(90deg, #FFFFFF 0px, #FFFFFF 4px, transparent 4px, transparent 7px)' }}></span></div>
              <div className="legend-item"><span>SPY</span><span className="legend-line solid" style={{ backgroundColor: '#00C853' }}></span><span className="legend-line dashed" style={{ background: 'repeating-linear-gradient(90deg, #00C853 0px, #00C853 4px, transparent 4px, transparent 7px)' }}></span></div>
              <div className="legend-item"><span>QQQ</span><span className="legend-line solid" style={{ backgroundColor: '#2196F3' }}></span><span className="legend-line dashed" style={{ background: 'repeating-linear-gradient(90deg, #2196F3 0px, #2196F3 4px, transparent 4px, transparent 7px)' }}></span></div>
              <div className="legend-item"><span>IWM</span><span className="legend-line solid" style={{ backgroundColor: '#FF5722' }}></span><span className="legend-line dashed" style={{ background: 'repeating-linear-gradient(90deg, #FF5722 0px, #FF5722 4px, transparent 4px, transparent 7px)' }}></span></div>
            </>
          ) : (
            <div className="legend-item"><span>{symbol}</span><span className="legend-line solid" style={{ backgroundColor: '#FFFFFF' }}></span><span className="legend-line dashed" style={{ background: 'repeating-linear-gradient(90deg, #FFD700 0px, #FFD700 4px, transparent 4px, transparent 7px)' }}></span></div>
          )}
        </div>
      )}

      {/* Pattern Details Popup */}
      {showPatternDetails && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={() => setShowPatternDetails(false)}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #000000 0%, #0a1520 100%)',
              border: '2px solid #1a2332',
              borderRadius: '0',
              padding: '0',
              minWidth: '500px',
              maxWidth: '650px',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 0 40px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Bar */}
            <div style={{
              background: 'linear-gradient(180deg, #0f1922 0%, #060a0f 100%)',
              padding: '16px 24px',
              borderBottom: '1px solid #1a2332',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5)'
            }}>
              <h3 style={{
                color: '#FF6600',
                margin: 0,
                fontSize: '16px',
                fontFamily: '"JetBrains Mono", monospace',
                fontWeight: 'bold',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                textShadow: '0 0 10px rgba(255, 102, 0, 0.3)'
              }}>
                ◢ Pattern Analysis Details
              </h3>
              <button
                onClick={() => setShowPatternDetails(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #3a4a5a',
                  color: '#88a8c8',
                  padding: '4px 12px',
                  cursor: 'pointer',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '24px' }}>
              <div style={{
                color: '#FFFFFF',
                fontSize: '13px',
                fontFamily: '"JetBrains Mono", monospace',
                lineHeight: '1.8'
              }}>

                {patternPerformanceData.map((patternSet, idx) => (
                  <div key={idx} style={{ marginBottom: '24px' }}>
                    {/* Pattern Header - Single Row */}
                    <div style={{
                      background: 'linear-gradient(135deg, #0a1520 0%, #0f1f30 100%)',
                      border: '1px solid #1a2f42',
                      borderLeft: `4px solid ${patternSet.color}`,
                      padding: '14px 20px',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.5)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#FF6600', fontWeight: 'bold', fontSize: '13px', opacity: 1 }}>Symbol:</span>
                        <span style={{ color: '#FF6600', fontWeight: 'bold', fontSize: '14px', opacity: 1 }}>{symbol}</span>
                        <span style={{ color: '#FFFFFF', fontSize: '13px', opacity: 1, marginLeft: '8px' }}>
                          <span style={{ color: patternSet.color }}>●</span> {patternSet.patternName}
                        </span>
                        <span style={{
                          background: 'rgba(10, 31, 48, 0.8)',
                          border: '1px solid #2a4a6a',
                          padding: '3px 10px',
                          fontSize: '11px',
                          color: '#88a8c8',
                          fontWeight: 'bold',
                          letterSpacing: '0.5px',
                          opacity: 1,
                          marginLeft: '8px'
                        }}>
                          {patternSet.occurrences} OCCURRENCES
                        </span>
                      </div>
                    </div>

                    {/* Occurrence Details Table */}
                    {(patternSet.occurrenceDetails || []).length > 0 && (
                      <div style={{
                        background: '#000000',
                        border: '1px solid #1a2f42',
                        borderRadius: '0',
                        overflow: 'hidden',
                        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6)'
                      }}>
                        <table style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '12px',
                          tableLayout: 'fixed'
                        }}>
                          <thead style={{
                            background: 'linear-gradient(180deg, #0a1520 0%, #060d15 100%)',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                            display: 'table',
                            width: '100%',
                            tableLayout: 'fixed'
                          }}>
                            <tr>
                              <th style={{
                                padding: '12px 16px',
                                textAlign: 'left',
                                color: '#FF6600',
                                fontWeight: 'bold',
                                fontSize: '11px',
                                letterSpacing: '1.2px',
                                borderBottom: '1px solid #2a4a6a',
                                textTransform: 'uppercase',
                                opacity: 1,
                                width: '40%'
                              }}>
                                Date
                              </th>
                              <th style={{
                                padding: '12px 16px',
                                textAlign: 'right',
                                color: '#FF6600',
                                fontWeight: 'bold',
                                fontSize: '11px',
                                letterSpacing: '1.2px',
                                borderBottom: '1px solid #2a4a6a',
                                textTransform: 'uppercase',
                                opacity: 1,
                                width: '30%'
                              }}>
                                Price
                              </th>
                              <th style={{
                                padding: '12px 16px',
                                textAlign: 'right',
                                color: '#FF6600',
                                fontWeight: 'bold',
                                fontSize: '11px',
                                letterSpacing: '1.2px',
                                borderBottom: '1px solid #2a4a6a',
                                textTransform: 'uppercase',
                                opacity: 1,
                                width: '30%'
                              }}>
                                Change %
                              </th>
                            </tr>
                          </thead>
                          <tbody style={{
                            maxHeight: '300px',
                            overflowY: 'auto',
                            display: 'block'
                          }}>
                            {(patternSet.occurrenceDetails || []).map((occ, i) => (
                              <tr key={i} style={{
                                borderBottom: '1px solid #0a1520',
                                display: 'table',
                                width: '100%',
                                tableLayout: 'fixed',
                                transition: 'background 0.2s',
                                background: i % 2 === 0 ? '#050a10' : 'transparent'
                              }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(10, 31, 48, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = i % 2 === 0 ? '#050a10' : 'transparent';
                                }}>
                                <td style={{
                                  padding: '10px 16px',
                                  color: '#FFFFFF',
                                  opacity: 1,
                                  fontFamily: '"JetBrains Mono", monospace',
                                  fontSize: '12px',
                                  width: '40%',
                                  textAlign: 'left'
                                }}>
                                  {occ.date.toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: '2-digit'
                                  })}
                                </td>
                                <td style={{
                                  padding: '10px 16px',
                                  textAlign: 'right',
                                  color: '#FFFFFF',
                                  opacity: 1,
                                  fontFamily: '"JetBrains Mono", monospace',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  width: '30%'
                                }}>
                                  ${occ.priceAtEvent.toFixed(2)}
                                </td>
                                <td style={{
                                  padding: '10px 16px',
                                  textAlign: 'right',
                                  color: occ.changePercent && occ.changePercent > 0 ? '#00FF41' : '#FF4444',
                                  opacity: 1,
                                  fontFamily: '"JetBrains Mono", monospace',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  textShadow: occ.changePercent && occ.changePercent > 0
                                    ? '0 0 8px rgba(0, 255, 65, 0.5)'
                                    : '0 0 8px rgba(255, 68, 68, 0.5)',
                                  width: '30%'
                                }}>
                                  {occ.changePercent ? `${occ.changePercent > 0 ? '+' : ''}${occ.changePercent.toFixed(2)}%` : 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Close Button */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #1a2f42',
              background: 'linear-gradient(180deg, #060d15 0%, #000000 100%)'
            }}>
              <button
                onClick={() => setShowPatternDetails(false)}
                style={{
                  padding: '12px 24px',
                  background: 'linear-gradient(180deg, #0f1f30 0%, #0a1520 100%)',
                  color: '#88a8c8',
                  border: '1px solid #2a4a6a',
                  borderRadius: '0',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '12px',
                  width: '100%',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  opacity: 1,
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(180deg, #1a3a5a 0%, #0f2540 100%)';
                  e.currentTarget.style.borderColor = '#4a6a8a';
                  e.currentTarget.style.color = '#a8c8e8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(180deg, #0f1f30 0%, #0a1520 100%)';
                  e.currentTarget.style.borderColor = '#2a4a6a';
                  e.currentTarget.style.color = '#88a8c8';
                }}
              >
                ◢ Close Terminal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlmanacDailyChart;
