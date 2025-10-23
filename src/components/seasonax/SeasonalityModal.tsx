'use client';

import React, { useEffect, useState } from 'react';
import SeasonalityChart from '../analytics/SeasonalityChart';

interface SeasonalityModalProps {
 isOpen: boolean;
 onClose: () => void;
 symbol: string;
 companyName?: string;
}

const SeasonalityModal: React.FC<SeasonalityModalProps> = ({
 isOpen,
 onClose,
 symbol,
 companyName
}) => {
 const [isVisible, setIsVisible] = useState(false);

 useEffect(() => {
 if (isOpen) {
 setIsVisible(true);
 // Prevent body scroll when modal is open
 document.body.style.overflow = 'hidden';
 } else {
 // Re-enable body scroll when modal is closed
 document.body.style.overflow = 'unset';
 // Delay hiding to allow for exit animation
 const timer = setTimeout(() => setIsVisible(false), 300);
 return () => clearTimeout(timer);
 }

 // Cleanup on unmount
 return () => {
 document.body.style.overflow = 'unset';
 };
 }, [isOpen]);

 // Handle escape key
 useEffect(() => {
 const handleEscape = (e: KeyboardEvent) => {
 if (e.key === 'Escape') {
 onClose();
 }
 };

 if (isOpen) {
 document.addEventListener('keydown', handleEscape);
 return () => document.removeEventListener('keydown', handleEscape);
 }
 }, [isOpen, onClose]);

 if (!isVisible) return null;

 return (
 <div 
 className={`seasonality-modal-overlay ${isOpen ? 'open' : ''}`}
 onClick={onClose}
 >
 <div 
 className={`seasonality-modal-content ${isOpen ? 'open' : ''}`}
 onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
 >
 {/* Modal Body - Seasonality Chart (Header removed) */}
 <div className="seasonality-modal-body">
 <SeasonalityChart 
 initialSymbol={symbol}
 autoStart={true}
 onClose={onClose}
 />
 </div>
 </div>
 
 <style jsx>{`
 .seasonality-modal-overlay {
 position: fixed;
 top: 0;
 left: 0;
 right: 0;
 bottom: 0;
 background-color: rgba(0, 0, 0, 0.8);
 backdrop-filter: blur(4px);
 display: flex;
 justify-content: center;
 align-items: center;
 z-index: 10000;
 opacity: 0;
 transition: opacity 0.3s ease;
 padding: 2.5vh 7.5vw;
 }
 
 .seasonality-modal-overlay.open {
 opacity: 1;
 }

 .seasonality-modal-content {
 background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
 border-radius: 12px;
 border: 1px solid rgba(255, 255, 255, 0.1);
 box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
 width: 85vw;
 height: 95vh;
 max-width: none;
 max-height: none;
 display: flex;
 flex-direction: column;
 transform: scale(0.9) translateY(20px);
 transition: transform 0.3s ease;
 overflow: hidden;
 }
 
 .seasonality-modal-content.open {
 transform: scale(1) translateY(0);
 }

 .seasonality-modal-body {
 flex: 1;
 overflow: auto;
 padding: 0;
 min-height: 0;
 }
 
 /* Scale down fonts and UI elements for modal display */
 .seasonality-modal-body {
 font-size: 0.8em;
 }
 
 .seasonality-modal-body h1,
 .seasonality-modal-body h2,
 .seasonality-modal-body h3 {
 font-size: 0.75em;
 }
 
 .seasonality-modal-body .chart-controls,
 .seasonality-modal-body .symbol-search,
 .seasonality-modal-body .statistics-panel {
 font-size: 0.8em;
 }
 
 .seasonality-modal-body button {
 font-size: 0.75em;
 padding: 6px 10px;
 }
 
 .seasonality-modal-body input,
 .seasonality-modal-body select {
 font-size: 0.75em;
 }
 
 .seasonality-modal-body .monthly-returns {
 font-size: 0.7em;
 }
 
 .seasonality-modal-body .sweet-spot,
 .seasonality-modal-body .pain-point {
 font-size: 0.75em;
 }
 
 /* Specific seasonality chart components */
 .seasonality-modal-body .seasonax-header {
 padding: 8px 12px;
 }
 
 .seasonality-modal-body .seasonax-header h1,
 .seasonality-modal-body .seasonax-header h2 {
 font-size: 0.9em;
 margin: 0;
 }
 
 .seasonality-modal-body .sweet-pain-buttons button {
 font-size: 0.65em;
 padding: 6px 12px;
 margin: 0 3px;
 }
 
 .seasonality-modal-body .seasonal-notepad {
 font-size: 0.7em;
 }
 
 .seasonality-modal-body .notepad-input,
 .seasonality-modal-body .notepad-display {
 font-size: 0.65em;
 padding: 6px;
 }
 
 /* Chart area scaling */
 .seasonality-modal-body .chart-container {
 font-size: 0.75em;
 width: 100% !important;
 height: 90% !important;
 min-height: 360px !important;
 }
 
 .seasonality-modal-body .chart-legend,
 .seasonality-modal-body .chart-axis {
 font-size: 0.65em;
 }
 
 /* Ensure seasonax header doesn't constrain width */
 .seasonality-modal-body .seasonax-header {
 width: 100% !important;
 overflow-x: auto !important;
 flex-wrap: wrap !important;
 gap: 8px !important;
 padding: 8px 12px !important;
 }
 
 /* Scale down the monthly returns grid */
 .seasonality-modal-body .monthly-grid {
 font-size: 0.65em;
 }
 
 .seasonality-modal-body .monthly-cell {
 padding: 4px 6px;
 font-size: 0.65em;
 }
 
 /* Compact the symbol controls */
 .seasonality-modal-body .symbol-controls {
 padding: 6px 8px;
 }
 
 .seasonality-modal-body .symbol-input {
 font-size: 0.7em;
 padding: 4px 8px;
 }
 
 /* Reduce padding on main sections */
 .seasonality-modal-body .seasonax-container {
 padding: 0;
 min-height: auto !important;
 height: 90% !important;
 display: flex !important;
 flex-direction: column !important;
 }
 
 .seasonality-modal-body .main-content {
 padding: 8px;
 flex: 1 !important;
 min-height: 0 !important;
 }
 
 /* Make statistics panel more compact */
 .seasonality-modal-body .stats-panel {
 font-size: 0.65em;
 padding: 8px;
 }
 
 /* Ensure chart canvas can expand */
 .seasonality-modal-body canvas,
 .seasonality-modal-body svg,
 .seasonality-modal-body .chart-wrapper {
 max-width: 100% !important;
 width: 100% !important;
 }
 
 /* Fix any overflow issues */
 .seasonality-modal-body .seasonax-header > * {
 flex-shrink: 1;
 min-width: 0;
 }
 
 /* Ensure all content fits within modal */
 .seasonality-modal-body .horizontal-monthly-returns {
 width: 100% !important;
 overflow-x: auto !important;
 }
 
 .seasonality-modal-body .monthly-performance-grid {
 width: 100% !important;
 overflow-x: auto !important;
 display: block !important;
 }
 
 /* Make sure controls wrap properly */
 .seasonality-modal-body .sweet-pain-buttons {
 flex-wrap: wrap !important;
 gap: 4px !important;
 }
 
 /* Responsive notepad */
 .seasonality-modal-body .seasonal-notepad {
 min-width: 200px !important;
 flex-shrink: 1 !important;
 }
 
 /* Force full width usage */
 .seasonality-modal-body * {
 box-sizing: border-box !important;
 }
 }
 
 .seasonality-modal-body .stat-item {
 margin: 4px 0;
 }
 
 /* Reduce spacing in controls */
 .seasonality-modal-body .control-group {
 margin: 8px 0;
 }
 
 .seasonality-modal-body .control-label {
 font-size: 0.8em;
 margin-bottom: 4px;
 }

 /* Responsive design */
 @media (max-width: 768px) {
 .seasonality-modal-content {
 width: 98vw;
 height: 95vh;
 border-radius: 12px;
 }
 
 .seasonality-modal-header {
 padding: 16px 20px;
 }
 
 .modal-title {
 font-size: 20px;
 }
 
 .modal-symbol {
 font-size: 16px;
 }
 }
 `}</style>
 </div>
 );
};

export default SeasonalityModal;