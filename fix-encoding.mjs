import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

// Mojibake map: UTF-8 bytes of these chars were misread as Latin-1 then re-encoded as UTF-8
// Each left side is the garbled sequence, right side is the correct character
const replacements = [
  // Box drawing characters (most common - used in comment decorators)
  ['â\x94\x80', '\u2500'],  // ─ BOX DRAWINGS LIGHT HORIZONTAL
  ['â\x94\x82', '\u2502'],  // │ BOX DRAWINGS LIGHT VERTICAL
  ['â\x94\x94', '\u2514'],  // └
  ['â\x94\x8c', '\u250c'],  // ┌
  ['â\x94\x9c', '\u251c'],  // ├
  ['â\x94\xa4', '\u2524'],  // ┤
  ['â\x94\xac', '\u252c'],  // ┬
  ['â\x94\xb4', '\u2534'],  // ┴
  ['â\x94\xbc', '\u253c'],  // ┼
  // Dashes
  ['â\x80\x94', '\u2014'],  // — EM DASH
  ['â\x80\x93', '\u2013'],  // – EN DASH
  // Infinity
  ['â\x88\x9e', '\u221e'],  // ∞
  // Warning sign
  ['â\x9a\xa0', '\u26a0'],  // ⚠
  // Variation selector
  ['\xef\xb8\x8f', '\ufe0f'], // ️
  // Quotes
  ['â\x80\x99', '\u2019'],  // '
  ['â\x80\x9c', '\u201c'],  // "
  ['â\x80\x9d', '\u201d'],  // "
  // Other common ones
  ['\xc3\x97', '\u00d7'],   // ×
  ['\xc2\xb0', '\u00b0'],   // °
  ['\xc2\xb7', '\u00b7'],   // ·
];

// Build a single regex that matches all keys
const pattern = new RegExp(
  replacements.map(([bad]) => bad.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')).join('|'),
  'g'
);

const lookup = Object.fromEntries(replacements);

const files = await glob('src/**/*.{tsx,ts,css}', {
  cwd: 'c:/Users/zakho/Documents/bloomberg-terminal',
  absolute: true,
});

let fixed = 0;
for (const file of files) {
  const original = readFileSync(file, 'latin1'); // read as latin1 to preserve bytes
  // We need to work at the UTF-8 level
  const buf = readFileSync(file);
  const text = buf.toString('utf8');

  // Check if any mojibake present by looking for the actual chars
  const mojibakeChars = ['â\x94\x80', 'â\x80\x94', 'â\x88\x9e', 'â\x9a\xa0', 'â\x80\x93'];
  const hasMojibake = mojibakeChars.some(s => text.includes(s));
  if (!hasMojibake) continue;

  let fixed_text = text;
  for (const [bad, good] of replacements) {
    fixed_text = fixed_text.split(bad).join(good);
  }

  if (fixed_text !== text) {
    writeFileSync(file, Buffer.from(fixed_text, 'utf8'));
    console.log('Fixed:', file.split('/src/')[1]);
    fixed++;
  }
}
console.log(`\nDone. Fixed ${fixed} files.`);
