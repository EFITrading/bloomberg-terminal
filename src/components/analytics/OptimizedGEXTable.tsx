import React, { useMemo } from 'react';
import { VirtualizedTable } from '../ui/VirtualizedTable';

interface GEXData {
  strike: number;
  [key: string]: any;
}

interface OptimizedGEXTableProps {
  data: GEXData[];
  expirations: string[];
  currentPrice: number;
  formatCurrency: (value: number) => string;
  getCellStyle: (value: number) => string;
}

export const OptimizedGEXTable: React.FC<OptimizedGEXTableProps> = ({
  data,
  expirations,
  currentPrice,
  formatCurrency,
  getCellStyle
}) => {
  // Pre-calculate expensive computations
  const optimizedData = useMemo(() => {
    const closestStrike = currentPrice > 0 ? data.reduce((closest, current) => 
      Math.abs(current.strike - currentPrice) < Math.abs(closest.strike - currentPrice) ? current : closest
    ).strike : 0;

    const largestValueStrike = data.reduce((largest, current) => {
      const currentMaxValue = Math.max(...expirations.map(exp => {
        const value = current[exp] as {call: number, put: number, net: number};
        return Math.max(Math.abs(value?.call || 0), Math.abs(value?.put || 0));
      }));
      const largestMaxValue = Math.max(...expirations.map(exp => {
        const value = largest[exp] as {call: number, put: number, net: number};
        return Math.max(Math.abs(value?.call || 0), Math.abs(value?.put || 0));
      }));
      return currentMaxValue > largestMaxValue ? current : largest;
    }).strike;

    return data.map(row => ({
      ...row,
      isCurrentPriceRow: currentPrice > 0 && row.strike === closestStrike,
      isLargestValueRow: row.strike === largestValueStrike,
    }));
  }, [data, currentPrice, expirations]);

  const tableColumns = useMemo(() => [
    {
      key: 'strike',
      header: <div className="text-center font-bold">STRIKE</div>,
      width: '120px',
      sticky: true,
      render: (row: any) => (
        <div className={`text-base font-mono font-bold text-center ${
          row.isCurrentPriceRow ? 'text-yellow-300' : 
          row.isLargestValueRow ? 'text-purple-300' : 'text-white'
        }`} style={{
          textShadow: row.isCurrentPriceRow ? '0 0 12px rgba(234, 179, 8, 0.8)' : 
                     row.isLargestValueRow ? '0 0 15px rgba(147, 51, 234, 0.9)' : 
                     '0 0 8px rgba(255,255,255,0.5)'
        }}>
          {row.strike.toFixed(1)}
          {row.isCurrentPriceRow && <span className="ml-2 text-xs text-yellow-400">● CURRENT</span>}
        </div>
      )
    },
    ...expirations.map(exp => ({
      key: exp,
      header: (
        <div className="text-center">
          <div className="text-xs font-bold text-blue-300">{exp}</div>
          <div className="flex justify-center gap-2 mt-1">
            <span className="text-xs text-green-400">CALL</span>
            <span className="text-xs text-red-400">PUT</span>
          </div>
        </div>
      ),
      width: '140px',
      render: (row: any) => {
        const value = row[exp] as {call: number, put: number, net: number};
        const callValue = value?.call || 0;
        const putValue = value?.put || 0;
        
        return (
          <div className="flex gap-1">
            <div className={`${getCellStyle(callValue)} px-2 py-1 rounded text-center font-mono flex-1 text-xs font-bold transition-all hover:scale-105`}>
              {formatCurrency(callValue)}
            </div>
            <div className={`${getCellStyle(putValue)} px-2 py-1 rounded text-center font-mono flex-1 text-xs font-bold transition-all hover:scale-105`}>
              {formatCurrency(putValue)}
            </div>
          </div>
        );
      }
    }))
  ], [expirations, formatCurrency, getCellStyle]);

  return (
    <VirtualizedTable
      data={optimizedData}
      height={600} // Fixed height for virtualization
      itemHeight={60} // Height per row
      columns={tableColumns}
      overscan={10} // Render 10 extra items for smooth scrolling
      className="border border-gray-700 rounded-lg"
    />
  );
};

export default OptimizedGEXTable;