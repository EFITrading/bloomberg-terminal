const fs = require('fs');
const path = require('path');

const rootPath = 'c:\\Users\\Zak\\Downloads\\Highlights\\bloomberg-terminal\\src';

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

console.log('Cleaning up overdone titles/comments (keeping actual code)...\n');

const files = getAllFiles(rootPath);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  
  // Clean up overdone comment lines ONLY (not actual code)
  content = content.replace(/\/\/ SCAN EVERYTHING\s*\n/g, '');
  content = content.replace(/\/\/ NO FAKE INFERENCE\s*\n/g, '');
  content = content.replace(/\/\/ NO SAMPLING\s*\n/g, '');
  content = content.replace(/\/\/ ANALYZE EVERY SINGLE TRADE.*\n/g, '// Analyze trades\n');
  content = content.replace(/\/\/ BIGGER BATCHES FOR FASTER PROCESSING\s*\n/g, '');
  content = content.replace(/\/\/ ALL TRADES ANALYZED.*\n/g, '');
  content = content.replace(/\/\/ FULL ANALYSIS MODE.*\n/g, '');
  content = content.replace(/\/\/ COMPLETE ANALYSIS.*\n/g, '');
  
  // Simplify inline comments (keep the code, just clean the comment)
  content = content.replace(/\/\/ BIGGER batches for faster scanning/g, '// Batch size');
  content = content.replace(/\/\/ Process all trades with full parallel processing/g, '// Process trades in parallel');
  
  // Remove overdone console.log statements ENTIRELY
  content = content.replace(/\s*console\.log\(`.*FULL ANALYSIS MODE.*`\);\s*\n/g, '');
  content = content.replace(/\s*console\.log\(`.*COMPLETE ANALYSIS.*`\);\s*\n/g, '');
  content = content.replace(/\s*console\.log\(`.*Processed ALL.*FULL ANALYSIS.*`\);\s*\n/g, '');
  content = content.replace(/\s*console\.log\('.*Clearing all trades data.*'\);\s*\n/g, '');
  content = content.replace(/\s*console\.log\('.*ADVANTAGE: Promise\.all.*'\);\s*\n/g, '');
  
  // Simplify CRITICAL/IMPORTANT in comments (not code)
  content = content.replace(/\/\/ CRITICAL:\s+/g, '// ');
  content = content.replace(/\/\/ IMPORTANT:\s+/g, '// ');
  content = content.replace(/\/\/ CRITICAL FIX:\s+/g, '// Fix: ');
  
  // Remove marketing text from JSX
  content = content.replace(/\s*<p className="[^"]*">No fake data - 100% real market feeds<\/p>\s*\n/g, '');
  
  // Clean up excessive whitespace
  content = content.replace(/\n\n\n+/g, '\n\n');
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalFiles++;
    console.log(`Cleaned: ${path.basename(file)}`);
  }
});

console.log(`\nDone! Cleaned ${totalFiles} files`);
