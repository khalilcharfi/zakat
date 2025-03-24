import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
const goldDataPath = path.join(dataDir, 'gold-price-data.json');
const outputPath = path.join(dataDir, 'gold-price-data-new.json');

// Main conversion function
async function convertGoldDataFormat() {
  try {
    console.log('Reading gold price data...');
    const data = JSON.parse(fs.readFileSync(goldDataPath, 'utf8'));
    
    if (!Array.isArray(data)) {
      console.log('Data is already in object format. No conversion needed.');
      return;
    }
    
    console.log(`Converting ${data.length} gold price records to new format...`);
    
    // Convert array to object with date as key
    const convertedData = {};
    
    for (const item of data) {
      if (item.date) {
        convertedData[item.date] = item;
      }
    }
    
    // Write the converted data to a new file
    fs.writeFileSync(
      outputPath, 
      JSON.stringify(convertedData, null, 2)
    );
    
    console.log(`Conversion complete! New format saved to ${outputPath}`);
    console.log(`Original entries: ${data.length}, Converted entries: ${Object.keys(convertedData).length}`);
    
    // Optional: Backup the original file and replace it
    const backupPath = path.join(dataDir, 'gold-price-data-backup.json');
    fs.copyFileSync(goldDataPath, backupPath);
    fs.copyFileSync(outputPath, goldDataPath);
    console.log(`Original data backed up to ${backupPath}`);
    console.log(`Original file replaced with new format`);
    
  } catch (error) {
    console.error('Error converting gold price data:', error);
  }
}

// Run the conversion
convertGoldDataFormat();