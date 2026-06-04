import React, { useEffect, useState } from 'react'

type Props = {
    visible: boolean
    selectedTicker?: string
    streamingStatus?: string | null
}

const EFI_LOADING_QUOTES = [
    { text: 'The trend is your friend — until it bends.', author: 'Wall Street Proverb' },
    { text: 'Block trades don\'t lie. Institutions leave footprints.', author: 'EFI Research' },
    { text: 'When sweep orders cluster, the smart money is speaking.', author: 'EFI Research' },
    { text: 'Markets can remain irrational longer than you can remain solvent.', author: 'John Maynard Keynes' },
    { text: 'Volume is the weapon of the informed trader.', author: 'EFI Research' },
    { text: 'The stock market is filled with individuals who know the price of everything, but the value of nothing.', author: 'Philip Fisher' },
    { text: 'In the short run the market is a voting machine. In the long run, a weighing machine.', author: 'Benjamin Graham' },
    { text: 'The best trades come from where conviction meets flow.', author: 'EFI Research' },
    { text: 'Risk comes from not knowing what you\'re doing.', author: 'Warren Buffett' },
    { text: 'Follow the smart money — it always leaves a trail in options.', author: 'EFI Research' },
    { text: 'The four most dangerous words in investing: \'this time it\'s different\'.', author: 'Sir John Templeton' },
    { text: 'Premium doesn\'t lie. Size tells the story.', author: 'EFI Research' },
    { text: 'Unusual options activity today is tomorrow\'s headline.', author: 'EFI Research' },
    { text: 'Every large position started as an idea someone believed in enough to size up.', author: 'EFI Research' },
]

