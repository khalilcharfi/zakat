import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
const goldDataPath = path.join(dataDir, 'gold-price-data.json');
const outputPath = path.join(dataDir, 'hijri-dates.json');
const failedDatesPath = path.join(dataDir, 'failed-hijri-dates.json');

// API configuration
const API_CONFIG = {
    baseDelay: 1000,       // Base delay between requests (1 second)
    maxRetries: 5,         // Increased maximum number of retries
    backoffFactor: 2,      // Exponential backoff multiplier
    batchSize: 10,         // Number of requests to process before saving
    maxConcurrent: 1       // Maximum concurrent requests (keep at 1 to avoid rate limiting)
};

/**
 * Simple logging utility with levels
 */
const Logger = {
    LEVELS: {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3
    },
    level: 2, // Default to INFO
    
    error: (message, ...args) => {
        if (Logger.level >= Logger.LEVELS.ERROR) 
            console.error(`[ERROR] ${message}`, ...args);
    },
    
    warn: (message, ...args) => {
        if (Logger.level >= Logger.LEVELS.WARN) 
            console.warn(`[WARN] ${message}`, ...args);
    },
    
    info: (message, ...args) => {
        if (Logger.level >= Logger.LEVELS.INFO) 
            console.log(`[INFO] ${message}`, ...args);
    },
    
    debug: (message, ...args) => {
        if (Logger.level >= Logger.LEVELS.DEBUG) 
            console.log(`[DEBUG] ${message}`, ...args);
    }
};

/**
 * Fetch Hijri date from API with enhanced retry mechanism
 * @param {string} formattedDate - Date in DD-MM-YYYY format for API
 * @param {number} retryCount - Current retry attempt
 * @returns {Object} - Hijri date information
 */
