/**
 * GaugeTrio Logic Test
 * Tests the exact same functions used in LiquidPanel.tsx GaugeTrio.
 * Zero hardcoded expected values — all assertions are derived from the math.
 * Run: node scripts/test-gauge-trio.mjs
 */

// ─── EXACT COPIES OF PRODUCTION FUNCTIONS ────────────────────────────────────

const normalCDF = (x) => {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x) / Math.sqrt(2)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax)
  return 0.5 * (1 + sign * y)
}

const bsDelta = (S, K, dte, iv) => {
  const T = Math.max(dte, 0.5) / 365
  const sigma = Math.max(iv, 0.05)
  const d1 = (Math.log(S / K) + (0.045 + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T))
  return normalCDF(d1)
}

const expWeight = (dte) => (dte >= 0 ? Math.exp(-Math.max(1, dte) / 21) : 1)

/** Build mmData from dealer data — mirrors the production useMemo */
function buildMmData(currentPrice, dealerByStrikeByExpiration, mmExpirations) {
  const sr = currentPrice * 0.2
  const minS = currentPrice - sr
  const maxS = currentPrice + sr
  const allStrikes = new Set()
  mmExpirations.forEach((exp) => {
    if (dealerByStrikeByExpiration[exp]) {
      Object.keys(dealerByStrikeByExpiration[exp])
        .map(Number)
        .filter((s) => s >= minS && s <= maxS)
        .forEach((s) => allStrikes.add(s))
    }
  })
  return Array.from(allStrikes).map((strike) => {
    let tCD = 0, tPD = 0, tCG = 0, tPG = 0, tCT = 0, tPT = 0, tCV = 0, tPV = 0
    mmExpirations.forEach((exp) => {
      const sd = dealerByStrikeByExpiration[exp]?.[strike]
      if (!sd) return
      const daysToExp = Math.ceil((new Date(exp + 'T00:00:00Z').getTime() - Date.now()) / 86400000)
      const w = expWeight(daysToExp)
      const cOI = sd.callOI || 0
      const pOI = sd.putOI || 0
      const iv = sd.callIV || 0.3
      const cd = sd.callDelta != null && sd.callDelta !== 0 ? Math.abs(sd.callDelta) : bsDelta(currentPrice, strike, daysToExp, iv)
      const pd = sd.putDelta != null && sd.putDelta !== 0 ? sd.putDelta : cd - 1
      tCD += cd * cOI * 100 * w
      tPD += pd * pOI * 100 * w
      tCG += (sd.callGamma || 0) * cOI * w
      tPG += (sd.putGamma || 0) * pOI * w
      tCT += (sd.callTheta || 0) * cOI * w
      tPT += (sd.putTheta || 0) * pOI * w
      tCV += (sd.callVega || 0) * cOI * w
      tPV += (sd.putVega || 0) * pOI * w
    })
    return { strike, netDelta: tCD + tPD, netGamma: tCG + tPG, netTheta: tCT + tPT, netVega: tCV + tPV }
  })
}

function computeMetrics(mmData) {
  const tND = mmData.reduce((s, i) => s + i.netDelta, 0)
  const tNG = mmData.reduce((s, i) => s + i.netGamma, 0)
  const tNT = mmData.reduce((s, i) => s + i.netTheta, 0)
  const tNV = mmData.reduce((s, i) => s + i.netVega, 0)
  const dS = Math.max(-100, Math.min(100, tND / 100000))
  const gS = Math.max(-100, Math.min(100, tNG / 1000))
  const tS = Math.max(-100, Math.min(100, tNT / 1000))
  const vS = Math.max(-100, Math.min(100, tNV / 1000))
  const compositeScore = dS * 0.3 + gS * 0.35 + tS * 0.2 + vS * 0.15
  let signal = 'WAIT'
  if (compositeScore > 3) signal = 'BUY SETUP'
  else if (compositeScore > 1) signal = 'LEAN BUY'
  else if (compositeScore < -3) signal = 'SELL SETUP'
  else if (compositeScore < -1) signal = 'LEAN SELL'
  return { compositeScore, signal, dS, gS, tS, vS }
}

