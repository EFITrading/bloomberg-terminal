'use client';

import React, { useState, useEffect } from 'react';
import './MarketConstellation.css';

interface MarketInsight {
  title: string;
  value: string;
  description: string;
  color: string;
  icon: string;
}

interface ConstellationNode {
  id: number;
  x: number;
  y: number;
  size: number;
  intensity: number;
  pulse: number;
  connection: number[];
}

export default function MarketConstellation() {
  const [currentInsight, setCurrentInsight] = useState(0);
  const [nodes, setNodes] = useState<ConstellationNode[]>([]);
  const [timeOfDay, setTimeOfDay] = useState('');
  const [marketMood, setMarketMood] = useState('Optimistic');

  const insights: MarketInsight[] = [
    {
      title: "NAAIM Exposure Index",
      value: "67.8%",
      description: "Active investment managers' equity exposure remains bullish above historical average",
      color: "#FFD700",
      icon: "∆"
    },
    {
      title: "CNN Fear & Greed Index",
      value: "42 - Fear",
      description: "Market sentiment shows fear as investors await clarity on rate policy",
      color: "#FFA500",
      icon: "σ"
    },
    {
      title: "VIX Term Structure",
      value: "18.4",
      description: "Implied volatility suggests moderate uncertainty with downward pressure",
      color: "#FFD700",
      icon: "λ"
    },
    {
      title: "FOMC Meeting", 
      value: "Nov 7th",
      description: "Federal Reserve policy decision expected to maintain current rates",
      color: "#DAA520",
      icon: "Ψ"
    },
    {
      title: "Earnings Season",
      value: "AAPL Oct 31",
      description: "Apple earnings report could set tone for technology sector performance",
      color: "#B8860B",
      icon: "Φ"
    },
    {
      title: "CPI Release",
      value: "Oct 10th",
      description: "Core inflation data will influence Fed policy and market direction",
      color: "#FFD700",
      icon: "Ω"
    }
  ];

  const marketMoods = [
    "Risk-On", "Risk-Off", "Defensive", "Rotation", "Consolidation", "Breakout"
  ];

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 6) return "Pre-Market Quiet";
    if (hour < 9) return "Opening Bell Approach";
    if (hour < 12) return "Morning Momentum";
    if (hour < 16) return "Peak Trading";
    if (hour < 20) return "After-Hours Flow";
    return "Global Night Trading";
  };

  // Generate constellation nodes
  useEffect(() => {
    const generateNodes = () => {
      const nodeCount = 25;
      const newNodes: ConstellationNode[] = [];
      
      for (let i = 0; i < nodeCount; i++) {
        const angle = (i / nodeCount) * Math.PI * 2;
        const radius = 120 + Math.random() * 180;
        const x = 50 + Math.cos(angle) * (radius / 8);
        const y = 50 + Math.sin(angle) * (radius / 8);
        
        newNodes.push({
          id: i,
          x: Math.max(10, Math.min(90, x)),
          y: Math.max(10, Math.min(90, y)),
          size: 0.8 + Math.random() * 1.5,
          intensity: 0.3 + Math.random() * 0.7,
          pulse: Math.random() * 2,
          connection: []
        });
      }
      
      // Create connections between nearby nodes
      newNodes.forEach((node, i) => {
        newNodes.forEach((otherNode, j) => {
          if (i !== j) {
            const distance = Math.sqrt(
              Math.pow(node.x - otherNode.x, 2) + Math.pow(node.y - otherNode.y, 2)
            );
            if (distance < 25 && Math.random() > 0.6) {
              node.connection.push(j);
            }
          }
        });
      });
      
      setNodes(newNodes);
    };

    generateNodes();
    setTimeOfDay(getTimeOfDay());
    
    // Update time every minute
    const timeInterval = setInterval(() => {
      setTimeOfDay(getTimeOfDay());
    }, 60000);

    return () => clearInterval(timeInterval);
  }, []);

  // Cycle through insights
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentInsight((prev) => (prev + 1) % insights.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Update market mood
  useEffect(() => {
    const moodInterval = setInterval(() => {
      setMarketMood(marketMoods[Math.floor(Math.random() * marketMoods.length)]);
    }, 8000);

    return () => clearInterval(moodInterval);
  }, []);

  const currentInsightData = insights[currentInsight];

  return (
    <div className="market-constellation">
      {/* Animated Background */}
      <div className="constellation-bg">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
      </div>

      {/* Constellation Network */}
      <div className="constellation-network">
        <svg className="network-svg" viewBox="0 0 100 100">
          {/* Connection Lines */}
          {nodes.map((node) =>
            node.connection.map((connectedId) => {
              const connectedNode = nodes[connectedId];
              if (!connectedNode) return null;
              
              return (
                <line
                  key={`${node.id}-${connectedId}`}
                  x1={node.x}
                  y1={node.y}
                  x2={connectedNode.x}
                  y2={connectedNode.y}
                  className="constellation-line"
                  style={{
                    animationDelay: `${node.pulse}s`,
                    opacity: node.intensity * 0.6
                  }}
                />
              );
            })
          )}
          
          {/* Nodes */}
          {nodes.map((node) => (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={node.size}
              className="constellation-node"
              style={{
                animationDelay: `${node.pulse}s`,
                opacity: node.intensity
              }}
            />
          ))}
        </svg>
      </div>

      {/* Central Content Hub */}
      <div className="content-hub">
        {/* Time & Mood Header */}
        <div className="session-header">
          <div className="time-display">{timeOfDay}</div>
          <div className="mood-indicator">
            <span className="mood-text">Market Sentiment: </span>
            <span className="mood-value">{marketMood}</span>
          </div>
        </div>

        {/* Dynamic Insight Card */}
        <div 
          className="insight-card"
          style={{ 
            borderColor: currentInsightData.color,
            boxShadow: `0 0 30px ${currentInsightData.color}40`
          }}
        >
          <div className="insight-icon" style={{ color: currentInsightData.color }}>
            {currentInsightData.icon}
          </div>
          
          <div className="insight-content">
            <div className="insight-title">{currentInsightData.title}</div>
            <div 
              className="insight-value"
              style={{ color: currentInsightData.color }}
            >
              {currentInsightData.value}
            </div>
            <div className="insight-description">
              {currentInsightData.description}
            </div>
          </div>

          <div className="insight-progress">
            <div className="progress-dots">
              {insights.map((_, index) => (
                <div
                  key={index}
                  className={`progress-dot ${index === currentInsight ? 'active' : ''}`}
                  style={{
                    backgroundColor: index === currentInsight ? currentInsightData.color : 'rgba(255,255,255,0.3)'
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Market Pulse Visualization */}
        <div className="pulse-visualization">
          <div className="pulse-ring ring-1"></div>
          <div className="pulse-ring ring-2"></div>
          <div className="pulse-ring ring-3"></div>
          <div className="pulse-center">
            <div className="pulse-text">LIVE</div>
          </div>
        </div>
      </div>

      {/* Floating Market Elements */}
      <div className="floating-elements">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="floating-symbol"
            style={{
              left: `${3 + (i * 5.2)}%`,
              animationDelay: `${i * 0.3}s`
            }}
          >
            {['SPY', 'QQQ', 'VIX', 'DXY', 'TNX', 'GLD', 'OIL', '↗', '↘', '▲', '▼', '$', '¥', '€', '£', 'Φ', 'σ', 'β'][i % 18]}
          </div>
        ))}
      </div>

      {/* Terminal Identity */}
      <div className="terminal-brand">
        <div className="brand-text">
          <span className="brand-primary">ELITE</span>
          <span className="brand-secondary">ANALYTICS</span>
        </div>
        <div className="brand-tagline">Institutional Trading Intelligence</div>
      </div>
    </div>
  );
}