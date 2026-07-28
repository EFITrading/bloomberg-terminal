// Shared FlowBias analysis helpers (Flow Spammer / Structural Formation / Gamma Attack).
// Extracted from FlowTrackingPanel.tsx so OptionsFlowTable.tsx's SweepSense save pipeline can
// compute and PERSIST these labels in the DB snapshot, instead of them only ever existing as a
// live, in-render computation that resets to "Loading…"/empty after an afterhours DB reload.
// Both files should import from here rather than keeping their own copies, so the math can
// never silently drift between the live view and what gets saved.

export type FlowBiasRawTrade = {
    strike: number
    type: string
    expiry?: string
    trade_timestamp?: string
    fillStyle?: string
    tradeSize?: number
    premium?: number
    totalPremium?: number
    spot?: number
    tradeType?: string
}

// -- Pure Black-Scholes helpers --
export function _bsNCD(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
    const sign = x >= 0 ? 1 : -1
    const ax = Math.abs(x)
    const t = 1.0 / (1.0 + p * ax)
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
    return 0.5 * (1 + sign * y)
}
export function _bsD2FTP(S: number, K: number, r: number, sigma: number, T: number): number {
    return (Math.log(S / K) + (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
}
export function _bsD1FTP(S: number, K: number, r: number, sigma: number, T: number): number {
    return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
}
export function bsStrikeForProbFTP(
    S: number, sigma: number, dte: number, prob: number, isCall: boolean
): number | null {
    if (!sigma || sigma <= 0 || dte <= 0) return null
    const r = 0.0387
    const T = dte / 365
    const copCall = (K: number) => (1 - _bsNCD(_bsD2FTP(S, K, r, sigma, T))) * 100
    const copPut = (K: number) => _bsNCD(_bsD2FTP(S, K, r, sigma, T)) * 100
    let lo = S * 0.01, hi = S * 10
    const target = prob
    const fn = isCall ? copCall : copPut
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2
        const val = fn(mid)
        if (isCall) {
            if (val > target) lo = mid; else hi = mid
        } else {
            if (val > target) hi = mid; else lo = mid
        }
    }
    return (lo + hi) / 2
}
export function bsOptionPriceFTP(S: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number {
    if (T <= 0) return isCall ? Math.max(0, S - K) : Math.max(0, K - S)
    const d1 = _bsD1FTP(S, K, r, sigma, T)
    const d2 = d1 - sigma * Math.sqrt(T)
    return isCall
        ? S * _bsNCD(d1) - K * Math.exp(-r * T) * _bsNCD(d2)
        : K * Math.exp(-r * T) * _bsNCD(-d2) - S * _bsNCD(-d1)
}

// Lightweight subset of calcTradeManagement (FlowTrackingPanel.tsx) - just the targetUp/target1/
// target2 levels computeGammaLabel needs, without the stop-loss/theta-decay/option-repricing
// math that label doesn't use.
export function computeTargetLevels(
    trade: { type: string; fill_style?: string; days_to_expiry: number; spot_price: number },
    sigmaOverride?: number,
    dteOverride?: number,
    spotOverride?: number
): { targetUp: boolean; target1: number | null; target2: number | null } {
    const fs = trade.fill_style || ''
    const isSoldToOpen = fs === 'B' || fs === 'BB'
    const isCall = trade.type === 'call'
    const targetUp = (isCall && !isSoldToOpen) || (!isCall && isSoldToOpen)
    const sigma = sigmaOverride && sigmaOverride > 0 ? sigmaOverride : 0
    const dte = dteOverride && dteOverride > 0 ? Math.round(dteOverride) : Math.max(0, Math.round(trade.days_to_expiry))
    const spot = spotOverride && spotOverride > 0 ? spotOverride : trade.spot_price
    const target1 = sigma > 0 ? bsStrikeForProbFTP(spot, sigma, dte, 80, targetUp) : null
    const target2 = sigma > 0 ? bsStrikeForProbFTP(spot, sigma, dte, 90, targetUp) : null
    return { targetUp, target1, target2 }
}

// Days-to-expiry off a raw flow print's own expiry string (not the card's DTE).
export function computeDteFromExpiry(expiry: string): number {
    const exp = new Date(expiry + 'T00:00:00')
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86400000))
}

