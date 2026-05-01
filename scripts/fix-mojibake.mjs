import { readFileSync, writeFileSync } from 'fs'

const file = 'src/components/analytics/HistoricalEventsResearch.tsx'
let c = readFileSync(file, 'utf8')

// garbled minus â\u02c6\u2019 -> hyphen
c = c.replaceAll('\u00e2\u02c6\u2019', '-')

// garbled right arrow â\u2020\u2019 -> arrow text
c = c.replaceAll('\u00e2\u2020\u2019', '\u2192')

// garbled bullet â\u20ac\u00a2 -> |
c = c.replaceAll('\u00e2\u20ac\u00a2', '|')

// garbled em dash â\u20ac\u201d -> em dash
c = c.replaceAll('\u00e2\u20ac\u201d', '\u2014')

// garbled box drawing â\u201d\u20ac -> box char  
c = c.replaceAll('\u00e2\u201d\u20ac', '\u2500')

writeFileSync(file, c, 'utf8')
console.log('Fixed.')
