'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Dynamic import to avoid SSR issues
let ReactGridLayout: any;

interface PanelConfig {
  id: string;
  title: string;
  component: React.ReactNode;
  defaultLayout: { x: number; y: number; w: number; h: number; minW?: number; minH?: number };
}

interface CustomizableHUDProps {
  panels: PanelConfig[];
}

export default function CustomizableHUD({ panels }: CustomizableHUDProps) {
  const [layout, setLayout] = useState<Layout>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [containerWidth, setContainerWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Load GridLayout on client side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ReactGridLayout = require('react-grid-layout').default;
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('analysis-suite-layouts');
    const savedHidden = localStorage.getItem('analysis-suite-hidden');
    const savedCollapsed = localStorage.getItem('analysis-suite-collapsed');
    
    if (saved) {
      setLayout(JSON.parse(saved));
    } else {
      setLayout(panels.map((p) => ({
        i: p.id,
        x: p.defaultLayout.x,
        y: p.defaultLayout.y,
        w: p.defaultLayout.w,
        h: p.defaultLayout.h,
        minW: p.defaultLayout.minW || 3,
        minH: p.defaultLayout.minH || 2,
      })) as Layout);
    }
    
    if (savedHidden) setHidden(new Set(JSON.parse(savedHidden)));
    if (savedCollapsed) setCollapsed(new Set(JSON.parse(savedCollapsed)));
  }, []);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    
    // Use ResizeObserver for better tracking
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', updateWidth);
      resizeObserver.disconnect();
    };
  }, []);

  const handleLayoutChange = (newLayout: Layout) => {
    setLayout(newLayout);
    localStorage.setItem('analysis-suite-layouts', JSON.stringify(newLayout));
  };

  const resetLayout = () => {
    const defaultLayout = panels.map((p) => ({
      i: p.id,
      x: p.defaultLayout.x,
      y: p.defaultLayout.y,
      w: p.defaultLayout.w,
      h: p.defaultLayout.h,
      minW: p.defaultLayout.minW || 3,
      minH: p.defaultLayout.minH || 2,
    })) as Layout;
    setLayout(defaultLayout);
    setHidden(new Set());
    setCollapsed(new Set());
    localStorage.removeItem('analysis-suite-layouts');
    localStorage.removeItem('analysis-suite-hidden');
    localStorage.removeItem('analysis-suite-collapsed');
  };

  const toggleCollapse = (id: string) => {
    const newCollapsed = new Set(collapsed);
    if (newCollapsed.has(id)) newCollapsed.delete(id);
    else newCollapsed.add(id);
    setCollapsed(newCollapsed);
    localStorage.setItem('analysis-suite-collapsed', JSON.stringify([...newCollapsed]));
  };

  const toggleVisibility = (id: string) => {
    const newHidden = new Set(hidden);
    if (newHidden.has(id)) newHidden.delete(id);
    else newHidden.add(id);
    setHidden(newHidden);
    localStorage.setItem('analysis-suite-hidden', JSON.stringify([...newHidden]));
  };

  if (!mounted) return null;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Controls */}
      <div style={{
        position: 'fixed', top: '60px', right: '20px', zIndex: 1000,
        background: 'rgba(0,0,0,0.95)', border: '1px solid #333',
        borderRadius: '8px', padding: '12px', maxHeight: '80vh',
        overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
        width: '180px'
      }}>
        <div style={{ color: '#ff6600', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', marginBottom: '12px' }}>
          🎛️ HUD Controls
        </div>
        
        <button onClick={() => setIsEditMode(!isEditMode)} style={{
          width: '100%', padding: '8px 12px', marginBottom: '8px',
          background: isEditMode ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#1a1a1a',
          border: isEditMode ? '1px solid #667eea' : '1px solid #333',
          borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: '600',
          cursor: 'pointer', textTransform: 'uppercase'
        }}>
          {isEditMode ? '🔓 Edit' : '🔒 Lock'}
        </button>
        
        <button onClick={resetLayout} style={{
          width: '100%', padding: '8px 12px', marginBottom: '12px',
          background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px',
          color: '#fff', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
          textTransform: 'uppercase'
        }}>
          ↺ Reset
        </button>
        
        <div style={{ borderTop: '1px solid #333', paddingTop: '8px' }}>
          {panels.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
              <input type="checkbox" checked={!hidden.has(p.id)} onChange={() => toggleVisibility(p.id)} style={{ cursor: 'pointer' }} />
              <span style={{ fontSize: '10px', color: '#ccc' }}>{p.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid */}
      <ReactGridLayout
        className="layout"
        layout={layout}
        cols={24}
        rowHeight={100}
        width={containerWidth}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".drag-handle"
        compactType="vertical"
        margin={[10, 10]}
        containerPadding={[0, 0]}
        style={{ marginTop: '0px' }}
      >
        {panels.map((panel) => {
          if (hidden.has(panel.id)) return null;
          const isCollapsed = collapsed.has(panel.id);
          
          return (
            <div key={panel.id} style={{
              background: 'rgba(0,0,0,0.95)', border: isEditMode ? '2px solid #667eea' : '1px solid #333',
              borderRadius: '0px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
              boxShadow: isEditMode ? '0 0 20px rgba(102,126,234,0.4)' : '0 4px 16px rgba(0,0,0,0.6)'
            }}>
              <div className="drag-handle" style={{
                padding: '12px 16px', background: isEditMode ? 'rgba(102,126,234,0.2)' : '#000',
                borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', cursor: isEditMode ? 'grab' : 'default', userSelect: 'none'
              }}>
                <div style={{ color: '#ff6600', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>
                  {isEditMode && '⋮⋮ '}{panel.title}
                </div>
                <button onClick={() => toggleCollapse(panel.id)} style={{
                  background: 'transparent', border: 'none', color: '#888',
                  cursor: 'pointer', fontSize: '16px', padding: '0'
                }}>
                  {isCollapsed ? '▼' : '▲'}
                </button>
              </div>
              
              {!isCollapsed && (
                <div style={{ flex: 1, overflow: 'auto' }}>
                  {panel.component}
                </div>
              )}
              
              {isEditMode && (
                <div style={{
                  position: 'absolute', top: '8px', right: '50px',
                  background: 'rgba(102,126,234,0.9)', color: '#fff',
                  padding: '4px 8px', borderRadius: '4px', fontSize: '10px',
                  fontWeight: '700', pointerEvents: 'none'
                }}>
                  DRAG • RESIZE
                </div>
              )}
            </div>
          );
        })}
      </ReactGridLayout>

      {isEditMode && (
        <div style={{
          position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(102,126,234,0.95)', color: '#fff', padding: '12px 24px',
          borderRadius: '12px', fontSize: '13px', fontWeight: '600', zIndex: 1000,
          boxShadow: '0 8px 32px rgba(102,126,234,0.6)'
        }}>
          🎯 Drag panels • Resize corners • Lock to save
        </div>
      )}
    </div>
  );
}
