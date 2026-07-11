const fs = require('fs')
const file = 'src/components/AlgoFlowScreener.tsx'
let c = fs.readFileSync(file, 'utf8')

// Each mojibake sequence is the result of UTF-8 bytes being interpreted as Latin-1
// then re-encoded as UTF-8. We map the garbled form back to the correct character.
const map = [
    ['\u00e2\u0080\u0094', '\u2014'],  // â€" → —  (em dash)
    ['\u00e2\u0080\u0099', '\u2019'],  // â€™ → '  (right single quote)
    ['\u00e2\u0080\u0098', '\u2018'],  // â€˜ → '  (left single quote)
    ['\u00e2\u0080\u009c', '\u201c'],  // â€œ → "  (left double quote)
    ['\u00e2\u0080\u009d', '\u201d'],  // â€  → "  (right double quote)
    ['\u00e2\u0080\u00a2', '\u2022'],  // â€¢ → •  (bullet)
    ['\u00e2\u0080\u00a6', '\u2026'],  // â€¦ → …  (ellipsis)
    ['\u00e2\u0086\u0090', '\u2190'],  // â†' → ←
    ['\u00e2\u0086\u0092', '\u2192'],  // â†' → →
    ['\u00e2\u0086\u0091', '\u2191'],  // â†' → ↑
    ['\u00e2\u0086\u0093', '\u2193'],  // â†" → ↓
    ['\u00e2\u0086\u00ba', '\u21ba'],  // â†º → ↺
    ['\u00e2\u0089\u00a5', '>='],      // â‰¥ → >=
    ['\u00e2\u0089\u00a4', '<='],      // â‰¤ → <=
    ['\u00e2\u0094\u0080', '\u2500'],  // â"€ → ─
    ['\u00e2\u0094\u0082', '\u2502'],  // â"‚ → │
    ['\u00e2\u0096\u00b2', '\u25b2'],  // â–² → ▲
    ['\u00e2\u0096\u00be', '\u25be'],  // â–¾ → ▾
    ['\u00e2\u0097\u008b', '\u25cb'],  // â—‹ → ○
    ['\u00e2\u0097\u008f', '\u25cf'],  // â—  → ●
    ['\u00e2\u009c\u0094', '\u2714'],  // âœ" → ✔
    ['\u00e2\u009c\u0095', '\u2715'],  // âœ• → ✕
    ['\u00e2\u009c\u0096', '\u2716'],  // âœ– → ✖
]

let count = 0
for (const [bad, good] of map) {
    const before = c.split(bad).length - 1
    if (before > 0) {
        c = c.split(bad).join(good)
        console.log(`Replaced ${before}x  ${JSON.stringify(bad)} → ${good}`)
        count += before
    }
}

fs.writeFileSync(file, c, 'utf8')
console.log(`\nTotal replacements: ${count}`)

// Check remaining
const leftover = [...c.matchAll(/\u00e2[\u0080-\u00bf][\u0080-\u00bf]/g)]
console.log(`Remaining mojibake sequences: ${leftover.length}`)
if (leftover.length > 0) {
    const uniq = [...new Set(leftover.map(m => m[0]))]
    uniq.forEach(s => console.log(' ', JSON.stringify(s), Buffer.from(s).toString('hex')))
}
