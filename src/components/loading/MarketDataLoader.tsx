'use client'

interface Props {
  label?: string
  height?: number | string
}

export default function MarketDataLoader({ label = 'LOADING MARKET DATA', height = 384 }: Props) {
  const bar = (w: string, delay = 0): React.CSSProperties => ({
    height: 10,
    width: w,
    borderRadius: 3,
    background: 'linear-gradient(90deg,#15151a 25%,#26262e 50%,#15151a 75%)',
    backgroundSize: '200% 100%',
    animation: `efi-shimmer 1.4s linear ${delay}s infinite`,
  })

  return (
    <div
      style={{
        height,
        width: '100%',
        background: '#050506',
        border: '1px solid #1f1f24',
        borderRadius: 8,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes efi-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
        @keyframes efi-sweep { 0% { transform: translateX(-100%) } 100% { transform: translateX(350%) } }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 4, height: 16, borderRadius: 2, background: '#FF6600', boxShadow: '0 0 8px #FF660088' }} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.2em',
            color: '#FFFFFF',
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          }}
        >
          {label}
        </span>
      </div>

      <div style={{ height: 2, background: '#16161b', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: '30%', height: '100%', background: 'linear-gradient(90deg,transparent,#FF6600,transparent)', animation: 'efi-sweep 1.3s ease-in-out infinite' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ height: 70, borderRadius: 8, border: '1px solid #1c1c22', background: '#0a0a0d', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={bar('40%', i * 0.15)} />
            <div style={{ ...bar('75%', i * 0.15), height: 16 }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '12% 14% 1fr 1fr 1fr', gap: 14 }}>
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} style={bar('100%', (i + j) * 0.08)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