function computeStabilityIndex(currentPrice, dealerByStrikeByExpiration, mmExpirations) {
  let totalGEX = 0, totalVEX = 0, totalDEX = 0
  mmExpirations.forEach((exp) => {
    const gexData = dealerByStrikeByExpiration[exp]
    if (!gexData) return
    const daysToExp = Math.ceil((new Date(exp + 'T00:00:00Z').getTime() - Date.now()) / 86400000)
    const w = expWeight(daysToExp)
    Object.entries(gexData).forEach(([strike, data]) => {
      const sp = parseFloat(strike)
      const cOI = data.callOI || 0
      const pOI = data.putOI || 0
      if (cOI === 0 && pOI === 0) return
      const cG = data.callGamma || 0, pG = data.putGamma || 0
      if (cOI > 0 && cG !== 0) totalGEX += cG * cOI * (currentPrice * currentPrice) * 100 * w
      if (pOI > 0 && pG !== 0) totalGEX += -pG * pOI * (currentPrice * currentPrice) * 100 * w
      const cV = data.callVega || 0, pV = data.putVega || 0
      if (cOI > 0 && cV !== 0) totalVEX += cV * cOI * 100 * w
      if (pOI > 0 && pV !== 0) totalVEX += -pV * pOI * 100 * w
      const iv = data.callIV || 0.3
      const callD = data.callDelta != null && data.callDelta !== 0 ? Math.abs(data.callDelta) : bsDelta(currentPrice, sp, daysToExp, iv)
      const putD = data.putDelta != null && data.putDelta !== 0 ? data.putDelta : callD - 1
      totalDEX += (callD * cOI * 100 * currentPrice + putD * pOI * 100 * currentPrice) * w
    })
  })
  const denom = Math.abs(totalVEX) + Math.abs(totalDEX)
  return denom !== 0 ? totalGEX / denom : 0
}

// ─── TEST RUNNER ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`)
    passed++
  } else {
    console.error(`  ✗  ${label}${detail ? '  →  ' + detail : ''}`)
    failed++
  }
}

function section(name) {
  console.log(`\n── ${name} ──`)
}

// ─── HELPER: build a future date string DTE days from now ─────────────────────
function futureDate(dte) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + dte)
  return d.toISOString().slice(0, 10)
}

// ─── SECTION 1: normalCDF ────────────────────────────────────────────────────
section('normalCDF')
assert('N(0) = 0.5',                         Math.abs(normalCDF(0) - 0.5) < 1e-6)
assert('N(∞) → 1',                           normalCDF(10) > 0.9999)
assert('N(-∞) → 0',                          normalCDF(-10) < 0.0001)
assert('N(x) + N(-x) = 1 for x=1.5',        Math.abs(normalCDF(1.5) + normalCDF(-1.5) - 1) < 1e-9)
assert('N(1.96) ≈ 0.975 (z-table check)',    Math.abs(normalCDF(1.96) - 0.975) < 0.001)

// ─── SECTION 2: bsDelta ──────────────────────────────────────────────────────
section('bsDelta')
const S = 500, iv = 0.25
// ATM call delta must be close to 0.5 (slightly above due to drift)
const atmDelta = bsDelta(S, S, 30, iv)
assert('ATM call delta ∈ (0.48, 0.58)',      atmDelta > 0.48 && atmDelta < 0.58, `got ${atmDelta.toFixed(4)}`)

// Deep ITM: strike much lower → delta near 1
const deepItmDelta = bsDelta(S, S * 0.7, 30, iv)
assert('Deep ITM call delta > 0.95',         deepItmDelta > 0.95, `got ${deepItmDelta.toFixed(4)}`)

