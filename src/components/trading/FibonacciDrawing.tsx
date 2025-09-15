"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Ruler, RotateCcw } from 'lucide-react';

interface DataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FibonacciDrawingProps {
  canvas: HTMLCanvasElement | null;
  data: DataPoint[];
  isActive: boolean;
  onToggle: () => void;
  onClear: () => void;
}

interface FibLevel {
  level: number;
  label: string;
  color: string;
}

const FIB_LEVELS: FibLevel[] = [
  { level: 0, label: '0.0%', color: '#ffffff' },
  { level: 0.236, label: '23.6%', color: '#ff6b6b' },
  { level: 0.382, label: '38.2%', color: '#4ecdc4' },
  { level: 0.5, label: '50.0%', color: '#45b7d1' },
  { level: 0.618, label: '61.8%', color: '#96ceb4' },
  { level: 0.786, label: '78.6%', color: '#feca57' },
  { level: 1, label: '100.0%', color: '#ffffff' },
];

interface FibRetracement {
  id: number;
  start: { x: number; y: number; price: number };
  end: { x: number; y: number; price: number };
  levels: FibLevel[];
}

export default function FibonacciDrawing({ 
  canvas, 
  data, 
  isActive, 
  onToggle, 
  onClear 
}: FibonacciDrawingProps) {
  const [fibRetracements, setFibRetracements] = useState<FibRetracement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number; price: number } | null>(null);

  useEffect(() => {
    if (!canvas || !isActive) return;

    const handleClick = (event: MouseEvent) => {
      if (!canvas || data.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Convert x,y to price and time
      const margin = { top: 20, right: 80, bottom: 60, left: 60 };
      const chartWidth = canvas.width - margin.left - margin.right;
      const chartHeight = canvas.height - margin.top - margin.bottom - 100;

      if (x < margin.left || x > margin.left + chartWidth) return;

      // Calculate price from y coordinate
      const prices = data.flatMap(d => [d.high, d.low]);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice;
      const padding = priceRange * 0.1;
      
      const price = maxPrice + padding - ((y - margin.top) / chartHeight) * (priceRange + 2 * padding);

      if (!isDrawing) {
        // Start drawing
        setStartPoint({ x, y, price });
        setIsDrawing(true);
      } else {
        // Complete drawing
        if (startPoint) {
          const newFib = {
            id: Date.now(),
            start: startPoint,
            end: { x, y, price },
            levels: FIB_LEVELS
          };
          setFibRetracements(prev => [...prev, newFib]);
        }
        setIsDrawing(false);
        setStartPoint(null);
        onToggle(); // Turn off drawing mode
      }
    };

    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [canvas, data, isActive, isDrawing, startPoint, onToggle]);

  // Draw fibonacci retracements
  useEffect(() => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // This will be called after the main chart is drawn
    const drawFibs = () => {
      fibRetracements.forEach(fib => {
        const priceDiff = fib.end.price - fib.start.price;
        
        fib.levels.forEach((level) => {
          const fibPrice = fib.start.price + (priceDiff * level.level);
          
          // Convert price back to y coordinate
          const margin = { top: 20, right: 80, bottom: 60, left: 60 };
          const chartHeight = canvas.height - margin.top - margin.bottom - 100;
          const prices = data.flatMap(d => [d.high, d.low]);
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const priceRange = maxPrice - minPrice;
          const padding = priceRange * 0.1;
          
          const y = margin.top + ((maxPrice + padding - fibPrice) / (priceRange + 2 * padding)) * chartHeight;
          
          // Draw fibonacci line
          ctx.strokeStyle = level.color;
          ctx.lineWidth = level.level === 0 || level.level === 1 ? 2 : 1;
          ctx.setLineDash(level.level === 0 || level.level === 1 ? [] : [5, 5]);
          
          ctx.beginPath();
          ctx.moveTo(fib.start.x, y);
          ctx.lineTo(fib.end.x, y);
          ctx.stroke();
          
          // Draw price label
          ctx.fillStyle = level.color;
          ctx.font = '12px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(
            `${level.label} - $${fibPrice.toFixed(2)}`, 
            fib.end.x + 5, 
            y + 4
          );
        });
      });
      
      ctx.setLineDash([]);
    };

    // Schedule drawing after the main chart
    setTimeout(drawFibs, 0);
  }, [canvas, fibRetracements, data]);

  const clearAllFibs = () => {
    setFibRetracements([]);
    setIsDrawing(false);
    setStartPoint(null);
    onClear();
  };

  return (
    <div className="flex items-center space-x-2">
      <Button
        size="sm"
        variant={isActive ? "default" : "outline"}
        onClick={onToggle}
        className="text-xs"
      >
        <Ruler className="w-4 h-4 mr-1" />
        Fibonacci
      </Button>
      
      {fibRetracements.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={clearAllFibs}
          className="text-xs"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          Clear Fibs
        </Button>
      )}
      
      {isDrawing && (
        <span className="text-xs text-yellow-400">
          Click second point to complete Fibonacci retracement
        </span>
      )}
    </div>
  );
}
