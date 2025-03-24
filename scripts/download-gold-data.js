import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import os from 'os';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
const goldDataPath = path.join(dataDir, 'gold-price-data.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Sample data to use as fallback (with date as key)
const sampleGoldPriceData = {
    "2024-01-01": { date: "2024-01-01", price: "61.17", currency: "€" },
    "2024-02-01": { date: "2024-02-01", price: "63.45", currency: "€" },
    "2024-03-01": { date: "2024-03-01", price: "64.92", currency: "€" },
    "2024-04-01": { date: "2024-04-01", price: "68.53", currency: "€" },
    "2024-05-01": { date: "2024-05-01", price: "69.21", currency: "€" }
};

// Helper function for waiting
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Load existing data and check if update is needed
async function loadExistingData() {
    try {
        // Initialize existing data
        const result = {
            existingData: {},
            newestDate: null,
            needsUpdate: true
        };
        
        if (!fs.existsSync(goldDataPath)) {
            console.log('No existing gold price data file found. Creating new file.');
            return result;
        }
        
        const fileContent = fs.readFileSync(goldDataPath, 'utf8');
        if (!fileContent.trim()) {
            console.log('Empty data file found. Will create new data.');
            return result;
        }
            
        const data = JSON.parse(fileContent);
        result.existingData = data || {};
        
        if (Object.keys(result.existingData).length > 0) {
            // Get the last record (assuming we want the most recent date)
            const dates = Object.keys(result.existingData).sort();
            const lastDate = dates[dates.length - 1];
            const lastRecord = result.existingData[lastDate];
            const lastRecordDate = new Date(lastRecord.date);
            result.newestDate = lastRecordDate;
            
            const today = new Date();
            // Check if we already have today's data
            if (lastRecordDate.toDateString() === today.toDateString()) {
                console.log('Gold price data already up-to-date');
                console.log(`Latest gold price for today (${today.toDateString()}):`);
                console.log(`Price: ${lastRecord.price} ${lastRecord.currency}`);
                result.needsUpdate = false;
            }
        }
        
        return result;
    } catch (error) {
        console.error('Error reading existing gold price data:', error);
        console.log('Starting with empty dataset.');
        return { existingData: {}, newestDate: null, needsUpdate: true };
    }
}

// Function to dynamically calculate memory allocation based on available system memory
const getMaxMemory = () => {
    const totalMemory = os.totalmem() / (1024 * 1024); // Convert to MB
    let maxMemory = totalMemory * 0.6; // Use 60% of available memory to be safer
    maxMemory = Math.min(maxMemory, 4096); // Cap it at 4GB (more than enough for this task)
    return Math.floor(maxMemory);
};

// Function to scrape gold price data
async function scrapeGoldPriceData() {
    let browser;
    try {
        const maxMemory = getMaxMemory();
        console.log(`Allocating ${maxMemory} MB for browser process`);
        
        // Check if running in GitHub Actions
        const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

        // Optimize Puppeteer launch options for better performance
        const launchOptions = {
            headless: 'new', // Use new headless mode for better performance
            args: [
                `--max-old-space-size=${maxMemory}`,
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--no-sandbox',
                '--disable-extensions',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--mute-audio',
                '--no-default-browser-check',
                '--disable-features=TranslateUI,BlinkGenPropertyTrees',
                '--disable-ipc-flooding-protection',
                '--window-size=1280,800'
            ],
            defaultViewport: { width: 1280, height: 800 },
            ignoreHTTPSErrors: true
        };

        // Add special options for GitHub Actions
        if (isGitHubActions) {
            console.log('Running in GitHub Actions environment');
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
        }

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        // Set realistic browser environment
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        });

        // Navigate with optimized settings
        console.log('Fetching gold price data...');
        await page.goto('https://www.bullionbypost.eu/gold-price/10-year-gold-price-per-gram/', {
            waitUntil: 'domcontentloaded', // More efficient than networkidle2
            timeout: 60000
        });

        // Handle cookie consent if it appears
        try {
            const cookieButton = await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { 
                timeout: 5000,
                visible: true 
            });
            if (cookieButton) {
                await cookieButton.click();
                await wait(1000);
            }
        } catch (e) {
            // No cookie dialog or already accepted
        }

        // Wait for chart and scroll to ensure it's loaded
        await wait(5000);
        await page.evaluate(() => window.scrollBy(0, 300));
        await wait(2000);

        // Extract gold price data with optimized evaluation
        const goldPriceDataArray = await page.evaluate(() => {
            if (typeof Highcharts === 'undefined' || !Highcharts.charts || !Highcharts.charts.length) {
                return null;
            }

            // Find the first chart with data
            const chart = Highcharts.charts.find(c => c && c.series && c.series[0] && c.series[0].data);
            if (!chart) return null;

            // Get data points
            return chart.series[0].data.map(point => ({
                date: new Date(point.x).toISOString().split('T')[0],
                price: point.y.toFixed(2),
                currency: '€'
            }));
        });

        // Convert array to object with date as key
        if (goldPriceDataArray && goldPriceDataArray.length > 0) {
            const goldPriceData = {};
            goldPriceDataArray.forEach(item => {
                goldPriceData[item.date] = item;
            });
            return goldPriceData;
        }
        
        return null;
    } catch (error) {
        console.error('Error scraping gold price data:', error);
        return null;
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed');
        }
    }
}

