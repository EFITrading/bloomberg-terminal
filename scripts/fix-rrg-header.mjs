import { readFileSync, writeFileSync } from 'fs'

let c = readFileSync('src/components/AlgoFlowScreener.tsx', 'utf8')

// 1. Fix Row 1 - replace the entire row 1 block
const row1Pattern = /\{\/\* Row 1: Back \+ Title \+ Search \*\/\}[\s\S]*?(?=\{\/\* Row 2:)/
const newRow1 = `{/* Row 1: Back + Tabs + conditional */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 4px' }}>
            {onBack && (
              <button onClick={onBack} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', flexShrink: 0 }}>← BACK</button>
            )}
            <div style={{ display: 'flex', gap: 2, background: '#0a0a0a', border: '1px solid #222', borderRadius: 6, padding: 2, flexShrink: 0 }}>
              {(['algoflow', 'flowbias'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{ height: 26, padding: '0 10px', background: activeTab === tab ? (tab === 'algoflow' ? 'linear-gradient(135deg,#ff8500,#ff6000)' : 'linear-gradient(135deg,#00ff88,#00cc66)') : 'transparent', color: activeTab === tab ? '#000' : (tab === 'algoflow' ? '#ff8500' : '#00ff88'), fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', border: 'none', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                  {tab === 'algoflow' ? 'ALGOFLOW' : 'FLOW BIAS'}
                </button>
              ))}
            </div>
            {activeTab === 'flowbias' ? (
              <button onClick={runRRGScan} disabled={biasRRGLoading} style={{ height: 30, padding: '0 16px', background: biasRRGLoading ? '#333' : 'linear-gradient(135deg,#7c3aed,#4c1d95)', color: '#fff', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', border: 'none', borderRadius: 6, cursor: biasRRGLoading ? 'not-allowed' : 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                {biasRRGLoading ? <><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'biasSpin 0.7s linear infinite' }} />SCANNING...</> : 'RUN SCAN'}
              </button>
            ) : (
              <>
                <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyPress={handleKeyPress} placeholder="TICKER" disabled={loading} style={{ flex: 1, minWidth: 0, height: 30, padding: '0 8px', background: '#111', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', outline: 'none', borderRadius: 4 }} />
                <button onClick={handleSearch} disabled={loading || isAnalyzing || !ticker.trim()} style={{ height: 30, padding: '0 10px', background: (loading || isAnalyzing) ? '#333' : 'linear-gradient(135deg, #ff8500, #ff6000)', color: (loading || isAnalyzing) ? '#fff' : '#000', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', border: 'none', borderRadius: 4, cursor: (loading || isAnalyzing || !ticker.trim()) ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: (!ticker.trim() || loading || isAnalyzing) ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                  {isAnalyzing ? '...' : loading ? '...' : 'GO'}
                </button>
                {(streamStatus || error) && (<span style={{ color: error ? '#ef4444' : '#22d3ee', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.06em', flexShrink: 0, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error || streamStatus}</span>)}
              </>
            )}
          </div>

          `

const m1 = c.match(row1Pattern)
if (m1) { c = c.replace(m1[0], newRow1); console.log('✓ Row 1 fixed') }
else console.log('✗ Row 1 pattern not found')

// 2. Fix dropdown buttons: white text default, orange when active, max-content width
// Ticker button
c = c.replace(
  /color: isActive \? '#a78bfa' : '#ccc', cursor: 'pointer', letterSpacing: '0\.5px', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', boxShadow: 'inset 0 1px 0 rgba\(255,255,255,0\.07\)' \}\}>\s*TICKER/,
  "color: isActive ? '#ff8500' : '#fff', cursor: 'pointer', letterSpacing: '0.5px', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>TICKER"
)

// Ticker background when active
c = c.replace(
  "background: isActive ? 'linear-gradient(180deg,#1e1244,#0d0a20)' : 'linear-gradient(180deg,rgba(255,255,255,0.1),rgba(0,0,0,0.4))', border: isActive ? '1px solid #a78bfa' : '1px solid #555',",
  "background: isActive ? 'rgba(255,133,0,0.15)' : 'linear-gradient(180deg,rgba(255,255,255,0.1),rgba(0,0,0,0.4))', border: isActive ? '1px solid #ff8500' : '1px solid #555',"
)

// Ticker dropdown width
c = c.replace(
  /minWidth: 200, zIndex: 999, boxShadow: '0 16px 48px rgba\(0,0,0,0\.95\),inset 0 1px 0 rgba\(255,255,255,0\.08\)' \}\}>\s*\{items\.map\(item => \{ const active = rrgTickerMode/,
  "width: 'max-content', zIndex: 999, boxShadow: '0 16px 48px rgba(0,0,0,0.95),inset 0 1px 0 rgba(255,255,255,0.08)' }}>{items.map(item => { const active = rrgTickerMode"
)

// Ticker item active color
c = c.replace(
  "background: active ? 'rgba(167,139,250,0.14)' : 'transparent' }}>",
  "background: active ? 'rgba(255,133,0,0.12)' : 'transparent' }}>"
)
c = c.replace(
  "border: `2px solid ${active ? '#a78bfa' : 'rgba(255,255,255,0.3)'}`, background: active ? '#a78bfa' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{active && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span>}</div>\n                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 700, color: active ? '#a78bfa' : '#fff' }}>{item.label}</span>",
  "border: `2px solid ${active ? '#ff8500' : 'rgba(255,255,255,0.3)'}`, background: active ? '#ff8500' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{active && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}</div>\n                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 700, color: active ? '#ff8500' : '#fff', whiteSpace: 'nowrap' }}>{item.label}</span>"
)

// Time button
c = c.replace(
  "background: isActive ? 'linear-gradient(180deg,#1a1200,#0a0800)' : 'linear-gradient(180deg,rgba(255,255,255,0.1),rgba(0,0,0,0.4))', border: isActive ? '1px solid #facc15' : '1px solid #555',",
  "background: isActive ? 'rgba(255,133,0,0.15)' : 'linear-gradient(180deg,rgba(255,255,255,0.1),rgba(0,0,0,0.4))', border: isActive ? '1px solid #ff8500' : '1px solid #555',"
)
c = c.replace(
  "color: isActive ? '#facc15' : '#ccc', cursor: 'pointer', letterSpacing: '0.5px', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>",
  "color: isActive ? '#ff8500' : '#fff', cursor: 'pointer', letterSpacing: '0.5px', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>"
)
c = c.replace(
  "minWidth: 180, zIndex: 999, boxShadow: '0 16px 48px rgba(0,0,0,0.95),inset 0 1px 0 rgba(255,255,255,0.08)' }}>",
  "width: 'max-content', zIndex: 999, boxShadow: '0 16px 48px rgba(0,0,0,0.95),inset 0 1px 0 rgba(255,255,255,0.08)' }}>"
)
c = c.replace(
  "background: active ? 'rgba(250,204,21,0.1)' : 'transparent' }}>",
  "background: active ? 'rgba(255,133,0,0.12)' : 'transparent' }}>"
)
c = c.replace(
  "border: `2px solid ${active ? '#facc15' : 'rgba(255,255,255,0.3)'}`, background: active ? '#facc15' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{active && <span style={{ color: '#000', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}</div>\n                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 700, color: active ? '#facc15' : '#fff' }}>{item.label}</span>",
  "border: `2px solid ${active ? '#ff8500' : 'rgba(255,255,255,0.3)'}`, background: active ? '#ff8500' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{active && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}</div>\n                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 700, color: active ? '#ff8500' : '#fff', whiteSpace: 'nowrap' }}>{item.label}</span>"
)

// Uniqueness button
c = c.replace(
  "background: isActive ? 'linear-gradient(180deg,#0a1800,#050e00)' : 'linear-gradient(180deg,rgba(255,255,255,0.1),rgba(0,0,0,0.4))', border: isActive ? '1px solid #34d399' : '1px solid #555',",
  "background: isActive ? 'rgba(255,133,0,0.15)' : 'linear-gradient(180deg,rgba(255,255,255,0.1),rgba(0,0,0,0.4))', border: isActive ? '1px solid #ff8500' : '1px solid #555',"
)
c = c.replace(
  "color: isActive ? '#34d399' : '#ccc', cursor: 'pointer', letterSpacing: '0.5px', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>",
  "color: isActive ? '#ff8500' : '#fff', cursor: 'pointer', letterSpacing: '0.5px', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>"
)
c = c.replace(
  "minWidth: 220, zIndex: 999, boxShadow: '0 16px 48px rgba(0,0,0,0.95),inset 0 1px 0 rgba(255,255,255,0.08)' }}>",
  "width: 'max-content', zIndex: 999, boxShadow: '0 16px 48px rgba(0,0,0,0.95),inset 0 1px 0 rgba(255,255,255,0.08)' }}>"
)

writeFileSync('src/components/AlgoFlowScreener.tsx', c, 'utf8')
console.log('All fixes written')
