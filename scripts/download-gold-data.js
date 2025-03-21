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
const goldDataPath = path.join(dataDir, 'gold-price-data.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const goldPriceData = [
];

try {
    const data = JSON.parse(fs.readFileSync(goldDataPath, 'utf8'));

    // Check if data is an array or has a 'data' property (in case it has metadata)
    const goldPrices = Array.isArray(data) ? data : data.data || [];

    if (goldPrices.length > 0) {
        // Get the last record
        const lastRecord = goldPrices[goldPrices.length - 1];
        const lastRecordDate = new Date(lastRecord.date);
        const today = new Date();
        if (lastRecordDate.toDateString() === today.toDateString()) {
            console.log('Gold price data already up-to-date');
            console.log(`Latest gold price for today (${today.toDateString()}):`);
            console.log(`Price: ${lastRecord.price} ${lastRecord.currency}`);
            process.exit(0);
        }
    }
} catch (error) {
}

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

// Sample data to use as fallback
const sampleGoldPriceData = [
];

// Function to execute the Node.js script with the dynamically calculated memory size
const runScript = async () => {
    let browser;
    try {
        // Check if running in GitHub Actions
        const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

        // Launch puppeteer with enhanced settings to bypass Cloudflare
        const launchOptions = {
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
                '--enable-features=NetworkService',
                '--disable-features=IsolateOrigins,site-per-process', // Helps with Cloudflare
                '--disable-blink-features=AutomationControlled', // Hide automation
                '--disable-infobars',
                '--ignore-certificate-errors',
                '--no-first-run',
                '--no-default-browser-check'
            ],
            defaultViewport: null,
            ignoreHTTPSErrors: true, // Ignore HTTPS errors
        };

        // Add special options for GitHub Actions
        if (isGitHubActions) {
            console.log('Running in GitHub Actions environment');
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
        }

        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();

        // Set more realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Set extra HTTP headers to appear more like a real browser
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"'
        });

        // Enhanced browser environment emulation
        await page.evaluateOnNewDocument(() => {
            // Override the 'webdriver' property
            Object.defineProperty(navigator, 'webdriver', { get: () => false });

            // Override the 'plugins' property
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                    { name: 'Native Client', filename: 'internal-nacl-plugin' }
                ]
            });

            // Add language property
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });

            // Add chrome property
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {},
                webstore: {}
            };

            // Add permissions property
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // Add webGL vendor and renderer
            const getParameter = WebGLRenderingContext.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) {
                    return 'Intel Inc.';
                }
                if (parameter === 37446) {
                    return 'Intel Iris OpenGL Engine';
                }
                return getParameter(parameter);
            };
        });

        // Add random mouse movements to appear more human-like
        const addRandomMouseMovements = async () => {
            const width = 1280;
            const height = 800;

            for (let i = 0; i < 5; i++) {
                const x = Math.floor(Math.random() * width);
                const y = Math.floor(Math.random() * height);
                await page.mouse.move(x, y);
                await wait(Math.random() * 1000);
            }
        };

        // Navigate to the target website with enhanced options
        console.log('Navigating to BullionByPost...');
        await page.goto('https://www.bullionbypost.eu/gold-price/10-year-gold-price-per-gram/', {
            waitUntil: 'networkidle2',
            timeout: 120000 // Increased timeout for Cloudflare challenges
        });

        // Simulate human-like behavior
        await addRandomMouseMovements();

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

        // Add metadata to the fallback data
        const fallbackWithMetadata = {
            metadata: {
                source: "Fallback Sample Data",
                retrievedAt: new Date().toISOString(),
                reason: "Failed to fetch live data: " + error.message,
                dataPoints: sampleGoldPriceData.length
            },
            data: sampleGoldPriceData
        };

        saveAsJSON(fallbackWithMetadata, goldDataPath);
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