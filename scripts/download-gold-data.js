// download-gold-data.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const outputPath = path.join(dataDir, 'gold-prices.json');

async function downloadGoldData() {
  console.log('Downloading gold price data from DataHub...');
  
  try {
    const response = await fetch('https://datahub.io/core/gold-prices/_r/-/data/monthly.csv');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
    }
    
    const csvText = await response.text();
    const goldData = parseCSV(csvText);
    const nisabData = calculateNisabValues(goldData);
    
    // Save the data
    fs.writeFileSync(outputPath, JSON.stringify(nisabData, null, 2));
    
    console.log(`✅ Gold price data downloaded and converted to JSON at: ${outputPath}`);
  } catch (error) {
    console.error('❌ Error downloading gold data:', error.message);
    // Create a fallback file if download fails
    if (!fs.existsSync(outputPath)) {
      const fallbackData = {
        "2022": 4810,
        "2023": 5423.76
      };
      fs.writeFileSync(outputPath, JSON.stringify(fallbackData, null, 2));
      console.log('⚠️ Created fallback gold price data');
    }
  }
}

function parseCSV(csvText) {
  // Split by lines and remove empty lines
  const lines = csvText.split('\n').filter(line => line.trim());
  
  // Extract headers
  const headers = lines[0].split(',').map(header => header.trim());
  
  // Parse data rows
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(value => value.trim());
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        // Convert numeric values
        if (header === 'Price') {
          row[header] = parseFloat(values[index]);
        } else {
          row[header] = values[index];
        }
      });
      data.push(row);
    }
  }
  
  return data;
}

function calculateNisabValues(goldData, goldGrams = 85) {
  const nisabData = {};
  
  // Process each gold price entry
  goldData.forEach(entry => {
    if (entry.Date && entry.Price) {
      // Extract year from date (format: YYYY-MM-DD)
      const year = entry.Date.split('-')[0];
      
      // Convert price from USD/oz to EUR/g (approximate conversion)
      // 1 troy oz = 31.1034768 grams
      // Using a rough USD to EUR conversion of 0.92
      const pricePerGram = (entry.Price / 31.1034768) * 0.92;
      
      // Calculate nisab value (85g of gold)
      const nisabValue = pricePerGram * goldGrams;
      
      // Store the nisab value for this year
      // If multiple entries for the same year, use the most recent one
      nisabData[year] = Math.round(nisabValue * 100) / 100; // Round to 2 decimal places
    }
  });
  
  return nisabData;
}

// Execute the download
downloadGoldData();