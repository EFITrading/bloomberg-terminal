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

console.log('Removing overdone "REAL/FAKE" marketing text...\n');

const files = getAllFiles(rootPath);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  
  // Remove "YOUR REAL" marketing text
  content = content.replace(/\/\/ YOUR REAL SWEEP DETECTION:.*\n/g, '// Sweep detection logic\n');
  content = content.replace(/\/\/ YOUR REAL TIER SYSTEM\n/g, '// Tier classification\n');
  content = content.replace(/\/\/ Calculate algo flow analysis using YOUR REAL tier system.*\n/g, '// Calculate algo flow analysis\n');
  content = content.replace(/\/\/ YOUR REAL 8-TIER INSTITUTIONAL SYSTEM\n/g, '// 8-tier classification system\n');
  content = content.replace(/\/\/ Classify trades by YOUR REAL TIER SYSTEM\n/g, '// Classify trades by tier\n');
  content = content.replace(/\/\/ Count by YOUR REAL TIER SYSTEM\n/g, '// Count by tier\n');
  content = content.replace(/\/\/ YOUR REAL TIER SYSTEM counts\n/g, '// Tier counts\n');
  content = content.replace(/{\/\* YOUR REAL 8-TIER INSTITUTIONAL SYSTEM \*\/}/g, '{/* 8-Tier Classification */}');
  content = content.replace(/{\/\* YOUR REAL SWEEP\/BLOCK\/MINI DETECTION \*\/}/g, '{/* Trade Classification */}');
  content = content.replace(/Your Real Classification/g, 'Trade Classification');
  
  // Remove "Loading real market data" - simplify to just "Loading..."
  content = content.replace(/Loading real market data from Polygon API\.\.\./g, 'Loading market data...');
  content = content.replace(/Loading real market data/g, 'Loading data');
  
  // Remove excessive "REAL-TIME" caps
  content = content.replace(/\/\/ Set up REAL-TIME price updates/g, '// Set up live price updates');
  content = content.replace(/Update every 5 seconds for REAL-TIME/g, 'Update every 5 seconds');
  content = content.replace(/REAL-TIME refresh/g, 'Live refresh');
  content = content.replace(/>REAL-TIME</g, '>LIVE<');
  
  // Remove "?? REAL VOLUME DATA FOUND!" console.log
  content = content.replace(/console\.log\('.*REAL VOLUME DATA FOUND!.*'\);\n/g, '');
  
  // Simplify function names - keep 'Real' when it's a legitimate part of naming
  // But remove marketing phrases
  content = content.replace(/\/\/ Fetch real market data from Polygon API using worker-based batching/g, '// Fetch market data');
  content = content.replace(/console\.log\('.*Loading real market data.*'\);\n/g, '');
  
  // Remove "No real market data available" - just say "No data available"
  content = content.replace(/No real market data available/g, 'No data available');
  content = content.replace(/Failed to load real market data/g, 'Failed to load data');
  
  // Remove "REAL OPTIONS TRADES METHOD" headers
  content = content.replace(/\/\/ REAL OPTIONS TRADES METHOD.*\n/g, '// Fetch options trades\n');
  
  // Remove "real-time or latest" redundant comments
  content = content.replace(/\/\/ Try current price first \(real-time or latest\)/g, '// Get current price');
  
  // Remove "requires real API integration" error messages
  content = content.replace(/- requires real options API integration/g, '');
  content = content.replace(/- requires real API integration/g, '');
  content = content.replace(/Data unavailable for.*requires real API integration/g, 'Data unavailable');
  
  // Clean up whitespace
  content = content.replace(/\n\n\n+/g, '\n\n');
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    totalFiles++;
    console.log(`Cleaned: ${path.basename(file)}`);
  }
});

console.log(`\nDone! Cleaned ${totalFiles} files`);