export function isWithin90PopOtm(strike: number, spot: number, sigma: number, dte: number, isCall: boolean): boolean {
    if (!spot || spot <= 0) return true
    const inc = spot < 25 ? 0.5 : spot < 200 ? 1 : spot < 500 ? 5 : 10
    const isAtm = Math.abs(strike - spot) < inc * 1.5
    if (isAtm) return false
    if (!sigma || sigma <= 0 || dte <= 0) return true
    const k90 = bsStrikeForProbFTP(spot, sigma, dte, 90, isCall)
    if (k90 === null) return true
    return isCall ? strike > spot && strike <= k90 : strike < spot && strike >= k90
}

export function cancelOffsettingTrades(trades: Array<FlowBiasRawTrade>): Array<FlowBiasRawTrade> {
    const isBuy = (t: FlowBiasRawTrade) => t.fillStyle === 'A' || t.fillStyle === 'AA'
    const isSell = (t: FlowBiasRawTrade) => t.fillStyle === 'B' || t.fillStyle === 'BB'
    const cancelled = new Set<FlowBiasRawTrade>()
    const usedSells = new Set<FlowBiasRawTrade>()
    const sells = trades.filter(isSell)
    for (const buy of trades) {
        if (!isBuy(buy)) continue
        const buySize = buy.tradeSize || 0
        if (!buySize) continue
        let bestSell: FlowBiasRawTrade | null = null
        let bestDiff = Infinity
        for (const sell of sells) {
            if (usedSells.has(sell)) continue
            const sellSize = sell.tradeSize || 0
            if (!sellSize) continue
            const diff = Math.abs(buySize - sellSize) / Math.max(buySize, sellSize)
            if (diff <= 0.3 && diff < bestDiff) { bestDiff = diff; bestSell = sell }
        }
        if (bestSell) {
            usedSells.add(bestSell)
            cancelled.add(buy)
            cancelled.add(bestSell)
        }
    }
    return trades.filter((t) => !cancelled.has(t))
}

export function computeSpamLabel(
    rawTrades: Array<FlowBiasRawTrade>,
    cardType: 'call' | 'put',
    formatDate: (d: string) => string,
    spot?: number,
    sigma?: number
): { label: string; trades: Array<FlowBiasRawTrade>; level: number | null } {
    const groups: Record<string, Array<FlowBiasRawTrade>> = {}
    for (const t of rawTrades) {
        if (t.tradeType === 'MULTI-LEG') continue
        if (t.type !== cardType || !t.expiry || !t.trade_timestamp) continue
        const tDte = computeDteFromExpiry(t.expiry)
        if (tDte > 35) continue
        if (spot && spot > 0) {
            if (!isWithin90PopOtm(t.strike, spot, sigma || 0, tDte, cardType === 'call')) continue
        }
        const key = `${t.strike}|${t.expiry}`
        if (!groups[key]) groups[key] = []
        groups[key].push(t)
    }
    let best: { key: string; trades: typeof rawTrades } | null = null
    for (const [key, groupTrades] of Object.entries(groups)) {
        const survivors = cancelOffsettingTrades(groupTrades)
        if (survivors.length >= 3 && (!best || survivors.length > best.trades.length)) best = { key, trades: survivors }
    }
    if (!best) return { label: 'No Spammer Detected', trades: [], level: null }
    const [strikeStr, expiry] = best.key.split('|')
    const times = best.trades.map((t) => new Date(t.trade_timestamp!).getTime()).sort((a, b) => a - b)
    const getETHour = (ms: number) => {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms))
        const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
        const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
        return h + m / 60
    }
    const hoursET = times.map(getETHour)
    let cadence: string
    if (hoursET.every((h) => h <= 11.5)) cadence = 'At Open'
    else if (hoursET.every((h) => h >= 15)) cadence = 'Near Close'
    else {
        const gaps: number[] = []
        for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 3600000)
        const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
        cadence = avgGap <= 1 ? 'All Day' : avgGap <= 3 ? 'Half Day' : 'Scattered'
    }
    const label = cardType === 'call' ? 'Calls' : 'Puts'
    const buyCount = best.trades.filter((t) => t.fillStyle === 'A' || t.fillStyle === 'AA').length
    const sellCount = best.trades.filter((t) => t.fillStyle === 'B' || t.fillStyle === 'BB').length
    const direction = buyCount > sellCount ? 'Buying' : sellCount > buyCount ? 'Selling' : null
    const sideName = cardType === 'call' ? 'Call' : 'Put'
    const prefix = direction ? `Flow ${sideName} ${direction} Spammer` : 'Flow Spammer'
    return { label: `${prefix}: $${strikeStr} ${label} ${formatDate(expiry)} Expiry - ${cadence}`, trades: best.trades, level: parseFloat(strikeStr) }
}

