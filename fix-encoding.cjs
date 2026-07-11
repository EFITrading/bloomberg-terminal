const fs = require('fs');
const path = require('path');

// Verified mojibake -> correct Unicode replacements
// All confirmed via codepoint inspection and Win-1252 reverse decoding
const replacements = [
  ['\u00e2\u0153\u2022', '\u2715'],  // âœ• -> ✕
  ['\u00e2\u0153\u201c', '\u2713'],  // âœ" -> ✓
  ['\u00e2\u2020\u00a9', '\u21a9'],  // â†© -> ↩
  ['\u00e2\u2020\u00aa', '\u21aa'],  // â†ª -> ↪
  ['\u00e2\u02dc\u2026', '\u2605'],  // â˜… -> ★
  ['\u00e2\u02dc\u2020', '\u2606'],  // â˜† -> ☆
  ['\u00e2\u2020\u2019', '\u2192'],  // â†' -> →
  ['\u00e2\u2018\u00a0', '\u2460'],  // â'  -> ①
  ['\u00e2\u2018\u00a1', '\u2461'],  // â'¡ -> ②
  ['\u00e2\u2020\u2018', '\u2191'],  // â†' -> ↑
  ['\u00e2\u2020\u201c', '\u2193'],  // â†" -> ↓
  ['\u00e2\u008f\u00b1', '\u23f1'],  // â± -> ⏱
  ['\u00e2\u0153\u2026', '\u2705'],  // âœ… -> ✅
  ['\u00e2\u0153\u00a6', '\u2726'],  // âœ¦ -> ✦
  ['\u00e2\u2014\u008f', '\u25cf'],  // â— -> ●
  ['\u00e2\u0153\u017d', '\u270e'],  // âœŽ -> ✎
];

function walk(dir, exts, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, exts, out);
    else if (exts.some(x => e.name.endsWith(x))) out.push(full);
  }
}

const files = [];
walk('c:\\Users\\zakho\\Documents\\bloomberg-terminal\\src', ['.tsx', '.ts', '.css'], files);

let count = 0;
for (const file of files) {
  let text = fs.readFileSync(file, 'utf8');
  const orig = text;
  for (const [bad, good] of replacements) {
    text = text.split(bad).join(good);
  }
  if (text !== orig) {
    fs.writeFileSync(file, text, 'utf8');
    console.log('Fixed:', file.split('bloomberg-terminal\\')[1].replace(/\\/g, '/'));
    count++;
  }
}
console.log('Done. Fixed', count, 'files.');