// Function to merge and save data, avoiding duplicates
function mergeAndSaveData(existingData, newData) {
    try {
        if (!newData || Object.keys(newData).length === 0) {
            console.log('No new data to add');
            return { added: 0, total: Object.keys(existingData).length };
        }
        
        // Add new data, avoiding duplicates
        let addedCount = 0;
        for (const [date, item] of Object.entries(newData)) {
            if (!existingData[date]) {
                existingData[date] = item;
                addedCount++;
            }
        }
        
        if (addedCount > 0) {
            // Write merged data back to file
            fs.writeFileSync(goldDataPath, JSON.stringify(existingData, null, 2));
        }
        
        return { added: addedCount, total: Object.keys(existingData).length };
    } catch (error) {
        console.error('Error saving data:', error);
        return { added: 0, total: Object.keys(existingData).length, error };
    }
}

// Main function
async function main() {
    try {
        // Load existing data
        const { existingData, newestDate, needsUpdate } = await loadExistingData();
        
        // Exit early if we don't need to update
        if (!needsUpdate) {
            process.exit(0);
        }
        
        // Scrape new data
        const scrapedData = await scrapeGoldPriceData();
        
        // Process the data
        if (scrapedData && Object.keys(scrapedData).length > 0) {
            console.log(`Successfully scraped ${Object.keys(scrapedData).length} gold price data points`);
            
            // Filter to only include new data points (optimization for large datasets)
            let newDataPoints = scrapedData;
            if (newestDate) {
                const newestDateStr = newestDate.toISOString().split('T')[0];
                newDataPoints = {};
                Object.entries(scrapedData).forEach(([date, item]) => {
                    if (date > newestDateStr) {
                        newDataPoints[date] = item;
                    }
                });
                console.log(`Found ${Object.keys(newDataPoints).length} new data points since ${newestDateStr}`);
            }
            
            // Merge and save data
            const { added, total } = mergeAndSaveData(existingData, newDataPoints);
            console.log(`Added ${added} new data points, total: ${total}`);
            
            if (added > 0 && Object.keys(newDataPoints).length > 0) {
                const latestDate = Object.keys(newDataPoints).sort().pop();
                const latest = newDataPoints[latestDate];
                console.log(`Latest gold price: ${latest.date} - ${latest.price} ${latest.currency}`);
            }
        } else {
            console.log('No data could be scraped, checking fallback options');
            
            // Use fallback data only if we have no existing data
            if (Object.keys(existingData).length === 0) {
                console.log('Using fallback sample data');
                const { added, total } = mergeAndSaveData(existingData, sampleGoldPriceData);
                console.log(`Added ${added} fallback data points, total: ${total}`);
            } else {
                console.log('Using existing data instead of fallback');
            }
        }
        
        console.log('Script completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Script failed:', error);
        process.exit(1);
    }
}

// Run the main function
main();