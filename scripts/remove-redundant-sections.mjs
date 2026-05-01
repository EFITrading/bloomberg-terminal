import { readFileSync, writeFileSync } from 'fs'

const filePath = new URL('../src/components/analytics/HistoricalEventsResearch.tsx', import.meta.url).pathname.replace(/^\//, '')

let src = readFileSync(filePath, 'utf8')

// ──────────────────────────────────────────────────────────
// 1. Remove everything from CHART INSTRUMENT TOGGLES comment
//    through the closing </> of the leaderboard condition block,
//    replacing with just the closing </>
// ──────────────────────────────────────────────────────────
const startMarker = `                        {/* ── CHART INSTRUMENT TOGGLES ──────────────────── */}`
const endMarker = `                      </>`

const startIdx = src.indexOf(startMarker)
if (startIdx === -1) {
  console.error('ERROR: Could not find CHART INSTRUMENT TOGGLES marker')
  process.exit(1)
}

// Find the closing </> that ends the leaderboard condition block
// It appears after all the grouped stats content
const endIdx = src.indexOf(endMarker, startIdx)
if (endIdx === -1) {
  console.error('ERROR: Could not find closing </> after startMarker')
  process.exit(1)
}

// Remove from startMarker up to and including endMarker
src = src.slice(0, startIdx) + src.slice(endIdx + endMarker.length)

// ──────────────────────────────────────────────────────────
// 2. Fix the "No data" fallback — it previously checked leaderboard.length === 0
//    which was a secondary fallback. Now we can simplify it to check for any data.
//    We'll change the condition to check if stats has any instrument data.
// ──────────────────────────────────────────────────────────
const oldFallback = `                  {!stats.loading && !stats.error && leaderboard.length === 0 && (`
const newFallback = `                  {!stats.loading && !stats.error && !leaderboard.length && !chartData.length && (`

if (src.includes(oldFallback)) {
  src = src.replace(oldFallback, newFallback)
} else {
  console.log('Note: fallback condition not found or already updated')
}

// ──────────────────────────────────────────────────────────
// 3. Also change the outer condition from leaderboard-dependent
//    to just check that loading/error are done (show table always)
// ──────────────────────────────────────────────────────────
const oldCondition = `                  {!stats.loading &&
                    !stats.error &&
                    (leaderboard.length > 0 || chartData.length > 0) && (`
const newCondition = `                  {!stats.loading &&
                    !stats.error && (`

if (src.includes(oldCondition)) {
  src = src.replace(oldCondition, newCondition)
} else {
  console.log('Note: outer condition not found or already updated')
}

writeFileSync(filePath, src, 'utf8')
console.log('Done! Redundant sections removed.')
