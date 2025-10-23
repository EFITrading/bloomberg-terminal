const fs = require('fs');
const path = require('path');

const rootPath = 'c:\\Users\\Zak\\Downloads\\Highlights\\bloomberg-terminal\\src';

// Regex to match all emojis
const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{231A}]|[\u{231B}]|[\u{23F0}]|[\u{23F3}]|[\u{25AA}]|[\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{2B06}]|[\u{2B07}]|[\u{2934}]|[\u{2935}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{FE0F}]|[\u{203C}]|[\u{2049}]|[\u{20E3}]|[\u{2122}]|[\u{2139}]|[\u{2194}-\u{2199}]|[\u{21A9}-\u{21AA}]|[\u{23E9}-\u{23EF}]|[\u{23F8}-\u{23FA}]|[\u{24C2}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2705}]|[\u{2728}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2B50}]|[\u{2B55}]/gu;

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

let totalFiles = 0;

console.log('Removing emojis from code...\n');

const files = getAllFiles(rootPath);

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const cleaned = content.replace(emojiRegex, '').replace(/  +/g, ' ');
  
  if (content !== cleaned) {
    fs.writeFileSync(file, cleaned, 'utf8');
    totalFiles++;
    console.log(`✓ Cleaned: ${path.basename(file)}`);
  }
});

console.log(`\nDone! Removed emojis from ${totalFiles} files`);
