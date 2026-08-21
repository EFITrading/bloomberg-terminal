// THROWAWAY test script - logs into the REAL live site, scrapes REAL [data-flow-payload]
// cards (same as runSweepSenseDiscordAlert() in collector/collector.mjs), and posts an
// actual real card to Discord to verify the probability-based ladder + short-term/directional
// gating with real numbers, not fabricated data. Delete after visual confirmation.
import puppeteer from 'puppeteer'

const APP_URL = 'https://www.efitrading.com'
const COLLECTOR_LOGIN_PASSWORD = 'efi2026'
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1534807881634025494/lgBE_Sc_QpON-pM3V8FiMlGZ-OFmUBOCO9ON0BRazhaeSg2w_4QGQp1Img5dcyWYfUJK'

const fmtMoney = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return 'N/A'
    const abs = Math.abs(n)
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
    return `$${n.toFixed(2)}`
}
const fmtPrice = (n) => (n === null || n === undefined || !isFinite(n)) ? 'N/A' : `$${n.toFixed(2)}`
const fmtPct = (n) => (n === null || n === undefined || !isFinite(n)) ? 'N/A' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const ICON_CROSSHAIR = '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="8" fill="none" stroke="#22d3ee" stroke-width="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#22d3ee" stroke-width="2"/></svg>'
const ICON_TARGET = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 16l6-6 4 4 6-8" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6h6v6" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const ICON_SHIELD = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z" fill="none" stroke="#ef4444" stroke-width="2" stroke-linejoin="round"/></svg>'
const ICON_SPAM = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 10v4h4l5 4V6l-5 4H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 9c1 1 1 5 0 6M19 7c2 2 2 8 0 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
const ICON_STRUCT = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 20h18M5 20V10h4v10M15 20V10h4v10M9 10V6h6v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
const ICON_GAMMA = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor"/></svg>'