export function popForStrike(S: number, K: number, sigma: number, dte: number, isCall: boolean): number | null {
    if (!sigma || sigma <= 0 || dte <= 0 || !S || S <= 0) return null
    const r = 0.0387
    const T = dte / 365
    const d2 = _bsD2FTP(S, K, r, sigma, T)
    return isCall ? (1 - _bsNCD(d2)) * 100 : _bsNCD(d2) * 100
}

export function bestStructuralBand(
    trades: Array<FlowBiasRawTrade>,
    spot: number,
    sigma: number
): { trades: Array<FlowBiasRawTrade>; style: 'buy' | 'sell' } | null {
    const isBuy = (t: FlowBiasRawTrade) => t.fillStyle === 'A' || t.fillStyle === 'AA'
    const isSell = (t: FlowBiasRawTrade) => t.fillStyle === 'B' || t.fillStyle === 'BB'
    const isCall = trades[0]?.type === 'call'
    const banded: Record<string, Array<FlowBiasRawTrade>> = {}
    for (const t of trades) {
        if (!isBuy(t) && !isSell(t)) continue
        const tDte = t.expiry ? computeDteFromExpiry(t.expiry) : 0
        const pop = popForStrike(spot, t.strike, sigma, tDte, isCall)
        if (pop === null) continue
        const bandStart = Math.floor(pop / 5) * 5
        const key = `${bandStart}|${isBuy(t) ? 'buy' : 'sell'}`
        if (!banded[key]) banded[key] = []
        banded[key].push(t)
    }
    let best: { trades: Array<FlowBiasRawTrade>; style: 'buy' | 'sell' } | null = null
    for (const [key, groupTrades] of Object.entries(banded)) {
        if (groupTrades.length < 3) continue
        if (!best || groupTrades.length > best.trades.length) {
            const style = key.split('|')[1] as 'buy' | 'sell'
            best = { trades: groupTrades, style }
        }
    }
    return best
}

export function findConcentratedStrikeLevel(trades: Array<{ strike: number }>): number | null {
    if (!trades.length) return null
    const counts = new Map<number, number>()
    for (const t of trades) counts.set(t.strike, (counts.get(t.strike) ?? 0) + 1)
    const strikes = [...counts.keys()].sort((a, b) => a - b)
    if (!strikes.length) return null
    const sample = strikes[0]
    const inc = sample < 25 ? 0.5 : sample < 200 ? 1 : sample < 500 ? 5 : 10
    const maxGap = inc * 2.5
    let bestWeight = 0
    let bestWeightedStrike = strikes[0]
    let i = 0
    while (i < strikes.length) {
        let j = i
        let weight = counts.get(strikes[i])!
        let weightedSum = strikes[i] * counts.get(strikes[i])!
        while (j + 1 < strikes.length && strikes[j + 1] - strikes[j] <= maxGap) {
            j++
            weight += counts.get(strikes[j])!
            weightedSum += strikes[j] * counts.get(strikes[j])!
        }
        if (weight > bestWeight) {
            bestWeight = weight
            bestWeightedStrike = weightedSum / weight
        }
        i = j + 1
    }
    return bestWeightedStrike
}

