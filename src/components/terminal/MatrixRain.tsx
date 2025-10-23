'use client';

import { useEffect, useRef } from 'react';

export default function MatrixRain() {
 const matrixRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
 if (!matrixRef.current) return;

 const matrix = matrixRef.current;
 const columns = Math.floor(window.innerWidth / 20);
 
 // Clear existing columns
 matrix.innerHTML = '';
 
 for (let i = 0; i < columns; i++) {
 const column = document.createElement('div');
 column.className = 'matrix-column';
 column.style.left = i * 20 + 'px';
 column.style.animationDuration = (Math.random() * 5 + 5) + 's';
 column.style.animationDelay = Math.random() * 5 + 's';
 
 // Add random characters
 const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
 let text = '';
 for (let j = 0; j < 30; j++) {
 text += chars[Math.floor(Math.random() * chars.length)] + '<br>';
 }
 column.innerHTML = text;
 matrix.appendChild(column);
 }
 }, []);

 return <div ref={matrixRef} className="matrix-rain" />;
}
