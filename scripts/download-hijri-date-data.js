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
const lockFilePath = path.join(dataDir, '.processing.lock');

// API configuration
const API_CONFIG = {
    baseDelay: 1000,
    maxRetries: 5,
    backoffFactor: 2,
    batchSize: 50,
    maxConcurrent: 5,
    cacheExpiration: 7,
    saveInterval: 30000 // Autosave every 30 seconds
};

// Global state
let isShuttingDown = false;
let currentResults = {};
let currentFailedDates = {};
let lastSaveTime = Date.now();
let autoSaveInterval = null;

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

// In-memory request cache to reduce API calls
const requestCache = new Map();

/**
 * Sets up process signal handlers for graceful shutdown
 */
function setupSignalHandlers() {
    // Handle Ctrl+C and other termination signals
    const signalsToHandle = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signalsToHandle.forEach(signal => {
        process.on(signal, async () => {
            if (isShuttingDown) {
                Logger.warn('Forced exit - data may be lost!');
                process.exit(1);
            }
            
            isShuttingDown = true;
            Logger.info(`\nReceived ${signal} signal. Gracefully shutting down...`);
            Logger.info('Saving current progress before exit...');
            
            try {
                await saveCurrentProgress();
                await releaseLock();
                Logger.info('Shutdown complete. Data saved successfully.');
                process.exit(0);
            } catch (error) {
                Logger.error('Error during shutdown:', error.message);
                process.exit(1);
            }
        });
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
        Logger.error('Uncaught exception:', error);
        
        if (!isShuttingDown) {
            isShuttingDown = true;
            try {
                await saveCurrentProgress();
                await releaseLock();
                Logger.info('Saved progress before crash.');
            } catch (saveError) {
                Logger.error('Failed to save during crash:', saveError.message);
            }
        }
        
        process.exit(1);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
        Logger.error('Unhandled promise rejection:', reason);
        
        if (!isShuttingDown) {
            isShuttingDown = true;
            try {
                await saveCurrentProgress();
                await releaseLock();
                Logger.info('Saved progress before termination.');
            } catch (saveError) {
                Logger.error('Failed to save during termination:', saveError.message);
            }
        }
        
        process.exit(1);
    });
}

/**
 * Sets up an auto-save interval timer
 */
function startAutoSave() {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    
    autoSaveInterval = setInterval(async () => {
        const now = Date.now();
        
        if ((now - lastSaveTime) >= API_CONFIG.saveInterval && !isShuttingDown) {
            try {
                await saveCurrentProgress();
                Logger.info('Auto-saved current progress.');
            } catch (error) {
                Logger.error('Auto-save failed:', error.message);
            }
        }
    }, Math.min(API_CONFIG.saveInterval, 30000)); // Check at least every 30 seconds
}

/**
 * Stops the auto-save interval timer
 */
function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
}

/**
 * Acquire a lock file to prevent multiple instances from running
 * @returns {Promise<boolean>} Whether lock was acquired
 */
async function acquireLock() {
    try {
        // Check if lock file exists
        if (existsSync(lockFilePath)) {
            // Read the lock file to check if it's stale
            const lockData = await fs.readFile(lockFilePath, 'utf8');
            let lockInfo;
            
            try {
                lockInfo = JSON.parse(lockData);
            } catch (e) {
                // If we can't parse the lock file, assume it's corrupt and overwrite it
                Logger.warn('Found corrupt lock file. Overwriting...');
                await createLockFile();
                return true;
            }
            
            const lockTime = new Date(lockInfo.timestamp);
            const now = new Date();
            
            // If the lock is older than 1 hour, consider it stale
            if ((now - lockTime) > 3600000) {
                Logger.warn('Found stale lock file. Overwriting...');
                await createLockFile();
                return true;
            }
            
            return false;
        }
        
        // No lock file exists, create one
        await createLockFile();
        return true;
    } catch (error) {
        Logger.error('Error acquiring lock:', error.message);
        return false;
    }
}

/**
 * Create a lock file with current process info
 */
async function createLockFile() {
    const lockInfo = {
        pid: process.pid,
        timestamp: new Date().toISOString(),
        hostname: require('os').hostname()
    };
    
    await fs.writeFile(lockFilePath, JSON.stringify(lockInfo, null, 2));
}

/**
 * Release the lock file
 */
async function releaseLock() {
    try {
        if (existsSync(lockFilePath)) {
            await fs.unlink(lockFilePath);
            Logger.debug('Lock file released.');
        }
    } catch (error) {
        Logger.error('Error releasing lock:', error.message);
    }
}

/**
 * Save the current progress to disk
 */
