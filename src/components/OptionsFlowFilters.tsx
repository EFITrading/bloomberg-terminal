'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';

interface OptionsFlowFiltersProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyFilters: (filters: FilterOptions) => void;
  currentFilters: FilterOptions;
}

export interface FilterOptions {
  // Option Type
  puts: boolean;
  calls: boolean;
  
  // Flow Colors
  yellow: boolean;
  white: boolean;
  magenta: boolean;
  
  // Bid/Ask
  aboveAsk: boolean;
  belowBid: boolean;
  atOrAboveAsk: boolean;
  atOrBelowBid: boolean;
  
  // Details
  addMultiLeg: boolean;
  onlyMultiLeg: boolean;
  contractPriceUnder50Cents: boolean;
  contractPriceUnder5Dollars: boolean;
  contracts100Plus: boolean;
  contracts500Plus: boolean;
  contracts5000Plus: boolean;
  
  // Security Type
  stock: boolean;
  etf: boolean;
  
  // Value (Premium)
  premium50k: boolean;
  premium100k: boolean;
  premium200k: boolean;
  premium500k: boolean;
  premium1mil: boolean;
  marketCapUnder75T: boolean;
  
  // Other
  inTheMoney: boolean;
  outTheMoney: boolean;
  sweepOnly: boolean;
  weeklyOnly: boolean;
  earningsReportOnly: boolean;
  unusualActivityOnly: boolean;
  showExDiv: boolean;
  
  // Sectors
  consumerDiscretionary: boolean;
  industrials: boolean;
  informationTechnology: boolean;
  realEstate: boolean;
  healthCare: boolean;
  energy: boolean;
  financials: boolean;
  materials: boolean;
  consumerStaples: boolean;
  communicationServices: boolean;
  utilities: boolean;
  
  // Expiration
  expirationStart: string;
  expirationEnd: string;
  
  // Watch List
  omit: boolean;
  only: boolean;
}

const defaultFilters: FilterOptions = {
  puts: true,
  calls: true,
  yellow: true,
  white: true,
  magenta: true,
  aboveAsk: true,
  belowBid: true,
  atOrAboveAsk: true,
  atOrBelowBid: true,
  addMultiLeg: false,
  onlyMultiLeg: false,
  contractPriceUnder50Cents: false,
  contractPriceUnder5Dollars: false,
  contracts100Plus: false,
  contracts500Plus: false,
  contracts5000Plus: false,
  stock: true,
  etf: true,
  premium50k: false,
  premium100k: true,
  premium200k: true,
  premium500k: true,
  premium1mil: true,
  marketCapUnder75T: false,
  inTheMoney: false,
  outTheMoney: true,
  sweepOnly: false,
  weeklyOnly: false,
  earningsReportOnly: false,
  unusualActivityOnly: false,
  showExDiv: false,
  consumerDiscretionary: true,
  industrials: true,
  informationTechnology: true,
  realEstate: true,
  healthCare: true,
  energy: true,
  financials: true,
  materials: true,
  consumerStaples: true,
  communicationServices: true,
  utilities: true,
  expirationStart: '9/23/2025',
  expirationEnd: '9/23/2025',
  omit: false,
  only: false,
};

