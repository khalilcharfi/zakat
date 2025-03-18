import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

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

// Function to extract gold price data
async function extractGoldPriceData() {
  console.log('Launching browser to fetch gold price data...');
  
  let browser;
  try {
    // Configure browser to run in headless mode but with full browser features
    browser = await puppeteer.launch({
      headless: true,
      slowMo: 300,
      args: [
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--window-size=1280,800',
        '--start-maximized',
        '--disable-web-security',
        '--allow-file-access-from-files',
        '--enable-features=NetworkService'
      ],
      defaultViewport: null // This will use the window size from args
    });
    
    const page = await browser.newPage();
    
    // Set user agent to mimic a real browser
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Emulate a real browser environment
    await page.evaluateOnNewDocument(() => {
      // Override the 'headless' property to make the page think it's running in a visible browser
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      
      // Add window.chrome property
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
    });
    
    // Navigate to the gold price page
    console.log('Navigating to BullionByPost...');
    await page.goto('https://www.bullionbypost.eu/gold-price/10-year-gold-price-per-gram/', {
      waitUntil: 'networkidle2',
      timeout: 90000 // Increased timeout to 90 seconds
    });
    
    // Accept cookies if needed
    try {
      console.log('Checking for cookie consent dialog...');
      await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 10000 }); // Increased timeout
      await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
      await wait(2000); // Using our custom wait function
    } catch (e) {
      console.log('No cookie dialog found or already accepted');
    }
    
    // Wait for page to fully load with increased timeout
    console.log('Waiting for page to fully load...');
    await wait(10000); // Using our custom wait function
    
    // Wait for specific chart container to be visible
    try {
      console.log('Waiting for chart container to load...');
      await page.waitForSelector('.highcharts-container', { timeout: 15000 });
      console.log('Chart container found');
    } catch (e) {
      console.log('Chart container not found, but continuing...');
    }
    
    // Check if Highcharts is available
    console.log('Checking for Highcharts...');
    const highchartsExists = await page.evaluate(() => {
      return typeof Highcharts !== 'undefined';
    });
    
    if (!highchartsExists) {
      console.log('Highcharts not found on page, waiting longer...');
      await wait(15000); // Using our custom wait function
      
      // Try to manually trigger chart initialization if needed
      await page.evaluate(() => {
        // Scroll to ensure chart is in view
        window.scrollBy(0, 300);
      });
      
      await wait(5000); // Using our custom wait function
    }
    
    // Try to extract data with a more robust approach
    console.log('Attempting to extract gold price data...');
    const goldPriceData = await page.evaluate(() => {
      if (typeof Highcharts === 'undefined' || !Highcharts.charts || !Highcharts.charts.length) {
        return null;
      }
      
      // Find the chart with data
      const chart = Highcharts.charts.find(chart => chart && chart.series && chart.series.length > 0);
      
      if (!chart || !chart.series || !chart.series[0] || !chart.series[0].data) {
        return null;
      }
      
      const seriesData = chart.series[0].data;
      
      return seriesData.map(point => {
        return {
          date: new Date(point.x).toISOString().split('T')[0], // Format as YYYY-MM-DD
          price: point.y.toFixed(2),                          // Price with 2 decimal places
          currency: '€'                                       // Euro currency symbol
        };
      });
    });
    
    if (goldPriceData && goldPriceData.length > 0) {
      console.log(`Successfully extracted ${goldPriceData.length} gold price data points`);
      
      saveAsJSON(goldPriceData, path.join(dataDir, 'gold-price-data.json'));
      
      // Wait a moment before closing so you can see the final state
      await wait(3000); // Using our custom wait function
      
      return goldPriceData;
    } else {
      throw new Error('Failed to extract gold price data from page');
    }
  } catch (error) {
    console.error('Error fetching gold price data:', error);
    console.log('Using fallback sample data instead');
    
    // Use fallback data
    saveAsCSV(sampleGoldPriceData, path.join(dataDir, 'gold-price-data.csv'));
    saveAsJSON(sampleGoldPriceData, path.join(dataDir, 'gold-price-data.json'));
    
    // Wait a moment before closing so you can see the error state
    await wait(5000); // Using our custom wait function
    
    return sampleGoldPriceData;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}


// Function to save data as JSON
function saveAsJSON(data, filePath) {
  try {
    if (!data) {
      data = []; // Ensure we at least save an empty array
    }
    
    const jsonContent = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonContent);
    console.log(`JSON data saved to ${filePath}`);
  } catch (error) {
    console.error('Error saving JSON file:', error);
  }
}

// Run the extraction
extractGoldPriceData();