function buildSweepSenseCardHtml(c) {
    const isCall = String(c.optionType || '').toLowerCase().startsWith('c')
    const cpColor = isCall ? '#22c55e' : '#ef4444'
    const termColor = c.term === 'LONG TERM' ? '#22d3ee' : '#f59e0b'
    const expiryShort = c.expiry ? (() => { const [y, m, d] = c.expiry.split('-'); return `${m}/${d}/${y.slice(2)}` })() : 'N/A'
    // Same fill-style coloring convention as the live table (FlowTrackingPanel.tsx):
    // A/AA (bought at ask) green, B/BB (sold at bid) red, anything else purple.
    const fillColor = (c.fillStyle === 'A' || c.fillStyle === 'AA') ? '#22c55e' : (c.fillStyle === 'B' || c.fillStyle === 'BB') ? '#ef4444' : '#c084fc'
    const priceMoveColor = (c.currentStockPrice !== null && c.currentStockPrice !== undefined && c.entrySpot !== null && c.entrySpot !== undefined)
        ? (c.currentStockPrice >= c.entrySpot ? '#22c55e' : '#ef4444') : '#e5e7eb'
    // Same glossy pill badges as the live table's getTradeTypeColor() (OptionsFlowTable.tsx).
    const tradeTypeColor = c.tradeType === 'BLOCK' ? '#00e5ff' : c.tradeType === 'MULTI-LEG' ? '#d8b4fe' : '#FFD700'
    // The payload only ever carries raw epoch-ms takenAt/qualifiedAt (never a pre-formatted
    // takenTime/qualifiedTime string) - format them here, in PST, so the header actually shows them.
    const fmtPST = (ms) => (typeof ms === 'number' && ms > 0)
        ? new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }) + ' PST'
        : null
    const takenTimeStr = fmtPST(c.takenAt)
    const qualifiedTimeStr = fmtPST(c.qualifiedAt)

    // Activity flags now carry real trade detail (call/put split, strike(s), expiry, size, premium)
    // stamped by FlowTrackingPanel.tsx's activityDetail, instead of just a plain label string.
    const fmtActivityDetail = (d) => {
        if (!d || !d.count) return ''
        const dominant = d.calls >= d.puts ? 'CALL' : 'PUT'
        const mixed = d.calls > 0 && d.puts > 0
        const typeText = mixed ? `${d.calls}x CALL / ${d.puts}x PUT` : `${d.count}x ${dominant}${d.count > 1 ? 'S' : ''}`
        const strikeText = d.strikes.length === 1 ? fmtPrice(d.strikes[0]) : `${fmtPrice(d.strikes[0])}\u2013${fmtPrice(d.strikes[d.strikes.length - 1])}`
        const expiryText = d.expiries.length === 1
            ? (() => { const [y, m, day] = d.expiries[0].split('-'); return `${m}/${day}/${y.slice(2)}` })()
            : `${d.expiries.length} expiries`
        return `${typeText}  \u00b7  ${strikeText}  \u00b7  ${expiryText}  \u00b7  ${d.totalSize.toLocaleString()} ctrs  \u00b7  ${fmtMoney(d.totalPremium)}`
    }
    const activityRows = [
        c.activityDetail?.spam ? { icon: ICON_SPAM, color: '#f59e0b', title: c.activityDetail.spam.label, detail: fmtActivityDetail(c.activityDetail.spam) } : null,
        c.activityDetail?.gamma ? { icon: ICON_GAMMA, color: '#ec4899', title: c.activityDetail.gamma.label, detail: fmtActivityDetail(c.activityDetail.gamma) } : null,
        c.activityDetail?.structural ? { icon: ICON_STRUCT, color: '#a855f7', title: c.activityDetail.structural.label, detail: fmtActivityDetail(c.activityDetail.structural) } : null,
    ].filter(Boolean)

    const row = (icon, label, labelColor, strike, opt, pct, pctColor, barColor) => `
        <div class="row">
            <div class="row-icon" style="color:${barColor}">${icon}</div>
            <div class="row-label" style="color:${labelColor}">${esc(label)}</div>
            <div class="row-vals">
                <span class="row-val">${esc(fmtPrice(strike))}</span>
                <span class="row-sep">/</span>
                <span class="row-val-sub">${esc(fmtPrice(opt))}</span>
            </div>
            <div class="row-pct-pill" style="color:${pctColor};background:${pctColor}18;border:1px solid ${pctColor}4d;">${esc(fmtPct(pct))}</div>
        </div>`

    // Whole-dollar prices print without a pointless ".00" (e.g. $672 not $672.00); anything
    // with real cents still shows them.
    const fmtClean = (n) => (n === null || n === undefined || !isFinite(n)) ? 'N/A' : (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)

    const rows = []
    if (c.target1 !== null && c.target1 !== undefined) rows.push(row(ICON_TARGET, 'PROFIT TARGET #1:', '#22c55e', c.target1, c.target1Opt, c.target1Pct, '#22c55e', '#22c55e'))
    if (c.target2 !== null && c.target2 !== undefined) rows.push(row(ICON_TARGET, 'PROFIT TARGET #2:', '#22c55e', c.target2, c.target2Opt, c.target2Pct, '#22c55e', '#22c55e'))
    // Gated on stopOpt (the option premium stop), not c.stop (a stock price) - the probability
    // ladder's stop is always a premium-decline stop with no stock-price target (c.stop is
    // always null for it), so gating on c.stop silently dropped the whole row.
    if (c.stopOpt !== null && c.stopOpt !== undefined) rows.push(row(ICON_SHIELD, 'STOP LOSS:', '#ef4444', c.stop, c.stopOpt, c.stopPct, '#ef4444', '#ef4444'))

    // Targets/stop above are all repriced off the PROBABILITY-selected contract (a different,
    // real listed strike/expiry than the raw flow's own contract) - spell it out as a plain
    // sentence, shown right under the entry plan and above the target rows it explains.
    const pt = c.probabilityTrade
    const ptExpiryShort = pt?.expiryDate ? (() => { const [y, m, d] = pt.expiryDate.split('-'); return `${m}/${d}/${y.slice(2)}` })() : null
    const beDirection = c.direction === 'BEARISH' ? '-' : '+'

    const dirColor = c.direction === 'BULLISH' ? '#34d399' : c.direction === 'BEARISH' ? '#f87171' : '#9ca3af'

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: transparent; font-family: 'Inter', 'Segoe UI', Arial, Helvetica, sans-serif; }
        #card {
            position: relative; width: 1360px; padding: 44px 48px 38px; border-radius: 22px;
            background-color: #0a0c11;
            background-image:
                radial-gradient(1100px 420px at 15% -10%, ${dirColor}14 0%, transparent 55%),
                linear-gradient(180deg, #12151d 0%, #0a0c11 45%, #07080b 100%);
            border: 1px solid rgba(255,255,255,0.07);
            box-shadow: 0 0 0 1px rgba(255,255,255,0.02), 0 30px 70px -16px rgba(0,0,0,0.75);
            overflow: hidden;
        }
        #card::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
            background: ${dirColor};
        }
        .header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
        .header-left { display: flex; align-items: center; gap: 14px; }
        .ticker { font-size: 46px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; }
        .direction { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 800; letter-spacing: 1.6px; padding: 8px 16px 8px 12px; border-radius: 999px; background: ${dirColor}18; border: 1px solid ${dirColor}55; }
        .direction .tri { width: 0; height: 0; }
        .meta-strip { display: flex; align-items: center; gap: 0; }
        .meta-item { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; padding: 0 20px; border-right: 1px solid rgba(255,255,255,0.09); }
        .meta-item:last-of-type { border-right: none; padding-right: 0; }
        .meta-label { font-size: 11px; font-weight: 800; color: #cbd5e1; letter-spacing: 1.6px; }
        .meta-val { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .term-badge { font-size: 14px; font-weight: 800; letter-spacing: 1.4px; padding: 10px 20px; border-radius: 999px; margin-left: 18px; color: ${termColor}; background: ${termColor}16; border: 1px solid ${termColor}4d; }

        .ticket { display: flex; align-items: stretch; margin-top: 26px; border-radius: 14px; background: linear-gradient(180deg, #12161e 0%, #0d1016 100%); border: 1px solid rgba(255,255,255,0.07); overflow: hidden; }
        .ticket-seg { display: flex; flex-direction: column; justify-content: center; gap: 5px; padding: 18px 24px; border-right: 1px solid rgba(255,255,255,0.06); }
        .ticket-seg:last-child { border-right: none; margin-left: auto; align-items: flex-end; }
        .ticket-label { font-size: 11px; font-weight: 800; color: #cbd5e1; letter-spacing: 1.4px; }
        .ticket-val { font-size: 23px; font-weight: 800; font-variant-numeric: tabular-nums; }
        .ticket-sub { font-size: 16px; font-weight: 700; color: #e5e7eb; }
        .fill-badge { font-size: 12px; font-weight: 800; color: #05070a; padding: 3px 9px; border-radius: 5px; letter-spacing: 0.4px; margin-left: 8px; }
        .spot-line { display: flex; align-items: center; gap: 8px; }
        .spot-line .arrow { color: #9ca3af; font-size: 15px; }
        .tt-pill { font-size: 13px; font-weight: 800; letter-spacing: 0.08em; padding: 8px 18px; border-radius: 999px; border: 1px solid currentColor; background: rgba(255,255,255,0.03); align-self: center; }

        .section-label { display: flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 800; letter-spacing: 2.2px; color: #d1d5db; margin: 24px 0 13px; }
        .section-label::before { content: ''; width: 4px; height: 14px; border-radius: 2px; background: currentColor; }

        .plan { display: flex; align-items: flex-start; gap: 16px; padding: 18px 22px; border-radius: 14px; background: linear-gradient(135deg, rgba(34,211,238,0.08), rgba(34,211,238,0.02)); border: 1px solid rgba(34,211,238,0.22); }
        .plan-icon { width: 34px; height: 34px; border-radius: 9px; background: rgba(34,211,238,0.12); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #22d3ee; }
        .plan-text { font-size: 19px; font-weight: 600; color: #f8fafc; line-height: 1.45; }

        .prob-trade { display: flex; align-items: center; gap: 16px; padding: 16px 22px; border-radius: 14px; background: linear-gradient(135deg, rgba(192,132,252,0.08), rgba(192,132,252,0.02)); border: 1px solid rgba(192,132,252,0.2); }
        .prob-trade-icon { width: 34px; height: 34px; border-radius: 9px; background: rgba(192,132,252,0.14); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #c084fc; font-weight: 800; font-size: 16px; }
        .prob-trade-text { font-size: 17px; font-weight: 700; color: #f8fafc; }
        .prob-trade-chips { display: flex; align-items: center; gap: 10px; margin-left: auto; flex-shrink: 0; }
        .chip { font-size: 13px; font-weight: 800; letter-spacing: 0.3px; padding: 6px 13px; border-radius: 999px; white-space: nowrap; }
        .chip-iv { color: #c084fc; background: rgba(192,132,252,0.12); border: 1px solid rgba(192,132,252,0.3); }
        .chip-be { color: #34d399; background: rgba(52,211,153,0.12); border: 1px solid rgba(52,211,153,0.3); }

        .body-grid { display: flex; align-items: stretch; gap: 24px; margin-top: 4px; }
        .body-left { flex: 0 0 560px; display: flex; flex-direction: column; }
        .body-right { flex: 1; display: flex; flex-direction: column; }
        .chart-wrap { margin-top: 24px; border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); background: #000; flex: 1; min-height: 260px; }
        .chart-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .rows { display: flex; flex-direction: column; gap: 10px; }
        .row { display: grid; grid-template-columns: 44px 190px 1fr auto; align-items: center; gap: 16px; padding: 16px 20px; border-radius: 14px; background: linear-gradient(180deg, #12161e 0%, #0d1016 100%); border: 1px solid rgba(255,255,255,0.06); }
        .row-icon { width: 34px; height: 34px; border-radius: 999px; background: currentColor; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .row-icon svg { filter: brightness(0) saturate(100%); }
        .row-icon svg path, .row-icon svg circle { stroke: #05070a; }
        .row-label { font-size: 13px; font-weight: 800; letter-spacing: 1.3px; }
        .row-vals { display: flex; align-items: baseline; gap: 9px; font-variant-numeric: tabular-nums; }
        .row-val { font-size: 23px; font-weight: 800; color: #ffffff; }
        .row-sep { color: #9ca3af; font-size: 16px; }
        .row-val-sub { font-size: 16px; font-weight: 700; color: #e5e7eb; }
        .row-pct-pill { font-size: 16px; font-weight: 800; text-align: center; font-variant-numeric: tabular-nums; padding: 7px 14px; border-radius: 999px; justify-self: end; }

        .activity { margin-top: 26px; display: flex; flex-direction: column; gap: 9px; }
        .activity-row { display: flex; align-items: center; gap: 16px; padding: 13px 20px; border-radius: 14px; background: linear-gradient(180deg, #12161e 0%, #0d1016 100%); border: 1px solid rgba(255,255,255,0.06); }
        .activity-icon { width: 30px; height: 30px; border-radius: 9px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: currentColor; }
        .activity-text { display: flex; flex-direction: column; gap: 2px; }
        .activity-name { font-size: 16px; font-weight: 800; letter-spacing: 0.3px; }
        .activity-detail { font-size: 14px; font-weight: 600; color: #e5e7eb; }
    </style></head><body>
        <div id="card">
            <div class="header">
                <div class="header-left">
                    <span class="ticker">${esc(c.ticker)}</span>
                    ${c.direction ? `<span class="direction" style="color:${dirColor}"><span class="tri" style="border-left:5px solid transparent;border-right:5px solid transparent;${c.direction === 'BULLISH' ? 'border-bottom:9px solid currentColor;' : 'border-top:9px solid currentColor;'}"></span>${esc(c.direction)}</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;">
                    <div class="meta-strip">
                        ${takenTimeStr ? `<div class="meta-item"><div class="meta-label">TAKEN</div><div class="meta-val" style="color:#22d3ee">${esc(takenTimeStr)}</div></div>` : ''}
                        ${qualifiedTimeStr ? `<div class="meta-item"><div class="meta-label">QUALIFIED</div><div class="meta-val" style="color:#34d399">${esc(qualifiedTimeStr)}</div></div>` : ''}
                        ${c.earnings ? `<div class="meta-item"><div class="meta-label">EARNINGS</div><div class="meta-val" style="color:#f59e0b">${esc(c.earnings)}</div></div>` : ''}
                    </div>
                    <span class="term-badge">${esc(c.term || 'N/A')}</span>
                </div>
            </div>
            <div class="ticket">
                <div class="ticket-seg">
                    <div class="ticket-label">STRIKE</div>
                    <div class="ticket-val" style="color:${cpColor}">${esc(fmtPrice(c.strike))} ${isCall ? 'CALL' : 'PUT'}</div>
                </div>
                <div class="ticket-seg">
                    <div class="ticket-label">CONTRACT &amp; FILL</div>
                    <div class="ticket-val" style="color:#ffffff">${esc(c.tradeSize ?? 'N/A')} <span style="color:#cbd5e1;font-weight:700;">@</span> $${esc(typeof c.premiumPerContract === 'number' ? c.premiumPerContract.toFixed(2) : 'N/A')}${c.fillStyle ? `<span class="fill-badge" style="background:${fillColor}">${esc(c.fillStyle)}</span>` : ''}</div>
                </div>
                <div class="ticket-seg">
                    <div class="ticket-label">EXPIRY</div>
                    <div class="ticket-sub">${esc(expiryShort)}</div>
                </div>
                <div class="ticket-seg">
                    <div class="ticket-label">SPOT &amp; CURRENT PRICE</div>
                    <div class="spot-line ticket-sub">
                        ${c.entrySpot !== null && c.entrySpot !== undefined ? `<span>${esc(fmtPrice(c.entrySpot))}</span>` : ''}
                        ${c.currentStockPrice !== null && c.currentStockPrice !== undefined ? `<span class="arrow">&rarr;</span><span style="color:${priceMoveColor};font-weight:800;">${esc(fmtPrice(c.currentStockPrice))}</span>` : ''}
                    </div>
                </div>
                <div class="ticket-seg" style="justify-content:center;">
                    <span class="tt-pill" style="color:${tradeTypeColor}">${esc(c.tradeType || '')}</span>
                </div>
            </div>
            <div class="body-grid">
                <div class="body-left">
                    ${c.planText ? `<div class="section-label" style="color:#22d3ee;">ENTRY PLAN</div>
                    <div class="plan">
                        <div class="plan-icon">${ICON_CROSSHAIR}</div>
                        <div class="plan-text">${esc(c.planText)}</div>
                    </div>` : ''}
                    ${pt ? `<div class="section-label" style="color:#c084fc;">CONTRACT USED FOR TARGETS</div>
                    <div class="prob-trade">
                        <div class="prob-trade-icon">$</div>
                        <div class="prob-trade-text">Picking up ${esc(fmtClean(pt.strike))} ${isCall ? 'Calls' : 'Puts'} ${esc(ptExpiryShort || 'N/A')} expiry for around ${esc(fmtClean(pt.premium * 100))}</div>
                        <div class="prob-trade-chips">
                            ${typeof pt.ivPct === 'number' ? `<span class="chip chip-iv">IV ${pt.ivPct.toFixed(0)}%</span>` : ''}
                            ${typeof pt.bePct === 'number' ? `<span class="chip chip-be">BE ${beDirection}${pt.bePct.toFixed(1)}%</span>` : ''}
                        </div>
                    </div>` : ''}
                    <div class="section-label" style="color:#e5e7eb;">TARGETS &amp; RISK</div>
                    <div class="rows">${rows.join('')}</div>
                </div>
                <div class="body-right">
                    <div class="section-label" style="color:#f59e0b;">5M CHART @ ENTRY</div>
                    <div class="chart-wrap">${c.chartImageBase64 ? `<img src="data:image/png;base64,${c.chartImageBase64}" />` : ''}</div>
                </div>
            </div>
            ${activityRows.length ? `<div class="activity">
                <div class="section-label" style="color:#a855f7;">ACTIVITY</div>
                ${activityRows.map((r) => `
                <div class="activity-row" style="color:${r.color}">
                    <div class="activity-icon">${r.icon}</div>
                    <div class="activity-text">
                        <div class="activity-name">${esc(r.title)}</div>
                        ${r.detail ? `<div class="activity-detail">${esc(r.detail)}</div>` : ''}
                    </div>
                </div>`).join('')}
            </div>` : ''}
        </div>
    </body></html>`
}

async function loginCookies() {
    const res = await fetch(`${APP_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: COLLECTOR_LOGIN_PASSWORD }),
    })
    if (!res.ok) { console.warn(`[Auth] Login failed: ${res.status}`); return [] }
    const setCookie = res.headers.get('set-cookie') || ''
    const domain = new URL(APP_URL).hostname
    return setCookie.split(/,(?=\s*[\w-]+=)/).map((part) => {
        const [nameValue] = part.split(';')
        const [name, ...rest] = nameValue.split('=')
        return { name: name.trim(), value: rest.join('=').trim(), domain, path: '/' }
    }).filter((c) => c.name && c.value)
}

async function main() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 2 })
    const cookies = await loginCookies()
    if (cookies.length > 0) await page.setCookie(...cookies)
    console.log('[Test] Logging into real site and loading /options-flow ...')
    await page.goto(`${APP_URL}/options-flow`, { waitUntil: 'networkidle0', timeout: 60_000 })
    const found = await page.waitForSelector('[data-flow-payload]', { timeout: 4 * 60 * 1000 }).catch(() => null)
    if (!found) { console.log('[Test] No [data-flow-payload] cards appeared - nothing to test.'); await browser.close(); return }

    const cards = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-flow-payload]')).map((el) => {
            try { return JSON.parse(el.getAttribute('data-flow-payload')) } catch { return null }
        }).filter(Boolean)
    )
    console.log(`[Test] Scraped ${cards.length} total REAL SweepSense card(s).`)

    // Prefer a real card that's ready + SHORT TERM + explicitly directional (has a BULLISH/BEARISH
    // direction, not a hedge/multi-leg) AND has a probability trade so the new contract-context
    // section actually renders; fall back progressively so there's still something to look at.
    const readyDirectional = cards.filter((c) => c.ready && c.term === 'SHORT TERM' && (c.direction === 'BULLISH' || c.direction === 'BEARISH') && c.probabilityTrade)
    const readyAny = cards.filter((c) => c.ready && c.term === 'SHORT TERM')
    const pick = readyDirectional[0] || readyAny[0] || cards.find((c) => c.term === 'SHORT TERM') || cards[0]
    if (!pick) { console.log('[Test] No cards at all - nothing to test.'); await browser.close(); return }
    console.log(`[Test] Using REAL card: ${pick.ticker} ready=${pick.ready} term=${pick.term} direction=${pick.direction} tradeType=${pick.tradeType} hasProbTrade=${!!pick.probabilityTrade}`)

    try {
        const chartPage = await browser.newPage()
        await chartPage.setViewport({ width: 900, height: 480, deviceScaleFactor: 2 })
        if (cookies.length > 0) await chartPage.setCookie(...cookies)
        const entryTime = pick.takenAt ? new Date(pick.takenAt).getTime() : null
        const chartUrl = `${APP_URL}/chart-embed?ticker=${encodeURIComponent(pick.ticker)}${entryTime ? `&entryTime=${entryTime}` : ''}`
        console.log('[Test] Loading chart embed:', chartUrl)
        await chartPage.goto(chartUrl, { waitUntil: 'networkidle0', timeout: 30_000 })
        // A stale/invalid cookie silently redirects to /login (which has its own decorative
        // background canvas) - waitForSelector('canvas') would then screenshot THAT instead.
        if (!chartPage.url().includes('/chart-embed')) {
            console.log('[Test] Redirected away from chart-embed, re-authing and retrying...')
            const freshCookies = await loginCookies()
            if (freshCookies.length > 0) await chartPage.setCookie(...freshCookies)
            await chartPage.goto(chartUrl, { waitUntil: 'networkidle0', timeout: 30_000 })
        }
        if (!chartPage.url().includes('/chart-embed')) {
            throw new Error(`redirected away from chart-embed (landed on ${chartPage.url()})`)
        }
        await chartPage.waitForSelector('[data-chart-ready="true"] canvas', { timeout: 15_000 })
        await new Promise((r) => setTimeout(r, 2500))
        const canvasHandle = await chartPage.$('[data-chart-ready="true"] canvas')
        if (canvasHandle) {
            const box = await canvasHandle.boundingBox()
            const chartPng = await chartPage.screenshot({ type: 'png', clip: box ?? undefined })
            pick.chartImageBase64 = Buffer.from(chartPng).toString('base64')
            console.log('[Test] Chart captured OK.')
        }
    } catch (chartErr) {
        console.error('[Test] Chart capture failed:', chartErr.message)
    }

    const renderPage = await browser.newPage()
    await renderPage.setViewport({ width: 1460, height: 1000, deviceScaleFactor: 2 })
    await renderPage.setContent(buildSweepSenseCardHtml(pick), { waitUntil: 'load' })
    const cardHandle = await renderPage.$('#card')
    const png = await cardHandle.screenshot({ type: 'png' })
    await browser.close()

    const form = new FormData()
    form.append('payload_json', JSON.stringify({
        content: `@here **${pick.ticker} - Ready for Pickup** _(TEST: real scraped card, ready=${pick.ready}, term=${pick.term}, direction=${pick.direction})_`,
        allowed_mentions: { parse: ['everyone'] },
        attachments: [{ id: 0, filename: 'sweepsense-card.png' }],
    }))
    form.append('files[0]', new Blob([png], { type: 'image/png' }), 'sweepsense-card.png')

    const res = await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: form })
    console.log('Discord post status:', res.status)
    if (!res.ok) console.log(await res.text())
}

main().catch((err) => { console.error(err); process.exit(1) })
