import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface GEXChartOverlayProps {
 gexData: any;
 width: number;
 height: number;
 xScale: d3.ScaleTime<number, number>;
 yScale: d3.ScaleLinear<number, number>;
 showCallWalls?: boolean;
 showPutWalls?: boolean;
 showZeroGamma?: boolean;
 showGEXZones?: boolean;
}

export const GEXChartOverlay: React.FC<GEXChartOverlayProps> = ({
 gexData,
 width,
 height,
 xScale,
 yScale,
 showCallWalls = true,
 showPutWalls = true,
 showZeroGamma = true,
 showGEXZones = true
}) => {
 const svgRef = useRef<SVGGElement>(null);

 useEffect(() => {
 if (!svgRef.current || !gexData) return;

 const svg = d3.select(svgRef.current);
 svg.selectAll('*').remove();

 // Zero Gamma Level
 if (showZeroGamma && gexData.key_levels.zero_gamma_level) {
 svg.append('line')
 .attr('x1', 0)
 .attr('x2', width)
 .attr('y1', yScale(gexData.key_levels.zero_gamma_level))
 .attr('y2', yScale(gexData.key_levels.zero_gamma_level))
 .attr('stroke', '#eab308')
 .attr('stroke-width', 2)
 .attr('stroke-dasharray', '5,5')
 .attr('opacity', 0.8);

 svg.append('text')
 .attr('x', width - 10)
 .attr('y', yScale(gexData.key_levels.zero_gamma_level) - 5)
 .attr('text-anchor', 'end')
 .attr('fill', '#eab308')
 .attr('font-size', '12px')
 .attr('font-weight', 'bold')
 .text(`Zero Γ: ${gexData.key_levels.zero_gamma_level.toFixed(2)}`);
 }

 // Call Walls
 if (showCallWalls && gexData.key_levels.call_walls) {
 gexData.key_levels.call_walls.forEach((wall: any, i: number) => {
 svg.append('line')
 .attr('x1', 0)
 .attr('x2', width)
 .attr('y1', yScale(wall.strike))
 .attr('y2', yScale(wall.strike))
 .attr('stroke', '#22c55e')
 .attr('stroke-width', 2 - i * 0.5)
 .attr('opacity', 0.7 - i * 0.2);

 svg.append('text')
 .attr('x', 10)
 .attr('y', yScale(wall.strike) - 5)
 .attr('fill', '#22c55e')
 .attr('font-size', '11px')
 .text(`Call Wall: ${wall.strike.toFixed(2)}`);
 });
 }

 // Put Walls
 if (showPutWalls && gexData.key_levels.put_walls) {
 gexData.key_levels.put_walls.forEach((wall: any, i: number) => {
 svg.append('line')
 .attr('x1', 0)
 .attr('x2', width)
 .attr('y1', yScale(wall.strike))
 .attr('y2', yScale(wall.strike))
 .attr('stroke', '#ef4444')
 .attr('stroke-width', 2 - i * 0.5)
 .attr('opacity', 0.7 - i * 0.2);

 svg.append('text')
 .attr('x', 10)
 .attr('y', yScale(wall.strike) + 15)
 .attr('fill', '#ef4444')
 .attr('font-size', '11px')
 .text(`Put Wall: ${wall.strike.toFixed(2)}`);
 });
 }

 // GEX Zones
 if (showGEXZones && gexData.gex_by_strike) {
 const positiveGEX = gexData.gex_by_strike.filter((s: any) => s.net_gex > 0);
 const negativeGEX = gexData.gex_by_strike.filter((s: any) => s.net_gex < 0);

 if (positiveGEX.length > 0) {
 const minStrike = Math.min(...positiveGEX.map((s: any) => s.strike));
 const maxStrike = Math.max(...positiveGEX.map((s: any) => s.strike));

 svg.append('rect')
 .attr('x', 0)
 .attr('y', yScale(maxStrike))
 .attr('width', width)
 .attr('height', Math.abs(yScale(minStrike) - yScale(maxStrike)))
 .attr('fill', '#22c55e')
 .attr('opacity', 0.05);
 }

 if (negativeGEX.length > 0) {
 const minStrike = Math.min(...negativeGEX.map((s: any) => s.strike));
 const maxStrike = Math.max(...negativeGEX.map((s: any) => s.strike));

 svg.append('rect')
 .attr('x', 0)
 .attr('y', yScale(maxStrike))
 .attr('width', width)
 .attr('height', Math.abs(yScale(minStrike) - yScale(maxStrike)))
 .attr('fill', '#ef4444')
 .attr('opacity', 0.05);
 }
 }

 }, [gexData, width, height, yScale, showCallWalls, showPutWalls, showZeroGamma, showGEXZones]);

 return <g ref={svgRef} className="gex-overlay" />;
};