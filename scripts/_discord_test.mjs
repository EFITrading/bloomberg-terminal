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
    const fillColor = (c.fillStyle === 'A' || c.fillStyle === 'AA') ? '#22c55e' : (c.fillStyle === 'B' || c.fillStyle === 'BB') ? '#ef4444' : '#c084fc'
    const priceMoveColor = (c.currentStockPrice !== null && c.currentStockPrice !== undefined && c.entrySpot !== null && c.entrySpot !== undefined)
        ? (c.currentStockPrice >= c.entrySpot ? '#22c55e' : '#ef4444') : '#e5e7eb'
    const tradeTypeColor = c.tradeType === 'BLOCK' ? '#00e5ff' : c.tradeType === 'MULTI-LEG' ? '#d8b4fe' : '#FFD700'

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
        <div class="row" style="background:linear-gradient(to right, rgba(0,0,0,0) 0%, ${barColor}22 55%, ${barColor}4d 100%); border-right:3px solid ${barColor};">
            <div class="row-icon">${icon}</div>
            <div class="row-label" style="color:${labelColor}">${esc(label)}</div>
            <div class="row-val" style="color:${barColor}">${esc(fmtPrice(strike))}</div>
            <div class="row-sep">/</div>
            <div class="row-val" style="color:${barColor}">${esc(fmtPrice(opt))}</div>
            <div class="row-pct" style="color:${pctColor}">${esc(fmtPct(pct))}</div>
        </div>`

    const fmtClean = (n) => (n === null || n === undefined || !isFinite(n)) ? 'N/A' : (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)

    const rows = []
    if (c.target1 !== null && c.target1 !== undefined) rows.push(row(ICON_TARGET, 'PROFIT TARGET #1:', '#22c55e', c.target1, c.target1Opt, c.target1Pct, '#22c55e', '#22c55e'))
    if (c.target2 !== null && c.target2 !== undefined) rows.push(row(ICON_TARGET, 'PROFIT TARGET #2:', '#22c55e', c.target2, c.target2Opt, c.target2Pct, '#22c55e', '#22c55e'))
    if (c.stopOpt !== null && c.stopOpt !== undefined) rows.push(row(ICON_SHIELD, 'STOP LOSS:', '#ef4444', c.stop, c.stopOpt, c.stopPct, '#ef4444', '#ef4444'))

    const pt = c.probabilityTrade
    const ptExpiryShort = pt?.expiryDate ? (() => { const [y, m, d] = pt.expiryDate.split('-'); return `${m}/${d}/${y.slice(2)}` })() : null
    const beDirection = c.direction === 'BEARISH' ? '-' : '+'
    const probTradeHtml = pt ? `<div class="prob-trade">
        <div class="prob-trade-text">Picking up ${esc(fmtClean(pt.strike))} ${isCall ? 'Calls' : 'Puts'} ${esc(ptExpiryShort || 'N/A')} expiry for around ${esc(fmtClean(pt.premium * 100))}</div>
        <div class="prob-trade-row">
            ${typeof pt.ivPct === 'number' ? `<span class="prob-trade-iv">Implied Volatility: ${pt.ivPct.toFixed(0)}%</span>` : ''}
            ${typeof pt.bePct === 'number' ? `<span class="prob-trade-be">Breakeven: ${beDirection}${pt.bePct.toFixed(1)}% move</span>` : ''}
        </div>
    </div>` : ''

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        @font-face { font-family: 'Sys'; src: local('Arial'); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: transparent; font-family: Arial, Helvetica, sans-serif; }
        #card {
            position: relative; width: 980px; padding: 34px 38px; border-radius: 26px;
            background-color: #000;
            background-image: linear-gradient(180deg, #1c1c1c 0%, #000000 12%, #000000 88%, #141414 100%);
            border: 1px solid rgba(255,255,255,0.14);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(255,255,255,0.03), 0 0 40px 4px rgba(34,197,94,0.18), 0 0 40px 4px rgba(239,68,68,0.14);
        }
        #card::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 46%;
            border-radius: 26px 26px 0 0; pointer-events: none;
            background: linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0) 100%);
        }
        .header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
        .header-left { display: flex; align-items: baseline; gap: 14px; }
        .ticker { font-size: 46px; font-weight: 900; letter-spacing: 1px; color: #ff7a1a; text-shadow: 0 1px 0 #ffb066, 0 2px 0 #ff8c2e, 0 3px 0 #e56a00, 0 4px 0 #b85500, 0 5px 6px rgba(0,0,0,0.6); }
        .direction { display: flex; align-items: center; gap: 6px; font-size: 20px; font-weight: 900; letter-spacing: 1px; }
        .direction .tri { width: 0; height: 0; }
        .header-right { display: flex; align-items: center; gap: 26px; }
        .stat { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .stat-label { font-size: 13px; font-weight: 900; color: #fff; letter-spacing: 1px; }
        .stat-val { font-size: 18px; font-weight: 900; }
        .term { font-size: 30px; font-weight: 900; letter-spacing: 1px; }
        .contract { display: flex; align-items: center; gap: 14px; margin-top: 14px; flex-wrap: wrap; }
        .contract .cp { font-size: 24px; font-weight: 900; }
        .fill-group { display: flex; align-items: center; gap: 2px; }
        .fill-group .size { font-size: 24px; font-weight: 900; color: #22d3ee; }
        .fill-group .at { font-size: 22px; font-weight: 900; color: #fff; }
        .fill-group .fill-price { font-size: 24px; font-weight: 900; color: #eab308; }
        .fill-group .fill-badge { font-size: 15px; font-weight: 900; color: #fff; padding: 2px 8px; border-radius: 5px; letter-spacing: 0.5px; margin-left: 4px; }
        .contract .exp { font-size: 22px; font-weight: 700; color: #fff; }
        .contract .tt { font-size: 18px; font-weight: 900; letter-spacing: 0.05em; padding: 6px 16px; border-radius: 9999px; background-color: #000; background-image: linear-gradient(180deg, #1e1e1e 0%, #000000 50%, #111111 100%); box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.8); }
        .contract .pct { font-size: 24px; font-weight: 900; }
        .spot-group { display: flex; align-items: center; gap: 6px; }
        .spot-group .spot { font-size: 22px; font-weight: 700; color: #fff; }
        .spot-group .arrow { color: #fff; font-size: 20px; }
        .divider { height: 1px; background: rgba(255,255,255,0.15); margin: 22px 0; }
        .plan { display: flex; align-items: flex-start; gap: 14px; }
        .plan-icon { width: 44px; height: 44px; border-radius: 9999px; border: 2px solid #22d3ee; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .plan-label { font-size: 22px; font-weight: 900; color: #22d3ee; letter-spacing: 1px; }
        .plan-text { font-size: 22px; font-weight: 500; color: #e5e7eb; margin-top: 2px; }
        .rows { display: flex; flex-direction: column; gap: 14px; margin-top: 22px; }
        .row { display: flex; align-items: center; gap: 16px; padding: 16px 22px; border-radius: 14px; background-color: #050505; }
        .row-icon { width: 40px; height: 40px; border-radius: 9999px; background: #0a0a0a; border: 2px solid currentColor; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .row-label { font-size: 22px; font-weight: 900; letter-spacing: 0.5px; width: 280px; flex-shrink: 0; }
        .row-val { font-size: 26px; font-weight: 800; }
        .row-sep { color: #555; font-size: 22px; }
        .row-pct { font-size: 26px; font-weight: 900; margin-left: auto; }
        .activity { margin-top: 22px; display: flex; flex-direction: column; gap: 10px; }
        .activity-title { font-size: 15px; font-weight: 900; color: #9ca3af; letter-spacing: 1.5px; margin-bottom: 2px; }
        .activity-row { display: flex; align-items: center; gap: 14px; padding: 12px 18px; border-radius: 12px; background-color: #0a0a0a; border: 1px solid rgba(255,255,255,0.08); }
        .activity-icon { width: 34px; height: 34px; border-radius: 9999px; background: #000; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 2px solid currentColor; }
        .activity-text { display: flex; flex-direction: column; gap: 2px; }
        .activity-name { font-size: 18px; font-weight: 900; letter-spacing: 0.3px; }
        .activity-detail { font-size: 16px; font-weight: 700; color: #d1d5db; }
        .prob-trade { margin-top: 14px; padding: 14px 20px; border-radius: 12px; background-color: #050505; border: 1px solid rgba(255,255,255,0.1); }
        .prob-trade-text { font-size: 19px; font-weight: 700; color: #e5e7eb; margin-bottom: 10px; }
        .prob-trade-row { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
        .prob-trade-iv { font-size: 15px; font-weight: 900; color: #c084fc; }
        .prob-trade-be { font-size: 15px; font-weight: 900; color: #00ff66; }
    </style></head><body>
        <div id="card">
            <div class="header">
                <div class="header-left">
                    <span class="ticker">${esc(c.ticker)}</span>
                    ${c.direction ? `<span class="direction" style="color:${c.direction === 'BULLISH' ? '#00e676' : '#ff1744'}"><span class="tri" style="border-left:9px solid transparent;border-right:9px solid transparent;${c.direction === 'BULLISH' ? 'border-bottom:15px solid currentColor;' : 'border-top:15px solid currentColor;'}"></span>${esc(c.direction)}</span>` : ''}
                </div>
                <div class="header-right">
                    ${c.takenTime ? `<div class="stat"><div class="stat-label">TAKEN</div><div class="stat-val" style="color:#22d3ee">${esc(c.takenTime)}</div></div>` : ''}
                    ${c.qualifiedTime ? `<div class="stat"><div class="stat-label">QUALIFIED</div><div class="stat-val" style="color:#22c55e">${esc(c.qualifiedTime)}</div></div>` : ''}
                    ${c.earnings ? `<div class="stat"><div class="stat-label">EARNINGS</div><div class="stat-val" style="color:#f59e0b">${esc(c.earnings)}</div></div>` : ''}
                    <span class="term" style="color:${termColor}">${esc(c.term || 'N/A')}</span>
                </div>
            </div>
            <div class="contract">
                <span class="cp" style="color:${cpColor}">${esc(fmtPrice(c.strike))} ${isCall ? 'Call' : 'Put'}</span>
                <div class="fill-group">
                    <span class="size">${esc(c.tradeSize ?? 'N/A')}</span><span class="at">@</span><span class="fill-price">$${esc(typeof c.premiumPerContract === 'number' ? c.premiumPerContract.toFixed(2) : 'N/A')}</span>
                    ${c.fillStyle ? `<span class="fill-badge" style="background:${fillColor}">${esc(c.fillStyle)}</span>` : ''}
                </div>
                <span class="exp">${esc(expiryShort)}</span>
                <div class="spot-group">
                    ${c.entrySpot !== null && c.entrySpot !== undefined ? `<span class="spot">${esc(fmtPrice(c.entrySpot))}</span>` : ''}
                    ${c.currentStockPrice !== null && c.currentStockPrice !== undefined ? `<span class="arrow">&gt;</span><span class="spot" style="color:${priceMoveColor}">${esc(fmtPrice(c.currentStockPrice))}</span>` : ''}
                </div>
                <span class="tt" style="color:${tradeTypeColor};border:1px solid ${tradeTypeColor}99">${esc(c.tradeType || '')}</span>
            </div>
            <div class="divider"></div>
            ${c.planText ? `<div class="plan">
                <div class="plan-icon">${ICON_CROSSHAIR}</div>
                <div>
                    <div class="plan-label">ENTRY PLAN:</div>
                    <div class="plan-text">${esc(c.planText)}</div>
                </div>
            </div>` : ''}
            ${probTradeHtml}
            <div class="rows">${rows.join('')}</div>
            ${activityRows.length ? `<div class="activity">
                <div class="activity-title">ACTIVITY</div>
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

    const renderPage = await browser.newPage()
    await renderPage.setViewport({ width: 1100, height: 800, deviceScaleFactor: 2 })
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