async function fetchHijriDate(formattedDate, retryCount = 0) {
    try {
        // Calculate delay with exponential backoff
        const delay = API_CONFIG.baseDelay * Math.pow(API_CONFIG.backoffFactor, retryCount);

        // Wait before making the request
        await new Promise(resolve => setTimeout(resolve, delay));

        const apiUrl = `https://api.aladhan.com/v1/gToH/${formattedDate}`;
        Logger.debug(`Requesting: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Zakat-Calculator/1.0'
            },
            timeout: 10000 // 10 second timeout
        });

        if (response.status === 429) {
            // Handle rate limiting
            const retryAfter = parseInt(response.headers.get('retry-after')) * 1000 || delay * 2;
            Logger.warn(`Rate limit hit. Waiting for ${retryAfter}ms before retry.`);

            if (retryCount < API_CONFIG.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryAfter));
                return fetchHijriDate(formattedDate, retryCount + 1);
            } else {
                throw new Error('Maximum retry attempts reached due to rate limiting');
            }
        }

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        if (data.code === 200 && data.data) {
            return {
                gregorianDate: formattedDate,
                hijri: data.data.hijri,
                gregorian: data.data.gregorian
            };
        } else {
            throw new Error(`API returned error: ${data.status || 'Unknown error'}`);
        }
    } catch (error) {
        if (retryCount < API_CONFIG.maxRetries) {
            Logger.warn(`Error fetching Hijri date: ${error.message}. Retrying (${retryCount + 1}/${API_CONFIG.maxRetries})...`);
            const retryDelay = API_CONFIG.baseDelay * Math.pow(API_CONFIG.backoffFactor, retryCount + 1);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return fetchHijriDate(formattedDate, retryCount + 1);
        }

        throw error;
    }
}

/**
 * Save data to a file with error handling
 * @param {string} filePath - Path to save the file
 * @param {Object} data - Data to save
 * @returns {Promise<boolean>} - Success status
 */
async function saveToFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        Logger.error(`Failed to save to ${filePath}:`, error.message);
        return false;
    }
}

/**
 * Process gold price data and fetch corresponding Hijri dates
 * Output is formatted with dates as keys in a JSON object
 */
async function processGoldPricesAndFetchHijriDates() {
    try {
        Logger.info('Reading gold price data...');

        // Ensure data directory exists
        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true });
            Logger.info(`Created data directory at: ${dataDir}`);
        }

        // Check if the gold data file exists
        if (!existsSync(goldDataPath)) {
            Logger.error(`Gold price data file not found at: ${goldDataPath}`);
            Logger.info('Please ensure the gold price data file exists before running this script.');
            return;
        }

        // Read and parse the gold price data
        const goldDataRaw = await fs.readFile(goldDataPath, 'utf8');
        const goldPrices = JSON.parse(goldDataRaw);

        Logger.info(`Found ${goldPrices.length} gold price records.`);

        // Extract unique dates and sort them chronologically
        let uniqueDates = [...new Set(goldPrices.map(record => record.date))];
        uniqueDates.sort((a, b) => new Date(a) - new Date(b));
        Logger.info(`Found ${uniqueDates.length} unique dates in gold price data.`);

        // Extend date range to current date
        const lastDate = uniqueDates.length > 0 ? new Date(uniqueDates[uniqueDates.length - 1]) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to beginning of day
        
        if (!lastDate || lastDate < today) {
            Logger.info('Extending date range to current date...');
            const additionalDates = generateDateRange(
                lastDate ? new Date(lastDate.getTime() + 24*60*60*1000) : new Date(2015, 0, 1), // Start from day after last date or Jan 1, 2015
                today
            );
            
            if (additionalDates.length > 0) {
                Logger.info(`Adding ${additionalDates.length} additional dates to reach current date.`);
                uniqueDates = [...uniqueDates, ...additionalDates];
                // Re-sort the dates
                uniqueDates.sort((a, b) => new Date(a) - new Date(b));
            }
        }
        
        Logger.info(`Processing ${uniqueDates.length} unique dates in total.`);

        // Initialize results object
        const results = {};
        let successCount = 0;
        let failedDates = {};

        // Load existing results if available
        if (existsSync(outputPath)) {
            try {
                const existingData = await fs.readFile(outputPath, 'utf8');
                Object.assign(results, JSON.parse(existingData));
                Logger.info(`Loaded ${Object.keys(results).length} existing records from output file.`);
            } catch (error) {
                Logger.warn("Could not load existing results:", error.message);
            }
        }

        // Load failed dates if available
        if (existsSync(failedDatesPath)) {
            try {
                const failedData = await fs.readFile(failedDatesPath, 'utf8');
                failedDates = JSON.parse(failedData);
                Logger.info(`Loaded ${Object.keys(failedDates).length} previously failed dates.`);
            } catch (error) {
                Logger.warn("Could not load failed dates:", error.message);
            }
        }

        // Check for gaps in the date sequence and add missing dates (always enabled)
        if (uniqueDates.length > 1) {
            const missingDates = findMissingDates(uniqueDates);
            if (missingDates.length > 0) {
                Logger.info(`Found ${missingDates.length} missing dates in the sequence.`);
                
                // Add missing dates to uniqueDates if they're not already in results
                const newDates = missingDates.filter(date => !results[date]);
                if (newDates.length > 0) {
                    Logger.info(`Adding ${newDates.length} new dates to be processed.`);
                    uniqueDates = [...uniqueDates, ...newDates];
                    // Re-sort the dates
                    uniqueDates.sort((a, b) => new Date(a) - new Date(b));
                }
            } else {
                Logger.info('No gaps found in the date sequence.');
            }
        }

        // Format dates for API and fetch Hijri information
        for (let i = 0; i < uniqueDates.length; i++) {
            const date = uniqueDates[i];

            // Skip if we already have this date
            if (results[date]) {
                Logger.debug(`Skipping ${date} - already processed`);
                successCount++;
                continue;
            }

            // Check if this date previously failed too many times
            if (failedDates[date] && failedDates[date].attempts >= 3) {
                Logger.warn(`Skipping ${date} - failed too many times previously`);
                continue;
            }

            const [year, month, day] = date.split('-');

            // Format date as DD-MM-YYYY for API
            const formattedDate = `${day}-${month}-${year}`;

            try {
                Logger.info(`Processing ${i+1}/${uniqueDates.length}: ${date} (${formattedDate})`);
                const hijriData = await fetchHijriDate(formattedDate);

                // Store result with original date as key - updated to include all API data
                results[date] = {
                    originalDate: date,
                    apiDate: formattedDate,
                    hijriDay: hijriData.hijri.day,
                    hijriMonth: {
                        number: parseInt(hijriData.hijri.month.number),
                        en: hijriData.hijri.month.en,
                        ar: hijriData.hijri.month.ar,
                        days: hijriData.hijri.month.days || 0
                    },
                    hijriYear: hijriData.hijri.year,
                    hijriFormat: hijriData.hijri.date,
                    weekday: {
                        en: hijriData.hijri.weekday.en,
                        ar: hijriData.hijri.weekday.ar || ""
                    },
                    holidays: hijriData.hijri.holidays || [],
                    designation: hijriData.hijri.designation || {},
                    gregorian: {
                        date: hijriData.gregorian.date,
                        weekday: hijriData.gregorian.weekday.en,
                        month: {
                            number: hijriData.gregorian.month.number,
                            en: hijriData.gregorian.month.en
                        },
                        year: hijriData.gregorian.year,
                        designation: hijriData.gregorian.designation || {}
                    }
                };

                // Remove from failed dates if it was there
                if (failedDates[date]) {
                    delete failedDates[date];
                }

                successCount++;

                // Save progress periodically
                if (i % API_CONFIG.batchSize === 0 || i === uniqueDates.length - 1) {
                    // Save results in chronological order
                    const orderedResults = reorderResultsByDate(results);
                    await saveToFile(outputPath, orderedResults);
                    
                    if (Object.keys(failedDates).length > 0) {
                        await saveToFile(failedDatesPath, failedDates);
                    }
                    Logger.info(`Progress saved: ${Object.keys(results).length}/${uniqueDates.length} dates processed`);
                }

            } catch (error) {
                Logger.error(`Failed to process date ${date}:`, error.message);
                
                // Track failed dates
                failedDates[date] = {
                    date,
                    formattedDate,
                    error: error.message,
                    attempts: (failedDates[date]?.attempts || 0) + 1,
                    lastAttempt: new Date().toISOString()
                };
                
                // Save failed dates immediately
                await saveToFile(failedDatesPath, failedDates);
            }
        }

        // Final save with ordered results
        const orderedResults = reorderResultsByDate(results);
        await saveToFile(outputPath, orderedResults);
        
        if (Object.keys(failedDates).length > 0) {
            await saveToFile(failedDatesPath, failedDates);
        }
        
        Logger.info(`\nProcessing complete!`);
        Logger.info(`Successfully processed: ${successCount}/${uniqueDates.length} dates`);
        Logger.info(`Failed dates: ${Object.keys(failedDates).length}`);
        Logger.info(`Results saved to: ${outputPath}`);
        if (Object.keys(failedDates).length > 0) {
            Logger.info(`Failed dates saved to: ${failedDatesPath}`);
        }

    } catch (error) {
        Logger.error("Error processing gold price data:", error);
    }
}

/**
 * Generate a range of dates between start and end dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array<string>} - Array of dates in YYYY-MM-DD format
 */
function generateDateRange(startDate, endDate) {
    const dates = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        
        dates.push(`${year}-${month}-${day}`);
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
}

/**
 * Find missing dates in a sequence of dates
 * @param {Array<string>} dates - Array of dates in YYYY-MM-DD format
 * @returns {Array<string>} - Array of missing dates
 */
function findMissingDates(dates) {
    if (dates.length <= 1) return [];
    
    const missingDates = [];
    
    for (let i = 0; i < dates.length - 1; i++) {
        const currentDate = new Date(dates[i]);
        const nextDate = new Date(dates[i + 1]);
        
        // Calculate the difference in days
        const diffTime = Math.abs(nextDate - currentDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // If there's a gap of more than 1 day
        if (diffDays > 1) {
            // Add the missing dates
            for (let j = 1; j < diffDays; j++) {
                const missingDate = new Date(currentDate);
                missingDate.setDate(missingDate.getDate() + j);
                
                // Format as YYYY-MM-DD
                const year = missingDate.getFullYear();
                const month = String(missingDate.getMonth() + 1).padStart(2, '0');
                const day = String(missingDate.getDate()).padStart(2, '0');
                
                missingDates.push(`${year}-${month}-${day}`);
            }
        }
    }
    
    return missingDates;
}

/**
 * Reorder results object by date
 * @param {Object} results - Results object with dates as keys
 * @returns {Object} - Ordered results object
 */
function reorderResultsByDate(results) {
    const orderedResults = {};
    
    // Get all dates and sort them
    const dates = Object.keys(results).sort((a, b) => new Date(a) - new Date(b));
    
    // Rebuild the object in order
    for (const date of dates) {
        orderedResults[date] = results[date];
    }
    
    return orderedResults;
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--debug')) {
    Logger.level = Logger.LEVELS.DEBUG;
    Logger.debug('Debug mode enabled');
}

// Always retry failed dates by default
const shouldRetryFailed = !args.includes('--no-retry');
if (shouldRetryFailed) {
    Logger.info('Will retry previously failed dates');
}

// Execute the script
processGoldPricesAndFetchHijriDates();