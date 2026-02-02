'use client';

import { useMemo } from 'react';

interface SectorAnalysis {
  sector: string;
  change: number;
  relativeToSPY: number;
}

interface RegimeAnalysis {
  defensiveAvg: number;
  growthAvg: number;
  valueAvg: number;
  defensiveGrowthSpread: number;
  spreadStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  regime: string;
  confidence: number;
  defensiveSectors: SectorAnalysis[];
  growthSectors: SectorAnalysis[];
  valueSectors: SectorAnalysis[];
}

interface FearGreedGaugeProps {
  regimeAnalysis: Record<string, RegimeAnalysis>;
}

export default function FearGreedGauge({ regimeAnalysis }: FearGreedGaugeProps) {
  // Calculate weighted composite spread using composite logic
  const score = useMemo(() => {
    const timeframes = ['1d', '5d', '13d', '21d', '50d', 'ytd'];
    const weights = { '1d': 0.25, '5d': 0.20, '13d': 0.20, '21d': 0.15, '50d': 0.15, 'ytd': 0.05 };

    let compositeSpread = 0;
    let totalWeight = 0;

    timeframes.forEach(tf => {
      const tfAnalysis = regimeAnalysis[tf];
      if (tfAnalysis) {
        const weight = weights[tf as keyof typeof weights];
        compositeSpread += tfAnalysis.defensiveGrowthSpread * weight;
        totalWeight += weight;
      }
    });

    // Normalize by actual total weight
    if (totalWeight > 0) {
      compositeSpread /= totalWeight;
    }

    // Scale to -100 to +100 range for display (spread typically ranges from -10 to +10)
    // INVERT: Positive spread = defensive (fear/left), Negative spread = growth (greed/right)
    return Math.max(-100, Math.min(100, -compositeSpread * 10));
  }, [regimeAnalysis]);

  // Calculate gauge position (0-180 degrees, where 0 is far left, 90 is center, 180 is far right)
  const angle = useMemo(() => {
    return ((score + 100) / 200) * 180;
  }, [score]);

  // Get color based on score (positive = growth/green, negative = defensive/red)
  const getColor = (s: number) => {
    if (s >= 60) return '#10b981'; // Deep green (Strong Growth)
    if (s >= 20) return '#4ade80'; // Light green (Growth)
    if (s > -20) return '#fbbf24'; // Yellow (Neutral)
    if (s > -60) return '#f87171'; // Light red (Defensive)
    return '#dc2626'; // Deep red (Strong Defensive)
  };

  const getLabel = (s: number) => {
    if (s >= 60) return 'STRONG GROWTH';
    if (s >= 20) return 'GROWTH';
    if (s > -20) return 'NEUTRAL';
    if (s > -60) return 'DEFENSIVE';
    return 'STRONG DEFENSIVE';
  };

  const color = getColor(score);
  const label = getLabel(score);

  const radius = 40;
  const strokeWidth = 7;
  const centerX = 60;
  const centerY = 60;

  // Calculate needle position
  const needleAngle = 180 - angle; // Flip the angle so 0 is left, 180 is right
  const needleLength = radius - 10;
  const needleX = centerX + needleLength * Math.cos((needleAngle * Math.PI) / 180);
  const needleY = centerY - needleLength * Math.sin((needleAngle * Math.PI) / 180);

  return (
    <div
      className="fear-greed-gauge"
      style={{
        position: 'relative',
        width: '190px',
        height: '80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(20, 20, 20, 0.9) 100%)',
        borderRadius: '16px',
        padding: '12px',
        border: '2px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(12px)',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* SVG Gauge */}
      <svg width="120" height="65" viewBox="0 0 120 65" style={{ overflow: 'visible' }}>
        <defs>
          {/* Gradient for gauge arc - Defensive to Growth */}
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="25%" stopColor="#f87171" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="75%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        {/* Background arc (inactive portion) */}
        <path
          d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Active gauge arc with gradient */}
        <path
          d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Fear label (Defensive) */}
        <text
          x={centerX - radius - 15}
          y={centerY + 5}
          fill="rgba(255, 255, 255, 0.9)"
          fontSize="11"
          fontWeight="700"
          textAnchor="end"
        >
          FEAR
        </text>

        {/* Greed label (Growth) */}
        <text
          x={centerX + radius + 15}
          y={centerY + 5}
          fill="rgba(255, 255, 255, 0.9)"
          fontSize="11"
          fontWeight="700"
          textAnchor="start"
        >
          GREED
        </text>

        {/* Neutral label at top center */}
        <text
          x={centerX}
          y={centerY - radius - 8}
          fill="rgba(255, 255, 255, 0.9)"
          fontSize="11"
          fontWeight="700"
          textAnchor="middle"
        >
          NEUTRAL
        </text>

        {/* Needle */}
        <g>
          {/* Fire particles for defensive side (negative scores) */}
          {score < 0 && (
            <>
              <circle className="fire-particle fire-1" cx={needleX} cy={needleY} r="2" fill="#ff6b00" opacity="0.8" />
              <circle className="fire-particle fire-2" cx={needleX} cy={needleY} r="1.5" fill="#ff4500" opacity="0.7" />
              <circle className="fire-particle fire-3" cx={needleX} cy={needleY} r="2.5" fill="#ff8c00" opacity="0.6" />
              <circle className="fire-particle fire-4" cx={needleX} cy={needleY} r="1.8" fill="#ff0000" opacity="0.8" />
              <circle className="fire-particle fire-5" cx={needleX} cy={needleY} r="2.2" fill="#ffa500" opacity="0.5" />
            </>
          )}

          {/* Firework particles for growth side (positive scores) */}
          {score > 0 && (
            <>
              <circle className="firework-particle fw-1" cx={needleX} cy={needleY} r="2" fill="#00ff88" opacity="0.9" />
              <circle className="firework-particle fw-2" cx={needleX} cy={needleY} r="1.5" fill="#00ffff" opacity="0.8" />
              <circle className="firework-particle fw-3" cx={needleX} cy={needleY} r="2.5" fill="#00ff00" opacity="0.7" />
              <circle className="firework-particle fw-4" cx={needleX} cy={needleY} r="1.8" fill="#88ff00" opacity="0.9" />
              <circle className="firework-particle fw-5" cx={needleX} cy={needleY} r="2.2" fill="#66ff99" opacity="0.8" />
              <circle className="firework-particle fw-6" cx={needleX} cy={needleY} r="1.2" fill="#00ff66" opacity="0.6" />
            </>
          )}

          <line
            x1={centerX}
            y1={centerY}
            x2={needleX}
            y2={needleY}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            style={{
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />

          {/* Needle center dot */}
          <circle
            cx={centerX}
            cy={centerY}
            r="6"
            fill={color}
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="2"
            style={{
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />

          {/* Needle tip dot with glow */}
          <circle
            cx={needleX}
            cy={needleY}
            r="6"
            fill={color}
            opacity="0.3"
            className="needle-glow"
          />
          <circle
            cx={needleX}
            cy={needleY}
            r="4"
            fill={color}
            style={{
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </g>
      </svg>

      {/* Score and Label */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: '-5px',
        gap: '2px',
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '900',
          color: color,
          textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
          letterSpacing: '-0.5px',
          transition: 'all 0.4s ease',
        }}>
          {score > 0 ? '+' : ''}{score.toFixed(2)}
        </div>
      </div>

      {/* Animations */}
      <style jsx>{`
        .fear-greed-gauge:hover {
          transform: scale(1.05);
        }

        /* Fire animation for defensive side */
        @keyframes fire-rise {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 0.8;
          }
          50% {
            transform: translate(var(--x), -8px) scale(1.2);
            opacity: 0.6;
          }
          100% {
            transform: translate(var(--x-end), -15px) scale(0.4);
            opacity: 0;
          }
        }

        .fire-particle {
          animation: fire-rise 0.8s ease-out infinite;
        }

        .fire-1 {
          --x: -3px;
          --x-end: -5px;
          animation-delay: 0s;
        }

        .fire-2 {
          --x: 2px;
          --x-end: 4px;
          animation-delay: 0.15s;
        }

        .fire-3 {
          --x: -1px;
          --x-end: -2px;
          animation-delay: 0.3s;
        }

        .fire-4 {
          --x: 3px;
          --x-end: 6px;
          animation-delay: 0.45s;
        }

        .fire-5 {
          --x: -2px;
          --x-end: -4px;
          animation-delay: 0.6s;
        }

        /* Firework animation for growth side */
        @keyframes firework-burst {
          0% {
            transform: translate(0, 0) scale(0.5);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translate(var(--fx), var(--fy)) scale(0.2);
            opacity: 0;
          }
        }

        .firework-particle {
          animation: firework-burst 1s ease-out infinite;
        }

        .fw-1 {
          --fx: 8px;
          --fy: -10px;
          animation-delay: 0s;
        }

        .fw-2 {
          --fx: -8px;
          --fy: -8px;
          animation-delay: 0.1s;
        }

        .fw-3 {
          --fx: 10px;
          --fy: 5px;
          animation-delay: 0.2s;
        }

        .fw-4 {
          --fx: -10px;
          --fy: 6px;
          animation-delay: 0.3s;
        }

        .fw-5 {
          --fx: 6px;
          --fy: 10px;
          animation-delay: 0.4s;
        }

        .fw-6 {
          --fx: -6px;
          --fy: -12px;
          animation-delay: 0.5s;
        }

        /* Needle tip glow pulse */
        @keyframes glow-pulse {
          0%, 100% {
            r: 6;
            opacity: 0.3;
          }
          50% {
            r: 9;
            opacity: 0.6;
          }
        }

        .needle-glow {
          animation: glow-pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
