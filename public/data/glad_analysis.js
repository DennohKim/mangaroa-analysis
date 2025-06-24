const fs = require('fs');

// Read and parse the GLAD CSV data
const csvData = fs.readFileSync('glad_forest_cover_loss_gain.csv', 'utf8');
const lines = csvData.split('\n').slice(1).filter(line => line.trim());

const data = lines.map(line => {
  const [x, y, datamask, gain, lossyear, treecover2000] = line.split(',').map(Number);
  return { x, y, datamask, gain, lossyear, treecover2000 };
});

// Create binary masks
const analysis = {
  totalPixels: data.length,
  validDataMask: data.filter(d => d.datamask === 1).length,
  noDataMask: data.filter(d => d.datamask === 255).length,
  
  // Forest cover binary variations
  hasAnyTreeCover: data.filter(d => d.treecover2000 > 0).length,
  lowTreeCover: data.filter(d => d.treecover2000 > 0 && d.treecover2000 < 30).length,
  mediumTreeCover: data.filter(d => d.treecover2000 >= 30 && d.treecover2000 < 70).length,
  highTreeCover: data.filter(d => d.treecover2000 >= 70).length,
  
  // Change detection binary
  hasForestGain: data.filter(d => d.gain === 1).length,
  hasForestLoss: data.filter(d => d.lossyear > 0).length,
  hasAnyChange: data.filter(d => d.gain === 1 || d.lossyear > 0).length,
  
  // Combined binary masks
  validForestPixels: data.filter(d => d.datamask === 1 && d.treecover2000 > 0).length,
  stableForestPixels: data.filter(d => d.datamask === 1 && d.treecover2000 >= 30 && d.gain === 0 && d.lossyear === 0).length,
};

console.log('GLAD Binary Mask Analysis:');
console.log('==========================');
console.log(`Total pixels: ${analysis.totalPixels}`);
console.log(`Valid data mask: ${analysis.validDataMask} (${(analysis.validDataMask/analysis.totalPixels*100).toFixed(1)}%)`);
console.log(`No data mask: ${analysis.noDataMask} (${(analysis.noDataMask/analysis.totalPixels*100).toFixed(1)}%)`);
console.log('');
console.log('Tree Cover Binary Masks:');
console.log(`- Any tree cover: ${analysis.hasAnyTreeCover} pixels`);
console.log(`- Low tree cover (1-29%): ${analysis.lowTreeCover} pixels`);
console.log(`- Medium tree cover (30-69%): ${analysis.mediumTreeCover} pixels`);
console.log(`- High tree cover (70%+): ${analysis.highTreeCover} pixels`);
console.log('');
console.log('Change Detection Binary Masks:');
console.log(`- Forest gain detected: ${analysis.hasForestGain} pixels`);
console.log(`- Forest loss detected: ${analysis.hasForestLoss} pixels`);
console.log(`- Any change detected: ${analysis.hasAnyChange} pixels`);
console.log('');
console.log('Combined Binary Masks:');
console.log(`- Valid forest pixels: ${analysis.validForestPixels} pixels`);
console.log(`- Stable forest pixels: ${analysis.stableForestPixels} pixels`);

// Show unique combinations
console.log('\nUnique Value Combinations:');
const combinations = {};
data.forEach(d => {
  const key = `${d.datamask}-${d.gain}-${d.lossyear}-${d.treecover2000}`;
  combinations[key] = (combinations[key] || 0) + 1;
});

Object.entries(combinations).forEach(([key, count]) => {
  const [mask, gain, loss, cover] = key.split('-');
  console.log(`[datamask=${mask}, gain=${gain}, loss=${loss}, treecover=${cover}]: ${count} pixels`);
});