export const OptionsFlowFilters: React.FC<OptionsFlowFiltersProps> = ({
  isOpen,
  onClose,
  onApplyFilters,
  currentFilters
}) => {
  const [filters, setFilters] = useState<FilterOptions>(currentFilters || defaultFilters);

  if (!isOpen) return null;

  const handleCheckboxChange = (key: keyof FilterOptions) => {
    setFilters(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleInputChange = (key: keyof FilterOptions, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleApply = () => {
    onApplyFilters(filters);
    onClose();
  };

  const handleReset = () => {
    setFilters(defaultFilters);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Options Flow Filters</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Option Type */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Option Type</h3>
            <div className="space-y-2">
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.puts}
                  onChange={() => handleCheckboxChange('puts')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Puts
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.calls}
                  onChange={() => handleCheckboxChange('calls')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Calls
              </label>
            </div>
          </div>

          {/* Flow Colors */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Flow Colors</h3>
            <div className="space-y-2">
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.yellow}
                  onChange={() => handleCheckboxChange('yellow')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <span className="bg-yellow-400 text-black px-2 py-1 rounded text-sm">Yellow</span>
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.white}
                  onChange={() => handleCheckboxChange('white')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <span className="bg-white text-black px-2 py-1 rounded text-sm">White</span>
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.magenta}
                  onChange={() => handleCheckboxChange('magenta')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <span className="bg-magenta-500 text-white px-2 py-1 rounded text-sm">Magenta</span>
              </label>
            </div>
          </div>

          {/* Bid/Ask */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Bid/Ask</h3>
            <div className="space-y-2">
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.aboveAsk}
                  onChange={() => handleCheckboxChange('aboveAsk')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Above Ask
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.belowBid}
                  onChange={() => handleCheckboxChange('belowBid')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Below Bid
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.atOrAboveAsk}
                  onChange={() => handleCheckboxChange('atOrAboveAsk')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                At or Above Ask
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.atOrBelowBid}
                  onChange={() => handleCheckboxChange('atOrBelowBid')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                At or Below Bid
              </label>
            </div>
          </div>

          {/* Details */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Details</h3>
            <div className="space-y-2">
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.addMultiLeg}
                  onChange={() => handleCheckboxChange('addMultiLeg')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Add Multi-leg
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.onlyMultiLeg}
                  onChange={() => handleCheckboxChange('onlyMultiLeg')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Only Multi-leg
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.contractPriceUnder50Cents}
                  onChange={() => handleCheckboxChange('contractPriceUnder50Cents')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                &lt;= .50 (Contract Price)
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.contractPriceUnder5Dollars}
                  onChange={() => handleCheckboxChange('contractPriceUnder5Dollars')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                &lt;= 5.00 (Contract Price)
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.contracts100Plus}
                  onChange={() => handleCheckboxChange('contracts100Plus')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                &gt;= 100 Contracts
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.contracts500Plus}
                  onChange={() => handleCheckboxChange('contracts500Plus')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                &gt;= 500 Contracts
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.contracts5000Plus}
                  onChange={() => handleCheckboxChange('contracts5000Plus')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                &gt;= 5000 Contracts
              </label>
            </div>
          </div>

          {/* Security Type */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Security Type</h3>
            <div className="space-y-2">
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.stock}
                  onChange={() => handleCheckboxChange('stock')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Stock
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.etf}
                  onChange={() => handleCheckboxChange('etf')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                ETF
              </label>
            </div>
          </div>

          {/* Value (Premium) */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Value (Premium)</h3>
            <div className="space-y-2">
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.premium50k}
                  onChange={() => handleCheckboxChange('premium50k')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                &gt;= $50,000
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.premium100k}
                  onChange={() => handleCheckboxChange('premium100k')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                &gt;= $100,000
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.premium200k}
                  onChange={() => handleCheckboxChange('premium200k')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                &gt;= $200,000
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.premium500k}
                  onChange={() => handleCheckboxChange('premium500k')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                &gt;= $500,000
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.premium1mil}
                  onChange={() => handleCheckboxChange('premium1mil')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                &gt;= $1mil
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.marketCapUnder75T}
                  onChange={() => handleCheckboxChange('marketCapUnder75T')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                &lt; $0.75T Mkt Cap
              </label>
            </div>
          </div>

          {/* Other */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Other</h3>
            <div className="space-y-2">
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.inTheMoney}
                  onChange={() => handleCheckboxChange('inTheMoney')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                In The Money
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.outTheMoney}
                  onChange={() => handleCheckboxChange('outTheMoney')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Out The Money
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.sweepOnly}
                  onChange={() => handleCheckboxChange('sweepOnly')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Sweep Only
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.weeklyOnly}
                  onChange={() => handleCheckboxChange('weeklyOnly')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Weekly Only
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.earningsReportOnly}
                  onChange={() => handleCheckboxChange('earningsReportOnly')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Earnings Report Only
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.unusualActivityOnly}
                  onChange={() => handleCheckboxChange('unusualActivityOnly')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Unusual Activity Only
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.showExDiv}
                  onChange={() => handleCheckboxChange('showExDiv')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Show Ex-Div
              </label>
            </div>
          </div>

          {/* Sectors */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Sectors</h3>
            <div className="space-y-2">
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.consumerDiscretionary}
                  onChange={() => handleCheckboxChange('consumerDiscretionary')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Consumer Discretionary
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.industrials}
                  onChange={() => handleCheckboxChange('industrials')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Industrials
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.informationTechnology}
                  onChange={() => handleCheckboxChange('informationTechnology')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Information Technology
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.realEstate}
                  onChange={() => handleCheckboxChange('realEstate')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Real Estate
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.healthCare}
                  onChange={() => handleCheckboxChange('healthCare')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Health Care
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.energy}
                  onChange={() => handleCheckboxChange('energy')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Energy
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.financials}
                  onChange={() => handleCheckboxChange('financials')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Financials
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.materials}
                  onChange={() => handleCheckboxChange('materials')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Materials
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.consumerStaples}
                  onChange={() => handleCheckboxChange('consumerStaples')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Consumer Staples
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.communicationServices}
                  onChange={() => handleCheckboxChange('communicationServices')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Communication Services
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.utilities}
                  onChange={() => handleCheckboxChange('utilities')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Utilities
              </label>
            </div>
          </div>

          {/* Expiration */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Expiration</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Start</label>
                <input
                  type="text"
                  value={filters.expirationStart}
                  onChange={(e) => handleInputChange('expirationStart', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                  placeholder="9/23/2025"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">End</label>
                <input
                  type="text"
                  value={filters.expirationEnd}
                  onChange={(e) => handleInputChange('expirationEnd', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                  placeholder="9/23/2025"
                />
              </div>
            </div>
          </div>

          {/* Watch List */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Watch List</h3>
            <div className="space-y-2">
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.omit}
                  onChange={() => handleCheckboxChange('omit')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Omit
              </label>
              <label className="flex items-center text-white">
                <input
                  type="checkbox"
                  checked={filters.only}
                  onChange={() => handleCheckboxChange('only')}
                  className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                Only
              </label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4 mt-8 pt-4 border-t border-gray-700">
          <button
            onClick={handleReset}
            className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};

export default OptionsFlowFilters;