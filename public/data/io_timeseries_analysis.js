const fs = require('fs');

// Read and parse the IO classification CSV data
const csvData = fs.readFileSync('io-9-class-10m.csv', 'utf8');
const lines = csvData.split('\n').slice(1).filter(line => line.trim());

const data = lines.map(line => {
  const [x, y, class_2017, class_2018, class_2019, class_2020, class_2021, class_2022, class_2023] = line.split(',').map(Number);
  return { x, y, class_2017, class_2018, class_2019, class_2020, class_2021, class_2022, class_2023 };
});

// Only analyze valid data pixels (not 255)
const validData = data.filter(d => d.class_2017 !== 255);

console.log('IO-9 Land Use Classification Time Series Analysis:');
console.log('=================================================');
console.log(`Total pixels: ${data.length}`);
console.log(`Valid data pixels: ${validData.length}`);
console.log(`No data pixels: ${data.length - validData.length}`);
console.log('');

// Check for temporal variation
const years = ['class_2017', 'class_2018', 'class_2019', 'class_2020', 'class_2021', 'class_2022', 'class_2023'];

console.log('Temporal Variation Analysis:');
console.log('---------------------------');

let hasTemporalChange = false;
let changePixels = 0;

validData.forEach(pixel => {
  const classValues = years.map(year => pixel[year]);
  const uniqueClasses = [...new Set(classValues)];
  
  if (uniqueClasses.length > 1) {
    hasTemporalChange = true;
    changePixels++;
  }
});

console.log(`Pixels with temporal change: ${changePixels} out of ${validData.length} (${(changePixels/validData.length*100).toFixed(1)}%)`);
console.log(`Pixels with stable classification: ${validData.length - changePixels} (${((validData.length - changePixels)/validData.length*100).toFixed(1)}%)`);
console.log('');

// Analyze class distribution by year
console.log('Class Distribution by Year:');
console.log('---------------------------');

years.forEach(year => {
  const yearData = validData.map(d => d[year]);
  const classCount = {};
  
  yearData.forEach(cls => {
    classCount[cls] = (classCount[cls] || 0) + 1;
  });
  
  const yearNum = year.split('_')[1];
  console.log(`${yearNum}:`);
  Object.entries(classCount).sort(([a], [b]) => Number(a) - Number(b)).forEach(([cls, count]) => {
    const percentage = (count / validData.length * 100).toFixed(1);
    console.log(`  Class ${cls}: ${count} pixels (${percentage}%)`);
  });
  console.log('');
});

// Check for specific land use transitions
console.log('Land Use Change Examples:');
console.log('-------------------------');

let exampleCount = 0;
validData.forEach((pixel, idx) => {
  const classValues = years.map(year => pixel[year]);
  const uniqueClasses = [...new Set(classValues)];
  
  if (uniqueClasses.length > 1 && exampleCount < 5) {
    console.log(`Pixel ${idx + 1}: ${classValues.join(' → ')}`);
    exampleCount++;
  }
});

if (exampleCount === 0) {
  console.log('No temporal changes detected - all pixels maintain same class across years');
}
