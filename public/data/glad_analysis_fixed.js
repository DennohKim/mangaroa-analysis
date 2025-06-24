const fs = require('fs');

// Read and parse the GLAD CSV data
const csvData = fs.readFileSync('glad_forest_cover_loss_gain.csv', 'utf8');
const lines = csvData.split('\n').slice(1).filter(line => line.trim());

const data = lines.map(line => {
  const [x, y, datamask, gain, lossyear, treecover2000] = line.split(',').map(Number);
  return { x, y, datamask, gain, lossyear, treecover2000 };
});

console.log('GLAD Binary Mask Analysis (Corrected):');
console.log('=======================================');

// Only analyze valid data pixels (datamask = 1)
const validData = data.filter(d => d.datamask === 1);

console.log(`Total pixels: ${data.length}`);
console.log(`Valid data pixels: ${validData.length} (${(validData.length/data.length*100).toFixed(1)}%)`);
console.log(`No data pixels: ${data.length - validData.length} (${((data.length - validData.length)/data.length*100).toFixed(1)}%)`);
console.log('');

// Analyze valid data only
const analysis = {
  // Tree cover binary variations (only valid pixels)
  hasAnyTreeCover: validData.filter(d => d.treecover2000 > 0).length,
  noTreeCover: validData.filter(d => d.treecover2000 === 0).length,
  lowTreeCover: validData.filter(d => d.treecover2000 > 0 && d.treecover2000 < 30).length,
  mediumTreeCover: validData.filter(d => d.treecover2000 >= 30 && d.treecover2000 < 70).length,
  highTreeCover: validData.filter(d => d.treecover2000 >= 70).length,
  
  // Change detection binary (should all be 0 for your data)
  hasForestGain: validData.filter(d => d.gain === 1).length,
  hasForestLoss: validData.filter(d => d.lossyear > 0).length,
  hasAnyChange: validData.filter(d => d.gain === 1 || d.lossyear > 0).length,
  
  // Combined binary masks
  validForestPixels: validData.filter(d => d.treecover2000 > 0).length,
  stableForestPixels: validData.filter(d => d.treecover2000 >= 30 && d.gain === 0 && d.lossyear === 0).length,
};

console.log('Tree Cover Binary Masks (Valid Data Only):');
console.log(`- No tree cover (0%): ${analysis.noTreeCover} pixels`);
console.log(`- Any tree cover (>0%): ${analysis.hasAnyTreeCover} pixels`);
console.log(`- Low tree cover (1-29%): ${analysis.lowTreeCover} pixels`);
console.log(`- Medium tree cover (30-69%): ${analysis.mediumTreeCover} pixels`);
console.log(`- High tree cover (70%+): ${analysis.highTreeCover} pixels`);
console.log('');

console.log('Change Detection Binary Masks:');
console.log(`- Forest gain detected: ${analysis.hasForestGain} pixels`);
console.log(`- Forest loss detected: ${analysis.hasForestLoss} pixels`);
console.log(`- Any change detected: ${analysis.hasAnyChange} pixels`);
console.log('');

console.log('Summary Binary Classifications:');
console.log(`- Valid forest pixels (>0% cover): ${analysis.validForestPixels} pixels`);
console.log(`- Stable forest pixels (≥30% cover, no change): ${analysis.stableForestPixels} pixels`);
console.log(`- Non-forest pixels (0% cover): ${analysis.noTreeCover} pixels`);

// Show the actual tree cover values
console.log('\nActual Tree Cover Values in Valid Data:');
const treeCoverValues = validData.map(d => d.treecover2000).sort((a,b) => b-a);
const uniqueValues = [...new Set(treeCoverValues)];
uniqueValues.forEach(val => {
  const count = treeCoverValues.filter(v => v === val).length;
  console.log(`- ${val}% tree cover: ${count} pixels`);
});