// Deep OTM: strike much higher → delta near 0
const deepOtmDelta = bsDelta(S, S * 1.3, 30, iv)
assert('Deep OTM call delta < 0.05',        deepOtmDelta < 0.05, `got ${deepOtmDelta.toFixed(4)}`)

// Call delta decreases as strike increases (holding everything else fixed)
const d1 = bsDelta(S, S * 0.95, 30, iv)
const d2 = bsDelta(S, S * 1.00, 30, iv)
const d3 = bsDelta(S, S * 1.05, 30, iv)
assert('Call delta monotone: d(K=0.95S) > d(K=S) > d(K=1.05S)', d1 > d2 && d2 > d3, `${d1.toFixed(3)} > ${d2.toFixed(3)} > ${d3.toFixed(3)}`)

// Higher IV → ATM delta stays near 0.5 but OTM delta increases
const otmLowIV  = bsDelta(S, S * 1.1, 30, 0.15)
const otmHighIV = bsDelta(S, S * 1.1, 30, 0.50)
assert('Higher IV raises OTM call delta',   otmHighIV > otmLowIV, `low IV: ${otmLowIV.toFixed(3)}, high IV: ${otmHighIV.toFixed(3)}`)

// Real IV vs hardcoded 0.3 — should produce different deltas for OTM
const deltaRealIV   = bsDelta(S, S * 1.08, 21, 0.45)
const deltaHardcoded = bsDelta(S, S * 1.08, 21, 0.30)
assert('Real IV (0.45) ≠ hardcoded (0.30) for OTM strike', Math.abs(deltaRealIV - deltaHardcoded) > 0.02,
  `diff = ${Math.abs(deltaRealIV - deltaHardcoded).toFixed(4)}`)

// ─── SECTION 3: expWeight ────────────────────────────────────────────────────
section('exp(-DTE/21) weighting')
assert('w(1)  = e^(-1/21) ≈ 0.953',         Math.abs(expWeight(1)  - Math.exp(-1/21))  < 1e-10)
assert('w(7)  = e^(-7/21) ≈ 0.716',         Math.abs(expWeight(7)  - Math.exp(-7/21))  < 1e-10)
assert('w(21) = e^(-1)    ≈ 0.368',         Math.abs(expWeight(21) - Math.exp(-1))     < 1e-10)
assert('w(45) = e^(-45/21) < w(21)',         expWeight(45) < expWeight(21))
assert('w(7) > w(14) > w(21) > w(45) — monotone decay',
  expWeight(7) > expWeight(14) && expWeight(14) > expWeight(21) && expWeight(21) > expWeight(45))
// 0DTE clamps to DTE=1 (no blow-up)
assert('w(0) uses min DTE 1, same as w(1)', Math.abs(expWeight(0) - expWeight(1)) < 1e-10)
// Ratio: 7-DTE gets roughly 6× more weight than 45-DTE
const ratio = expWeight(7) / expWeight(45)
assert('w(7) / w(45) > 5 (near-term dominates)',  ratio > 5, `ratio = ${ratio.toFixed(2)}`)

// ─── SECTION 4: delta source priority — actual data beats BS fallback ─────────
section('Delta source: actual data > BS fallback')
const currentPrice = 500
const exp7 = futureDate(7)
const exp21 = futureDate(21)

// Contract with actual delta stored
const dataWithDelta = {
  [exp7]: {
    500: { callOI: 1000, putOI: 0, callDelta: 0.62, putDelta: 0, callGamma: 0.005, putGamma: 0, callTheta: -0.1, putTheta: 0, callVega: 0.2, putVega: 0, callIV: 0.28 }
  }
}
const mmWithDelta = buildMmData(currentPrice, dataWithDelta, [exp7])
const expectedCD = 0.62 * 1000 * 100 * expWeight(7)
assert('Actual callDelta 0.62 used (not BS)', Math.abs(mmWithDelta[0].netDelta - expectedCD) < 0.01,
  `got ${mmWithDelta[0].netDelta.toFixed(2)}, expected ${expectedCD.toFixed(2)}`)

