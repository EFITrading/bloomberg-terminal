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

console.log('Cleaning up overdone text...\n');

const files = getAllFiles(rootPath);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  
  // Remove overdone comments
  content = content.replace(/\/\/ ANALYZE EVERY SINGLE TRADE - NO SAMPLING\n/g, '// Analyze all trades\n');
  content = content.replace(/\/\/ SCAN EVERYTHING\n/g, '');
  content = content.replace(/\/\/ NO FAKE INFERENCE\n/g, '');
  content = content.replace(/\/\/ BIGGER BATCHES FOR FASTER PROCESSING\n/g, '// Process in batches\n');
  content = content.replace(/\/\/ ALL TRADES ANALYZED - NO MAPPING NEEDED\n/g, '');
  content = content.replace(/\/\/ BIGGER batches for faster scanning/g, '// Batch size');
  content = content.replace(/\/\/ Process all trades with full parallel processing/g, '// Process trades in parallel');
  
  // Remove overdone console.logs
  content = content.replace(/console\.log\(`\? FULL ANALYSIS MODE: Analyzing ALL \$\{[^}]+\} trades - NO SAMPLING`\);\n/g, '');
  content = content.replace(/console\.log\(`\?\? COMPLETE ANALYSIS: Every single trade analyzed!`\);\n/g, '');
  content = content.replace(/console\.log\(`\? Processed ALL \$\{[^}]+\} trades with FULL ANALYSIS - NO SAMPLING`\);\n/g, '');
  content = content.replace(/console\.log\(' Clearing all trades data'\);\n/g, '');
  content = content.replace(/console\.log\(' ADVANTAGE: Promise\.all provides true parallel execution with better error handling'\);\n/g, '');
  content = content.replace(/console\.log\(\s*`\s*WARNING: Only scanning 1 ticker[^`]+`\s*\);\n/g, '');
  
  // Simplify CRITICAL/IMPORTANT comments
  content = content.replace(/\/\/ CRITICAL:\s*/g, '// ');
  content = content.replace(/\/\/ IMPORTANT:\s*/g, '// ');
  content = content.replace(/\/\/ CRITICAL FIX:\s*/g, '// Fix: ');
  
  // Remove "No fake data" marketing text
  content = content.replace(/<p className="text-gray-500 text-xs mt-1">No fake data - 100% real market feeds<\/p>/g, '');
  content = content.replace(/\/\/ Return only real current IV data - no fake historical generation/g, '// Return current IV data');
  
  // Simplify overdone inline comments
  content = content.replace(/\/\/ SCAN EVERYTHING/g, '');
  content = content.replace(/\/\/ NO FAKE INFERENCE/g, '');
  content = content.replace(/const tradesToAnalyze = trades; \/\/ SCAN EVERYTHING/g, 'const tradesToAnalyze = trades;');
  content = content.replace(/const useStatisticalInference = false; \/\/ NO FAKE INFERENCE/g, 'const useStatisticalInference = false;');
  
  // Clean up excessive whitespace from removals
  content = content.replace(/\n\n\n+/g, '\n\n');
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalFiles++;
    console.log(`Cleaned: ${path.basename(file)}`);
  }
});

console.log(`\nDone! Cleaned ${totalFiles} files`);