export default function OptionsFlowScene({ visible, selectedTicker, streamingStatus }: Props) {
    const [loadingQuoteIndex, setLoadingQuoteIndex] = useState(0)
    const [loadingArtIndex, setLoadingArtIndex] = useState(0)
    const [snapDriven, setSnapDriven] = useState(false)
    const [mktSnap, setMktSnap] = useState<Record<string, number> | null>(null)
    const [mktCtx, setMktCtx] = useState<any | null>(null)

    useEffect(() => {
        if (!visible) return
        const qiv = setInterval(() => setLoadingQuoteIndex(i => (i + 1) % EFI_LOADING_QUOTES.length), 10000)
        return () => clearInterval(qiv)
    }, [visible])

    useEffect(() => {
        if (!visible || snapDriven) return
        const iv = setInterval(() => setLoadingArtIndex(i => (i + 1) % 7), 8000)
        return () => clearInterval(iv)
    }, [visible, snapDriven])

    useEffect(() => {
        if (!visible) return
        let cancelled = false
        const doFetch = async () => {
            try {
                const [snapRes, newsRes] = await Promise.all([
                    fetch('/api/market-snapshot'),
                    fetch('/api/news?category=breaking&limit=6'),
                ])
                if (cancelled) return
                if (!snapRes.ok) return
                const d: Record<string, any> = await snapRes.json()
                if (cancelled || !d || typeof d !== 'object' || d.error) return
                const sectors: Record<string, number> = d.sectors && typeof d.sectors === 'object' ? d.sectors : d
                const spy = sectors['SPY'] ?? NaN
                if (isNaN(spy)) return // markets closed / no data — keep cycling
                setMktSnap(sectors)
                let headlines: Array<any> = d.headlines ?? []
                if (newsRes.ok) {
                    const newsData = await newsRes.json()
                    if (newsData.success && Array.isArray(newsData.articles) && newsData.articles.length > 0) {
                        headlines = newsData.articles.slice(0, 6).map((a: any) => ({
                            title: String(a.title ?? ''),
                            urgency: typeof a.urgency === 'number' ? a.urgency : 0.5,
                            time_ago: String(a.time_ago ?? ''),
                            tickers: Array.isArray(a.tickers) ? a.tickers : [],
                        }))
                    }
                }
                setMktCtx({ sectors, movers: Array.isArray(d.movers) ? d.movers : [], headlines })
                setSnapDriven(true)
                const bearVariants = [0, 4]
                const bullVariants = [1, 5, 6]
                const rng = (arr: number[]) => arr[Math.floor(Math.random() * arr.length)]
                setLoadingArtIndex(spy <= -1.5 ? rng(bearVariants) : spy >= 1.5 ? rng(bullVariants) : spy < 0 ? 2 : 3)
            } catch { /* silent */ }
        }
        doFetch()
        return () => { cancelled = true }
    }, [visible])

    const truncate = (s: string, n = 85) => s.length > n ? s.slice(0, n - 1) + '…' : s

    if (!visible) return null

    const selected = selectedTicker ?? 'OPTIONS'

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'radial-gradient(ellipse at 50% 40%, rgba(20,10,0,0.98) 0%, rgba(0,0,0,0.99) 70%)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <style>{`
        @keyframes scanTitlePulse { 0%,100%{opacity:1}50%{opacity:0.8} }
        @keyframes spin { 0%{transform:rotate(0deg)}100%{transform:rotate(360deg)} }
        @keyframes artFadeIn { 0%{opacity:0}100%{opacity:1} }
        @keyframes scanParticle { 0%{transform:translateY(0) translateX(0);opacity:0}15%{opacity:0.7}85%{opacity:0.3}100%{transform:translateY(-90px) translateX(14px);opacity:0} }
        @keyframes marquee { 0% { transform: translateX(100%);} 100% { transform: translateX(-100%);} }
      `}</style>
            {/* Breaking news marquee */}
            {mktCtx?.headlines && mktCtx.headlines.length > 0 && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 36, display: 'flex', alignItems: 'center', background: 'linear-gradient(90deg,#110000,rgba(0,0,0,0.6))', zIndex: 70, padding: '0 12px' }}>
                    <div style={{ color: '#ff4422', fontFamily: 'monospace', fontWeight: 900, fontSize: 17, padding: '4px 8px', marginRight: 12, background: '#000' }}>● BREAKING</div>
                    <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>
                        <div style={{ display: 'inline-block', paddingLeft: '100%', animation: 'marquee 18s linear infinite' }}>
                            {mktCtx.headlines.map((h: any, i: number) => (
                                <span key={i} style={{ color: '#fff', marginRight: 40, fontFamily: 'monospace', fontWeight: 600 }}>
                                    {h.title}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            <div style={{ position: 'absolute', inset: 0 }}>
                {/* Abstract scan background — reuse trader image as subtle art */}
                <div style={{ position: 'absolute', right: 0, top: 36, width: '60%', height: '100%', overflow: 'hidden' }}>
                    <img src="/loading/trader.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', filter: 'contrast(1.6) brightness(0.45) saturate(0.3) hue-rotate(180deg)' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,#010308 0%,rgba(1,3,8,0.72) 25%,rgba(1,3,8,0) 100%)' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,140,255,0.2)', mixBlendMode: 'screen' }} />
                </div>
                <div style={{ position: 'absolute', left: 0, top: 36, width: '65%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: '5%', paddingRight: '2%', gap: 0 }}>
                    <div style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(12px,1.7vw,18px)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '2%' }}>FLOW SCANNER</div>
                    <div style={{ color: '#fff', fontWeight: 900, fontSize: 'clamp(29px,5.85vw,62px)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.02em', textShadow: '2px 2px 8px rgba(0,0,0,0.9)' }}>{selected.toUpperCase()}</div>
                    <div style={{ color: '#00aaff', fontWeight: 900, fontSize: 'clamp(29px,5.85vw,62px)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.02em', textShadow: '0 0 30px rgba(0,150,255,0.5)' }}>FLOW SCAN</div>
                    <div style={{ width: '80%', height: '2px', background: 'rgba(0,150,255,0.7)', marginBottom: '4%' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(3px,0.7vh,8px)' }}>
                        <div style={{ color: '#00ccff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(12px,1.7vw,18px)' }}>● Checking saved data...</div>
                    </div>
                </div>
                <div style={{ position: 'absolute', top: 36 + 16, right: '2%', color: 'rgba(0,200,255,0.9)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(12px,1.43vw,17px)', letterSpacing: '0.08em' }}>● SCANNING FLOW...</div>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.05) 0px,rgba(0,0,0,0.05) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none' }} />
            </div>

            {/* Right-side compact markets + headline box (matches OptionsFlowTable) */}
            <div style={{ position: 'absolute', right: 0, top: 36, width: '26%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right', alignItems: 'flex-end', padding: '6% 2% 6% 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', alignSelf: 'flex-end', gap: '8px' }}>
                    <div style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 900, fontSize: 'clamp(17px,2.86vw,26px)', lineHeight: 1, textTransform: 'uppercase', textShadow: '2px 2px 8px rgba(0,0,0,0.9)', background: '#000', padding: '4px 10px' }}>MARKET SNAPSHOT</div>
                    <div style={{ width: '100%', height: '2px', background: 'rgba(0,150,255,0.6)', marginBottom: '8%' }} />
                    {(() => {
                        const movers = mktCtx?.movers ?? []
                        const headlines = mktCtx?.headlines ?? []
                        const spyVal = mktSnap ? mktSnap['SPY'] : null
                        const bigLosers = movers.filter((m: any) => m.pct < 0).slice(0, 2)
                        const bigGainers = movers.filter((m: any) => m.pct > 0).slice(0, 2)
                        const rows = bigLosers.length > 0 ? [['S&P 500', spyVal != null ? `${spyVal.toFixed(2)}%` : '-'], ...bigLosers.map((m: any) => [m.ticker, `${m.pct.toFixed(2)}%`])] : spyVal != null ? [['S&P 500', `${spyVal.toFixed(2)}%`]] : [['S&P 500', '-']]
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
                                {rows.map((r: any[]) => (
                                    <div key={r[0]} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', background: '#000', padding: '4px 10px' }}>
                                        <span style={{ color: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(18px,2.08vw,26px)' }}>{r[0]}</span>
                                        <span style={{ color: r[1] && String(r[1]).startsWith('-') ? '#e03535' : '#00e040', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 'clamp(18px,2.08vw,26px)' }}>{r[1]}</span>
                                    </div>
                                ))}
                                {headlines[0] && (
                                    <>
                                        <div style={{ width: '100%', height: '2px', background: '#00aaff', margin: '6% 0 3%' }} />
                                        <div style={{ color: '#00aaff', fontFamily: 'monospace', fontWeight: 900, fontSize: 'clamp(18px,1.69vw,23px)', letterSpacing: '0.08em', marginBottom: 4, background: '#000', padding: '4px 10px' }}>● BREAKING</div>
                                        <div style={{ color: '#ffffff', fontFamily: 'monospace', fontSize: 'clamp(16px,1.43vw,18px)', fontWeight: 600, lineHeight: 1.4, textAlign: 'right', overflowWrap: 'break-word', wordBreak: 'break-word', background: '#000', padding: '4px 10px' }}>{truncate(headlines[0].title)}</div>
                                        <div style={{ color: '#88ffaa', fontFamily: 'monospace', fontSize: 'clamp(14px,1.3vw,16px)', marginTop: 6, background: '#000', padding: '4px 10px' }}>{headlines[0].time_ago}{headlines[0].tickers && headlines[0].tickers.length ? ` · ${headlines[0].tickers.slice(0, 3).join('  ')}` : ''}</div>
                                    </>
                                )}
                            </div>
                        )
                    })()}
                </div>
            </div>

            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '44px' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '94px', fontWeight: 900, color: '#ffffff', letterSpacing: '8px', lineHeight: 1, animation: 'scanTitlePulse 2.8s ease-in-out infinite', textShadow: '0 0 60px rgba(255,255,255,0.12), 0 1px 0 #ccc, 0 2px 0 #999, 0 6px 20px rgba(0,0,0,0.8)', WebkitTextStroke: '0.5px rgba(255,255,255,0.15)' }}>{selected}</div>
                    <div style={{ fontSize: '34px', fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '14px', marginTop: '8px', textShadow: '0 0 20px rgba(255,255,255,0.08)' }}>FLOW SCAN</div>
                </div>

                <div style={{ position: 'relative', width: '110px', height: '110px' }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '5px solid rgba(255,255,255,0.06)', borderTopColor: '#ffffff', animation: 'spin 0.9s linear infinite' }} />
                    <div style={{ position: 'absolute', inset: '14px', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.04)', borderTopColor: 'rgba(255,255,255,0.5)', animation: 'spin 1.5s linear infinite reverse', boxShadow: '0 0 8px rgba(255,255,255,0.15)' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 12px rgba(255,255,255,0.9)' }} />
                    </div>
                </div>

                <div style={{ fontSize: '21px', fontWeight: 600, color: '#ffffff', letterSpacing: '0.5px', textAlign: 'center', maxWidth: '600px', textShadow: '0 0 20px rgba(255,255,255,0.3)' }}>
                    {streamingStatus ? streamingStatus.replace(/^Worker\s+\d+:\s*/i, '') : 'Scanning options flow...'}
                </div>

                <div style={{ maxWidth: '680px', textAlign: 'center', padding: '30px 40px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)', background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 55%, rgba(0,0,0,0.3) 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.5), 0 16px 50px rgba(0,0,0,0.6)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)' }} />
                    <div style={{ fontSize: '25px', fontStyle: 'italic', color: '#f1f5f9', lineHeight: 1.7, fontWeight: 400 }}>
                        &ldquo;{EFI_LOADING_QUOTES[loadingQuoteIndex % EFI_LOADING_QUOTES.length].text}&rdquo;
                    </div>
                    <div style={{ fontSize: '20px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginTop: '16px', letterSpacing: '0.5px' }}>
                        — {EFI_LOADING_QUOTES[loadingQuoteIndex % EFI_LOADING_QUOTES.length].author}
                    </div>
                </div>
            </div>
        </div>
    )
}