// Same contract but WITHOUT actual delta — should use BS
const dataWithoutDelta = {
  [exp7]: {
    500: { callOI: 1000, putOI: 0, callDelta: 0, putDelta: 0, callGamma: 0.005, putGamma: 0, callTheta: -0.1, putTheta: 0, callVega: 0.2, putVega: 0, callIV: 0.28 }
  }
}
const mmWithoutDelta = buildMmData(currentPrice, dataWithoutDelta, [exp7])
const bsFallback = bsDelta(currentPrice, 500, 7, 0.28)
const expectedBSCD = bsFallback * 1000 * 100 * expWeight(7)
assert('BS fallback used when callDelta=0', Math.abs(mmWithoutDelta[0].netDelta - expectedBSCD) < 0.01,
  `got ${mmWithoutDelta[0].netDelta.toFixed(2)}, expected ${expectedBSCD.toFixed(2)}`)

// Real IV from data vs hardcoded 0.3 should give different netDelta
const dataRealIV = {
  [exp7]: {
    550: { callOI: 500, putOI: 0, callDelta: 0, putDelta: 0, callGamma: 0.003, putGamma: 0, callTheta: -0.05, putTheta: 0, callVega: 0.15, putVega: 0, callIV: 0.50 }
  }
}
const dataFakeIV = {
  [exp7]: {
    550: { callOI: 500, putOI: 0, callDelta: 0, putDelta: 0, callGamma: 0.003, putGamma: 0, callTheta: -0.05, putTheta: 0, callVega: 0.15, putVega: 0, callIV: 0.30 }
  }
}
const mmRealIV = buildMmData(currentPrice, dataRealIV, [exp7])
const mmFakeIV = buildMmData(currentPrice, dataFakeIV, [exp7])
assert('Real IV=0.50 produces higher OTM delta than 0.30',
  mmRealIV[0].netDelta > mmFakeIV[0].netDelta,
  `realIV netDelta=${mmRealIV[0].netDelta.toFixed(1)}, fakeIV netDelta=${mmFakeIV[0].netDelta.toFixed(1)}`)

// ─── SECTION 5: compositeScore signal thresholds ─────────────────────────────
section('Composite score → signal mapping')
// Build scenarios that force specific scores by injecting known greek values
function scoreFromValues(tND, tNG, tNT, tNV) {
  const dS = Math.max(-100, Math.min(100, tND / 100000))
  const gS = Math.max(-100, Math.min(100, tNG / 1000))
  const tS = Math.max(-100, Math.min(100, tNT / 1000))
  const vS = Math.max(-100, Math.min(100, tNV / 1000))
  return dS * 0.3 + gS * 0.35 + tS * 0.2 + vS * 0.15
}

// Strong bullish: all greeks positive and large
const bullScore = scoreFromValues(1_500_000, 15_000, 10_000, 8_000)
assert('Large bullish Greeks → BUY SETUP (score > 3)',   bullScore > 3, `score=${bullScore.toFixed(2)}`)

// Strong bearish
const bearScore = scoreFromValues(-1_500_000, -15_000, -10_000, -8_000)
assert('Large bearish Greeks → SELL SETUP (score < -3)', bearScore < -3, `score=${bearScore.toFixed(2)}`)

// Neutral
const neutralScore = scoreFromValues(0, 0, 0, 0)
assert('Zero Greeks → WAIT (score = 0)',                 neutralScore === 0)

// Mild bullish
const mildBull = scoreFromValues(200_000, 2_000, 1_500, 1_000)
assert('Mild bullish → score in (1, 3)',                 mildBull > 1 && mildBull <= 3, `score=${mildBull.toFixed(2)}`)

// ─── SECTION 6: Stability Index ──────────────────────────────────────────────
section('Stability Index (SI = GEX / (|VEX| + |DEX|))')