export function computeStructuralLabel(
    rawTrades: Array<FlowBiasRawTrade> | undefined,
    spot: number | undefined,
    sigma: number | undefined
): { label: string; trades: Array<FlowBiasRawTrade>; level: number | null; putLevel: number | null; isResistance: boolean } {
    if (!rawTrades || !rawTrades.length || !spot || spot <= 0) return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }
    const eligible = rawTrades.filter((t) => t.tradeType !== 'MULTI-LEG' && t.expiry && computeDteFromExpiry(t.expiry) <= 45)
    if (!eligible.length) return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }
    const expiryCounts: Record<string, number> = {}
    for (const t of eligible) expiryCounts[t.expiry!] = (expiryCounts[t.expiry!] || 0) + 1
    const anchorExpiry = Object.entries(expiryCounts).sort((a, b) => b[1] - a[1])[0][0]
    const anchorTime = new Date(anchorExpiry).getTime()
    const windowed = eligible.filter((t) => Math.abs(new Date(t.expiry!).getTime() - anchorTime) <= 7 * 86400000)
    const calls = windowed.filter((t) => t.type === 'call')
    const puts = windowed.filter((t) => t.type === 'put')
    const callBand = calls.length >= 3 ? bestStructuralBand(calls, spot, sigma || 0) : null
    const putBand = puts.length >= 3 ? bestStructuralBand(puts, spot, sigma || 0) : null
    if (!callBand || !putBand) return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }
    if (callBand.style === putBand.style) return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }
    const callPremium = callBand.trades.reduce((s, t) => s + (t.totalPremium || 0), 0)
    const putPremium = putBand.trades.reduce((s, t) => s + (t.totalPremium || 0), 0)
    const maxPrem = Math.max(callPremium, putPremium)
    if (maxPrem === 0 || Math.abs(callPremium - putPremium) / maxPrem > 0.35) {
        return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }
    }
    const callLevel = findConcentratedStrikeLevel(callBand.trades)
    const putLevel = findConcentratedStrikeLevel(putBand.trades)
    if (callLevel === null || putLevel === null) return { label: 'No Structural Formation Detected', trades: [], level: null, putLevel: null, isResistance: true }
    const label = `Traders have built a Call wall at $${callLevel.toFixed(2)} and a Put wall at $${putLevel.toFixed(2)}`
    return { label, trades: [...callBand.trades, ...putBand.trades], level: callLevel, putLevel, isResistance: true }
}

export function computeGammaLabel(
    rawTrades: Array<FlowBiasRawTrade>,
    cardType: 'call' | 'put',
    target1Level: number | null,
    target2Level: number | null,
    targetUp: boolean,
    isLongTerm: boolean,
    cardExpiry: string,
    spot: number | undefined
): { label: string; trades: Array<FlowBiasRawTrade> } {
    if (isLongTerm) return { label: 'No Gamma Attack', trades: [] }
    if (target1Level === null && target2Level === null) return { label: 'No Gamma Attack', trades: [] }
    const isBuy = (t: FlowBiasRawTrade) => t.fillStyle === 'A' || t.fillStyle === 'AA'
    const sameExpiryBuys = rawTrades.filter((t) => t.tradeType !== 'MULTI-LEG' && t.type === cardType && t.expiry === cardExpiry && isBuy(t))
    if (!sameExpiryBuys.length) return { label: 'No Gamma Attack', trades: [] }
    const inc = spot && spot > 0 ? (spot < 25 ? 0.5 : spot < 200 ? 1 : spot < 500 ? 5 : 10) : 1
    const isAtm = (strike: number) => !!spot && Math.abs(strike - spot) < inc * 1.5
    const outerTarget = target1Level !== null && target2Level !== null
        ? (targetUp ? Math.max(target1Level, target2Level) : Math.min(target1Level, target2Level))
        : (target1Level ?? target2Level)
    const inPopBand = (strike: number) => {
        if (!spot || outerTarget === null || outerTarget === undefined) return false
        return targetUp ? strike >= spot && strike <= outerTarget : strike <= spot && strike >= outerTarget
    }
    const qualifying = sameExpiryBuys.filter((t) => isAtm(t.strike) || inPopBand(t.strike))
    if (qualifying.length >= 3) return { label: 'Gamma Squeeze in Formation', trades: qualifying }
    return { label: 'No Gamma Attack', trades: [] }
}