async function saveCurrentProgress() {
    lastSaveTime = Date.now();
    
    // Only save if we have data to save
    if (Object.keys(currentResults).length > 0) {
        const orderedResults = reorderResultsByDate(currentResults);
        await saveToFile(outputPath, orderedResults);
    }
    
    if (Object.keys(currentFailedDates).length > 0) {
        await saveToFile(failedDatesPath, currentFailedDates);
    }
}

/**
 * Fetch Hijri date from API with enhanced retry mechanism
 * @param {string} formattedDate - Date in DD-MM-YYYY format for API
 * @param {number} retryCount - Current retry attempt
 * @returns {Object} - Hijri date information
 */
async function fetchHijriDate(formattedDate, retryCount = 0) {
    // Check for shutdown signal
    if (isShuttingDown) {
        throw new Error('Process is shutting down');
    }
    
    // Check cache first
    if (requestCache.has(formattedDate)) {
        Logger.debug(`Cache hit for ${formattedDate}`);
        return requestCache.get(formattedDate);
    }
    
    try {
        // Calculate delay with exponential backoff
        const delay = API_CONFIG.baseDelay * Math.pow(API_CONFIG.backoffFactor, retryCount);

        // Wait before making the request
        await new Promise(resolve => setTimeout(resolve, delay));

        // Check again for shutdown signal after delay
        if (isShuttingDown) {
            throw new Error('Process is shutting down');
        }

        const apiUrl = `https://api.aladhan.com/v1/gToH/${formattedDate}`;
        Logger.debug(`Requesting: ${apiUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Zakat-Calculator/1.0'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

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
            const result = {
                gregorianDate: formattedDate,
                hijri: data.data.hijri,
                gregorian: data.data.gregorian
            };
            
            // Cache the result
            requestCache.set(formattedDate, result);
            
            return result;
        } else {
            throw new Error(`API returned error: ${data.status || 'Unknown error'}`);
        }
    } catch (error) {
        if (isShuttingDown) {
            throw new Error('Process is shutting down');
        }
        
        if (error.name === 'AbortError') {
            Logger.warn(`Request timeout for ${formattedDate}`);
        }
        
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
 * Process a batch of dates concurrently
 * @param {Array<string>} batch - Batch of dates to process
 * @param {Object} results - Results object to update
 * @param {Object} failedDates - Failed dates object to update
 * @returns {Object} - Updated results and failedDates
 */
async function processBatch(batch, results, failedDates) {
    const promises = batch.map(async (date) => {
        // Check for shutdown signal
        if (isShuttingDown) {
            return { date, success: false, error: 'Process is shutting down' };
        }
        
        const [year, month, day] = date.split('-');
        const formattedDate = `${day}-${month}-${year}`;

        try {
            Logger.debug(`Processing date: ${date} (${formattedDate})`);
            const hijriData = await fetchHijriDate(formattedDate);

            // Store result with original date as key
            const result = {
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
            
            return { date, result, success: true };
        } catch (error) {
            if (isShuttingDown) {
                return { date, success: false, error: 'Process is shutting down' };
            }
            
            Logger.error(`Failed to process date ${date}:`, error.message);
            
            // Track failed date
            return { 
                date, 
                success: false, 
                error: error.message,
                attempts: (failedDates[date]?.attempts || 0) + 1
            };
        }
    });

    // Use allSettled to handle all promise results, even if some fail
    const batchResults = await Promise.allSettled(promises);
    
    // Check for shutdown signal before processing results
    if (isShuttingDown) {
        return { results, failedDates };
    }
    
    // Process batch results
    batchResults.forEach(promiseResult => {
        if (promiseResult.status === 'fulfilled') {
            const { date, result, success, error, attempts } = promiseResult.value;
            
            if (success) {
                results[date] = result;
            } else if (!isShuttingDown) { // Don't mark as failed if we're shutting down
                failedDates[date] = {
                    date,
                    error,
                    attempts,
                    lastAttempt: new Date().toISOString()
                };
            }
        }
    });

    return { results, failedDates };
}

/**
 * Save data to a file with error handling and atomic writes
 * @param {string} filePath - Path to save the file
 * @param {Object} data - Data to save
 * @returns {Promise<boolean>} - Success status
 */
async function saveToFile(filePath, data) {
    const tempPath = `${filePath}.tmp`;
    
    try {
        // Create a backup of the current file if it exists
        if (existsSync(filePath)) {
            const backupPath = `${filePath}.bak`;
            await fs.copyFile(filePath, backupPath);
        }
        
        // Write to temporary file first
        await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
        
        // Atomically rename to target file
        await fs.rename(tempPath, filePath);
        return true;
    } catch (error) {
        Logger.error(`Failed to save to ${filePath}:`, error.message);
        
        // Clean up temp file if it exists
        try {
            if (existsSync(tempPath)) {
                await fs.unlink(tempPath);
            }
        } catch (cleanupError) {
            Logger.error(`Failed to clean up temp file:`, cleanupError.message);
        }
        
        return false;
    }
}

/**
 * Process gold price data and fetch corresponding Hijri dates
 * Uses concurrent processing and better caching
 */
async function processGoldPricesAndFetchHijriDates() {
    try {
        // Set up signal handlers for graceful shutdown
        setupSignalHandlers();
        
        // Try to acquire process lock
        const lockAcquired = await acquireLock();
        if (!lockAcquired) {
            Logger.error('Another instance is already running. Exiting.');
            return;
        }
        
        // Start auto-save interval
        startAutoSave();
        
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
            await releaseLock();
            return;
        }

        // Read and parse the gold price data
        const goldDataRaw = await fs.readFile(goldDataPath, 'utf8');
        const goldPrices = JSON.parse(goldDataRaw);

        Logger.info(`Found ${goldPrices.length} gold price records.`);

        // Extract unique dates using Set for better performance
        const uniqueDatesSet = new Set(goldPrices.map(record => record.date));
        let uniqueDates = Array.from(uniqueDatesSet);
        uniqueDates.sort((a, b) => new Date(a) - new Date(b));
        Logger.info(`Found ${uniqueDates.length} unique dates in gold price data.`);

        // Load existing results if available
        currentResults = {};
        if (existsSync(outputPath)) {
            try {
                const existingData = await fs.readFile(outputPath, 'utf8');
                currentResults = JSON.parse(existingData);
                
                // Add existing results to cache to avoid refetching
                Object.entries(currentResults).forEach(([date, data]) => {
                    if (data.hijriFormat) { // Simple check to ensure it has the expected format
                        const [year, month, day] = date.split('-');
                        const formattedDate = `${day}-${month}-${year}`;
                        
                        // Reconstruct cached format
                        requestCache.set(formattedDate, {
                            gregorianDate: formattedDate,
                            hijri: {
                                day: data.hijriDay,
                                month: data.hijriMonth,
                                year: data.hijriYear,
                                date: data.hijriFormat,
                                weekday: data.weekday,
                                holidays: data.holidays || [],
                                designation: data.designation || {}
                            },
                            gregorian: data.gregorian
                        });
                    }
                });
                
                Logger.info(`Loaded ${Object.keys(currentResults).length} existing records from output file.`);
            } catch (error) {
                Logger.warn("Could not load existing results:", error.message);
            }
        }

        // Load failed dates if available
        currentFailedDates = {};
        if (existsSync(failedDatesPath)) {
            try {
                const failedData = await fs.readFile(failedDatesPath, 'utf8');
                currentFailedDates = JSON.parse(failedData);
                
                // Filter out expired failed dates for retry
                const now = new Date();
                const expiredEntries = [];
                
                Object.entries(currentFailedDates).forEach(([date, data]) => {
                    if (data.lastAttempt) {
                        const lastAttempt = new Date(data.lastAttempt);
                        const daysSinceLastAttempt = (now - lastAttempt) / (1000 * 60 * 60 * 24);
                        
                        if (daysSinceLastAttempt > API_CONFIG.cacheExpiration) {
                            expiredEntries.push(date);
                        }
                    }
                });
                
                // Reset attempts for expired entries
                expiredEntries.forEach(date => {
                    currentFailedDates[date].attempts = 0;
                });
                
                Logger.info(`Loaded ${Object.keys(currentFailedDates).length} previously failed dates.`);
            } catch (error) {
                Logger.warn("Could not load failed dates:", error.message);
            }
        }

        // Extend date range to current date
        const lastDate = uniqueDates.length > 0 ? new Date(uniqueDates[uniqueDates.length - 1]) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to beginning of day
        
        if (!lastDate || lastDate < today) {
            Logger.info('Extending date range to current date...');
            const additionalDates = generateDateRange(
                lastDate ? new Date(lastDate.getTime() + 24*60*60*1000) : new Date(2015, 0, 1),
                today
            );
            
            if (additionalDates.length > 0) {
                Logger.info(`Adding ${additionalDates.length} additional dates to reach current date.`);
                uniqueDates = [...uniqueDates, ...additionalDates];
                // Re-sort the dates
                uniqueDates.sort((a, b) => new Date(a) - new Date(b));
            }
        }

        // Check for gaps in the date sequence and add missing dates
        if (uniqueDates.length > 1) {
            const missingDates = findMissingDates(uniqueDates);
            if (missingDates.length > 0) {
                Logger.info(`Found ${missingDates.length} missing dates in the sequence.`);
                
                // Add missing dates to uniqueDates if they're not already in results
                const newDates = missingDates.filter(date => !currentResults[date]);
                if (newDates.length > 0) {
                    Logger.info(`Adding ${newDates.length} new dates to be processed.`);
                    uniqueDates = [...uniqueDates, ...newDates];
                    // Re-sort the dates
                    uniqueDates.sort((a, b) => new Date(a) - new Date(b));
                }
            }
        }
        
        // Filter out dates that are already processed
        const datesToProcess = uniqueDates.filter(date => 
            !currentResults[date] && 
            (!currentFailedDates[date] || currentFailedDates[date].attempts < 3)
        );
        
        Logger.info(`Processing ${datesToProcess.length} out of ${uniqueDates.length} dates.`);
        let successCount = Object.keys(currentResults).length;
        
        // Process dates in batches with concurrency
        for (let i = 0; i < datesToProcess.length && !isShuttingDown; i += API_CONFIG.batchSize) {
            const batch = datesToProcess.slice(i, i + API_CONFIG.batchSize);
            Logger.info(`Processing batch ${Math.floor(i/API_CONFIG.batchSize) + 1}/${Math.ceil(datesToProcess.length/API_CONFIG.batchSize)}: ${batch.length} dates`);
            
            // Split the batch into smaller chunks for concurrent processing
            const chunkSize = Math.min(API_CONFIG.maxConcurrent, batch.length);
            const chunks = [];
            
            for (let j = 0; j < batch.length; j += chunkSize) {
                chunks.push(batch.slice(j, j + chunkSize));
            }
            
            // Process chunks sequentially, but dates within chunks concurrently
            for (const chunk of chunks) {
                if (isShuttingDown) break;
                
                const { results: updatedResults, failedDates: updatedFailedDates } = 
                    await processBatch(chunk, currentResults, currentFailedDates);
                
                // Update tracking objects
                currentResults = updatedResults;
                currentFailedDates = updatedFailedDates;
            }
            
            // Count successes
            successCount = Object.keys(currentResults).length;
            
            // Check for shutdown before saving
            if (isShuttingDown) break;
            
            // Save progress after each batch
            await saveCurrentProgress();
            Logger.info(`Progress saved: ${successCount}/${uniqueDates.length} dates processed successfully`);
        }

        // Final save
        if (!isShuttingDown) {
            const orderedResults = reorderResultsByDate(currentResults);
            await saveToFile(outputPath, orderedResults);
            
            if (Object.keys(currentFailedDates).length > 0) {
                await saveToFile(failedDatesPath, currentFailedDates);
            }
            
            Logger.info(`\nProcessing complete!`);
            Logger.info(`Successfully processed: ${successCount}/${uniqueDates.length} dates`);
            Logger.info(`Failed dates: ${Object.keys(currentFailedDates).length}`);
            Logger.info(`Results saved to: ${outputPath}`);
            if (Object.keys(currentFailedDates).length > 0) {
                Logger.info(`Failed dates saved to: ${failedDatesPath}`);
            }
        }

    } catch (error) {
        Logger.error("Error processing gold price data:", error);
    } finally {
        // Clean up resources
        stopAutoSave();
        await releaseLock();
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
 * Uses an optimized algorithm for better performance
 * @param {Array<string>} dates - Array of dates in YYYY-MM-DD format
 * @returns {Array<string>} - Array of missing dates
 */
function findMissingDates(dates) {
    if (dates.length <= 1) return [];
    
    const missingDates = [];
    const dateSet = new Set(dates);
    
    // Convert first and last date to Date objects
    const firstDate = new Date(dates[0]);
    const lastDate = new Date(dates[dates.length - 1]);
    
    // Check each date between first and last
    const currentDate = new Date(firstDate);
    while (currentDate < lastDate) {
        // Format as YYYY-MM-DD
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        // If date is not in the set, it's missing
        if (!dateSet.has(dateString)) {
            missingDates.push(dateString);
        }
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return missingDates;
}

/**
 * Reorder results object by date
 * @param {Object} results - Results object with dates as keys
 * @returns {Object} - Ordered results object
 */
function reorderResultsByDate(results) {
    return Object.fromEntries(
        Object.entries(results)
            .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB))
    );
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--debug')) {
    Logger.level = Logger.LEVELS.DEBUG;
    Logger.debug('Debug mode enabled');
}

// Execute the script
processGoldPricesAndFetchHijriDates();