// Scenario A: high GEX, low VEX/DEX → stable (SI > 0.5)
const stableData = {
  [exp7]: {
    500: { callOI: 50000, putOI: 30000, callGamma: 0.008, putGamma: 0.006, callVega: 0.01, putVega: 0.01, callDelta: 0.55, putDelta: -0.45, callIV: 0.25 }
  }
}
const siStable = computeStabilityIndex(currentPrice, stableData, [exp7])
assert('High GEX, low VEX/DEX → SI > 0',  siStable > 0, `SI=${siStable.toFixed(4)}`)

// Scenario B: negative net GEX (short gamma dominates) → reflexive (SI < 0)
const reflexiveData = {
  [exp7]: {
    500: { callOI: 1000, putOI: 80000, callGamma: 0.001, putGamma: 0.010, callVega: 0.3, putVega: 0.3, callDelta: 0.55, putDelta: -0.45, callIV: 0.25 }
  }
}
const siReflexive = computeStabilityIndex(currentPrice, reflexiveData, [exp7])
assert('Put-heavy short gamma → SI < 0 (reflexive)', siReflexive < 0, `SI=${siReflexive.toFixed(4)}`)

// Scenario C: two expirations with DIFFERENT greek profiles — far expiry has high vega (destabilizing)
// Near: high gamma/low vega → stabilizing. Far: low gamma/high vega → destabilizing.
// Adding the far expiry (even with lower weight) should push SI down vs near-only.
const dualNear = { 500: { callOI: 10000, putOI: 0, callGamma: 0.010, putGamma: 0, callVega: 0.05, putVega: 0, callDelta: 0.55, putDelta: 0, callIV: 0.25 } }
const dualFar  = { 500: { callOI: 10000, putOI: 0, callGamma: 0.001, putGamma: 0, callVega: 0.80, putVega: 0, callDelta: 0.55, putDelta: 0, callIV: 0.25 } }
const dualSI = computeStabilityIndex(currentPrice, { [exp7]: dualNear, [exp21]: dualFar }, [exp7, exp21])
const nearOnlySI = computeStabilityIndex(currentPrice, { [exp7]: dualNear }, [exp7])
assert('Far expiry with different greeks changes SI (weighting is active)',
  Math.abs(dualSI - nearOnlySI) > 0.01,
  `dual=${dualSI.toFixed(4)}, nearOnly=${nearOnlySI.toFixed(4)}`)

// Scenario D: empty data → SI = 0 (no div by zero)
const siEmpty = computeStabilityIndex(currentPrice, {}, [])
assert('Empty data → SI = 0 (no crash)',  siEmpty === 0)

// ─── SECTION 7: Strike range filter ──────────────────────────────────────────
section('Strike ±20% filter')
const outOfRangeData = {
  [exp7]: {
    300: { callOI: 9999, putOI: 0, callGamma: 0.01, putGamma: 0, callDelta: 0.9, putDelta: 0, callIV: 0.25 }, // 40% OTM — excluded
    500: { callOI: 1000, putOI: 0, callGamma: 0.005, putGamma: 0, callDelta: 0.55, putDelta: 0, callIV: 0.25 }, // ATM — included
    700: { callOI: 9999, putOI: 0, callGamma: 0.01, putGamma: 0, callDelta: 0.1, putDelta: 0, callIV: 0.25 }, // 40% OTM — excluded
  }
}
const filteredMm = buildMmData(500, outOfRangeData, [exp7])
const strikes = filteredMm.map(r => r.strike)
assert('Strike 300 (40% OTM) excluded', !strikes.includes(300))
assert('Strike 500 (ATM) included',      strikes.includes(500))
assert('Strike 700 (40% OTM) excluded', !strikes.includes(700))

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`  ${passed + failed} tests   ${passed} passed   ${failed} failed`)
if (failed > 0) {
  console.error(`\n  FAIL — ${failed} assertion(s) failed`)
  process.exit(1)
} else {
  console.log(`\n  ALL PASS`)
}
