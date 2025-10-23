'use client';

import { useState, useEffect } from 'react';
import './CubeVisualization.css';

export default function CubeVisualization() {
 const [rotation, setRotation] = useState(0);

 useEffect(() => {
 const interval = setInterval(() => {
 setRotation(prev => prev + 1);
 }, 50);
 return () => clearInterval(interval);
 }, []);

 return (
 <div className="cube-wrapper">
 <div 
 className="simple-cube"
 style={{ transform: `rotateX(-15deg) rotateY(${rotation}deg)` }}
 >
 <div className="cube-face front">
 <div className="face-content">
 <div className="label">MARKETS</div>
 <div className="value">LIVE</div>
 </div>
 </div>
 <div className="cube-face back">
 <div className="face-content">
 <div className="label">VOLUME</div>
 <div className="value">2.4B</div>
 </div>
 </div>
 <div className="cube-face right">
 <div className="face-content">
 <div className="label">INDEX</div>
 <div className="value">+0.67%</div>
 </div>
 </div>
 <div className="cube-face left">
 <div className="face-content">
 <div className="label">CRYPTO</div>
 <div className="value">BTC</div>
 </div>
 </div>
 <div className="cube-face top">
 <div className="face-content">
 <div className="label">NEWS</div>
 <div className="value">HOT</div>
 </div>
 </div>
 <div className="cube-face bottom">
 <div className="face-content">
 <div className="label">DATA</div>
 <div className="value">FLOW</div>
 </div>
 </div>
 </div>
 </div>
 );
}