import React, { useRef, useEffect, useState, useCallback } from 'react';

// Simple drawing types
interface SimpleDrawing {
 id: number;
 type: 'horizontal_ray' | 'trend_line' | 'horizontal_line';
 x: number;
 y: number;
 price: number;
 color: string;
 selected: boolean;
}

interface SimpleDrawingSystemProps {
 width: number;
 height: number;
 data: any[];
 priceRange: { min: number; max: number };
 onDrawingCreated?: (drawing: SimpleDrawing) => void;
}

export const SimpleDrawingSystem: React.FC<SimpleDrawingSystemProps> = ({
 width,
 height,
 data,
 priceRange,
 onDrawingCreated
}) => {
 const canvasRef = useRef<HTMLCanvasElement>(null);
 const [drawings, setDrawings] = useState<SimpleDrawing[]>([]);
 const [activeTool, setActiveTool] = useState<string | null>(null);
 const [selectedDrawing, setSelectedDrawing] = useState<SimpleDrawing | null>(null);
 const [isDragging, setIsDragging] = useState(false);
 const [crosshair, setCrosshair] = useState({ x: 0, y: 0, visible: false });

 // Convert Y coordinate to price
 const yToPrice = useCallback((y: number) => {
 const ratio = y / height;
 return priceRange.max - ((priceRange.max - priceRange.min) * ratio);
 }, [height, priceRange]);

 // Convert price to Y coordinate
 const priceToY = useCallback((price: number) => {
 const ratio = (priceRange.max - price) / (priceRange.max - priceRange.min);
 return ratio * height;
 }, [height, priceRange]);

 // Render all drawings
 const renderDrawings = useCallback(() => {
 const canvas = canvasRef.current;
 if (!canvas) return;

 const ctx = canvas.getContext('2d');
 if (!ctx) return;

 // Clear canvas
 ctx.clearRect(0, 0, width, height);

 // Draw crosshair
 if (crosshair.visible) {
 ctx.strokeStyle = '#666';
 ctx.setLineDash([2, 2]);
 ctx.lineWidth = 1;
 ctx.beginPath();
 // Vertical line
 ctx.moveTo(crosshair.x, 0);
 ctx.lineTo(crosshair.x, height);
 // Horizontal line
 ctx.moveTo(0, crosshair.y);
 ctx.lineTo(width, crosshair.y);
 ctx.stroke();
 ctx.setLineDash([]);
 }

 // Draw all drawings
 drawings.forEach(drawing => {
 const y = priceToY(drawing.price);
 
 ctx.strokeStyle = drawing.selected ? '#00aaff' : drawing.color;
 ctx.lineWidth = drawing.selected ? 3 : 2;
 ctx.setLineDash([]);

 switch (drawing.type) {
 case 'horizontal_ray':
 // Draw horizontal line from start point to right edge
 ctx.beginPath();
 ctx.moveTo(drawing.x, y);
 ctx.lineTo(width, y);
 ctx.stroke();
 
 // Draw start point marker
 ctx.fillStyle = drawing.selected ? '#00aaff' : drawing.color;
 ctx.beginPath();
 ctx.arc(drawing.x, y, 4, 0, 2 * Math.PI);
 ctx.fill();
 
 // Draw price label
 const priceText = drawing.price.toFixed(2);
 ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
 const textWidth = ctx.measureText(priceText).width + 8;
 ctx.fillRect(width - 60, y - 10, textWidth, 16);
 ctx.fillStyle = drawing.color;
 ctx.font = '12px Arial';
 ctx.fillText(priceText, width - 56, y + 3);
 break;

 case 'horizontal_line':
 ctx.beginPath();
 ctx.moveTo(0, y);
 ctx.lineTo(width, y);
 ctx.stroke();
 break;

 case 'trend_line':
 // For now, just draw horizontal line (extend later)
 ctx.beginPath();
 ctx.moveTo(drawing.x, y);
 ctx.lineTo(width, y);
 ctx.stroke();
 break;
 }
 });
 }, [drawings, crosshair, width, height, priceToY]);

 // Handle mouse move
 const handleMouseMove = useCallback((e: React.MouseEvent) => {
 const rect = canvasRef.current?.getBoundingClientRect();
 if (!rect) return;

 const x = e.clientX - rect.left;
 const y = e.clientY - rect.top;

 setCrosshair({ x, y, visible: true });

 if (isDragging && selectedDrawing) {
 const newPrice = yToPrice(y);
 setDrawings(prev => prev.map(d => 
 d.id === selectedDrawing.id 
 ? { ...d, price: newPrice, y }
 : d
 ));
 }
 }, [isDragging, selectedDrawing, yToPrice]);

 // Handle mouse down
 const handleMouseDown = useCallback((e: React.MouseEvent) => {
 const rect = canvasRef.current?.getBoundingClientRect();
 if (!rect) return;

 const x = e.clientX - rect.left;
 const y = e.clientY - rect.top;
 const price = yToPrice(y);

 // Check if clicking on existing drawing
 const clickedDrawing = drawings.find(drawing => {
 const drawingY = priceToY(drawing.price);
 return drawing.type === 'horizontal_ray' && 
 x >= drawing.x && 
 Math.abs(y - drawingY) < 10;
 });

 if (clickedDrawing) {
 setSelectedDrawing(clickedDrawing);
 setIsDragging(true);
 return;
 }

 // Create new drawing
 if (activeTool === 'horizontal_ray') {
 const newDrawing: SimpleDrawing = {
 id: Date.now(),
 type: 'horizontal_ray',
 x,
 y,
 price,
 color: '#00ff88',
 selected: false
 };

 setDrawings(prev => [...prev, newDrawing]);
 setActiveTool(null); // Clear tool after use
 onDrawingCreated?.(newDrawing);
 }
 }, [activeTool, drawings, yToPrice, priceToY, onDrawingCreated]);

 // Handle mouse up
 const handleMouseUp = useCallback(() => {
 setIsDragging(false);
 setSelectedDrawing(null);
 }, []);

 // Handle mouse leave
 const handleMouseLeave = useCallback(() => {
 setCrosshair(prev => ({ ...prev, visible: false }));
 }, []);

 // Re-render when dependencies change
 useEffect(() => {
 renderDrawings();
 }, [renderDrawings]);

 return (
 <div className="relative">
 <canvas
 ref={canvasRef}
 width={width}
 height={height}
 className="cursor-crosshair"
 onMouseMove={handleMouseMove}
 onMouseDown={handleMouseDown}
 onMouseUp={handleMouseUp}
 onMouseLeave={handleMouseLeave}
 />
 
 {/* Simple toolbar */}
 <div className="absolute top-2 left-2 flex gap-2">
 <button
 className={`px-3 py-1 text-sm border rounded ${
 activeTool === 'horizontal_ray' 
 ? 'bg-blue-500 text-white' 
 : 'bg-gray-700 text-gray-200'
 }`}
 onClick={() => setActiveTool(activeTool === 'horizontal_ray' ? null : 'horizontal_ray')}
 >
 ━▷ Ray
 </button>
 <button
 className="px-3 py-1 text-sm border rounded bg-gray-700 text-gray-200"
 onClick={() => setDrawings([])}
 >
 Clear
 </button>
 </div>
 </div>
 );
};