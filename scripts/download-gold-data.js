import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import os from 'os';
import { exec } from 'child_process';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Sample data to use as fallback
const sampleGoldPriceData = [

];

// Helper function for waiting
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to dynamically calculate memory allocation based on available system memory
const getMaxMemory = () => {
  const totalMemory = os.totalmem() / (1024 * 1024); // Convert to MB
  let maxMemory = totalMemory * 0.8; // Use 80% of available memory
  maxMemory = Math.min(maxMemory, 8192); // Cap it at 8GB
  return Math.floor(maxMemory);
};

// Set max memory size dynamically based on available system memory
const maxMemory = getMaxMemory();
console.log(`Setting Node.js memory limit to ${maxMemory} MB`);

// Function to execute the Node.js script with the dynamically calculated memory size
const runScript = async () => {
  let browser;
  try {
    // Launch puppeteer with dynamic memory setting
    const browser = await puppeteer.launch({
      headless: true,
      slowMo: 300,
      args: [
        `--max-old-space-size=${maxMemory}`,
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--window-size=1280,800',
        '--start-maximized',
        '--disable-web-security',
        '--allow-file-access-from-files',
        '--enable-features=NetworkService'
      ],
      defaultViewport: null,
    });

    const page = await browser.newPage();
    
    // Setting user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Emulate browser environment
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
    });

    // Navigate to the target website
    await page.goto('https://www.bullionbypost.eu/gold-price/10-year-gold-price-per-gram/', { waitUntil: 'networkidle2', timeout: 90000 });

    // Cookie consent handling
    try {
      await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 10000 });
      await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
      await wait(2000);
    } catch (e) {
      console.log('No cookie dialog found or already accepted');
    }

    // Wait for page to load
    await wait(10000);

    // Check if the chart container exists
    try {
      await page.waitForSelector('.highcharts-container', { timeout: 15000 });
    } catch (e) {
      console.log('Chart container not found, but continuing...');
    }

    // Check if Highcharts is available
    const highchartsExists = await page.evaluate(() => typeof Highcharts !== 'undefined');
    if (!highchartsExists) {
      await wait(15000);
      await page.evaluate(() => window.scrollBy(0, 300));
      await wait(5000);
    }

    // Extract gold price data
    const goldPriceData = await page.evaluate(() => {
      if (typeof Highcharts === 'undefined' || !Highcharts.charts || !Highcharts.charts.length) {
        return null;
      }

      const chart = Highcharts.charts.find(chart => chart && chart.series && chart.series.length > 0);
      if (!chart || !chart.series || !chart.series[0] || !chart.series[0].data) {
        return null;
      }

      const seriesData = chart.series[0].data;
      return seriesData.map(point => {
        return {
          date: new Date(point.x).toISOString().split('T')[0],
          price: point.y.toFixed(2),
          currency: '€',
        };
      });
    });

    if (goldPriceData && goldPriceData.length > 0) {
      console.log(`Successfully extracted ${goldPriceData.length} gold price data points`);
      saveAsJSON(goldPriceData, path.join(dataDir, 'gold-price-data.json'));
      await wait(3000);
      return goldPriceData;
    } else {
      throw new Error('Failed to extract gold price data');
    }
  } catch (error) {
    console.error('Error fetching gold price data:', error);
    console.log('Using fallback sample data instead');
    saveAsJSON(sampleGoldPriceData, path.join(dataDir, 'gold-price-data.json'));
    await wait(5000);
    return sampleGoldPriceData;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
};

// Function to save data as JSON
function saveAsJSON(data, filePath) {
  try {
    if (!data) data = [];
    const jsonContent = (JSON.stringify(data, null, 2));
    fs.writeFileSync(filePath, jsonContent);
    console.log(`JSON data saved to ${filePath}`);
  } catch (error) {
    console.error('Error saving JSON file:', error);
  }
}

// Run the script and handle completion
runScript()
  .then(data => {
    console.log(`Script completed successfully with ${data.length} data points`);
    console.log('Latest gold price:', data[data.length - 1]);
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed with error:', error);
    process.exit(1);
  });