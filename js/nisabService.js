import { CacheManager } from './cacheManager.js';

export class NisabService {
    static API_ENDPOINT = 'https://www.goldapi.io/api/XAU/EUR';
    static LOCAL_DATA_URL = '../data/gold-price-data.json';
    static GITHUB_DATA_URL = 'https://raw.githubusercontent.com/khalilcharfi/zakat/main/data/gold-price-data.json';
    static MAX_RETRIES = 2;
    static RETRY_DELAY = 1000;

    constructor() {
        this.cacheManager = new CacheManager(
            'nisabCache',
            24 * 60 * 60 * 1000,
            data => data || { fromApi: false, data: {} }
        );
        const cachedData = this.cacheManager.load({ fromApi: false, data: {}});
        this.nisabData = cachedData.data || {};
        this.isFromApi = cachedData.fromApi || false;
        this.goldApiKey = '';
        this.pendingRequests = new Map();
        
        // Load gold price data on initialization
        this.loadGoldPriceData().catch(err => {
            console.warn('Failed to load initial gold price data:', err.message);
        });
    }

    setApiKey(apiKey) {
        this.goldApiKey = apiKey;
    }

    setNisabData(data) {
        this.nisabData = data;
        this.isFromApi = false;
        this.saveCache();
    }

    getNisabData() {
        return {
            fromApi: this.isFromApi,
            data: this.nisabData,
        };
    }

    // Add a new method to load the gold price data
    async loadGoldPriceData() {
        try {
            // Try local first, fallback to GitHub if not found
            let response;
            try {
                response = await fetch(NisabService.LOCAL_DATA_URL);
                if (!response.ok) throw new Error(`Local file error: ${response.status}`);
                console.log('Using local gold price data');
            } catch (localError) {
                console.log('Local gold price data not available, using GitHub data');
                response = await fetch(NisabService.GITHUB_DATA_URL);
                if (!response.ok) {
                    throw new Error(`GitHub data error: ${response.status}`);
                }
            }
            
            const goldPriceData = await response.json();
            
            // Process the gold price data to calculate nisab values
            // Group by year and calculate average price per year
            const yearlyPrices = {};
            const monthlyPrices = {};
            
            // Handle both array and object formats
            const entries = Array.isArray(goldPriceData) 
                ? goldPriceData 
                : Object.values(goldPriceData);
            
            entries.forEach(entry => {
                const dateParts = entry.date.split('-');
                const year = dateParts[0];
                const month = dateParts[1];
                const price = parseFloat(entry.price);
                
                // For yearly averages
                if (!yearlyPrices[year]) {
                    yearlyPrices[year] = { sum: 0, count: 0 };
                }
                yearlyPrices[year].sum += price;
                yearlyPrices[year].count++;
                
                // For monthly averages
                const yearMonth = `${year}-${month}`;
                if (!monthlyPrices[yearMonth]) {
                    monthlyPrices[yearMonth] = { sum: 0, count: 0 };
                }
                monthlyPrices[yearMonth].sum += price;
                monthlyPrices[yearMonth].count++;
            });
            
            // Calculate nisab values (85 grams of gold)
            // For yearly averages
            for (const year in yearlyPrices) {
                const averagePrice = yearlyPrices[year].sum / yearlyPrices[year].count;
                const nisabValue = averagePrice * 85; // 85 grams of gold for nisab
                
                // Round to 2 decimal places
                this.nisabData[year] = Math.round(nisabValue * 100) / 100;
            }
            
            // For monthly averages
            for (const yearMonth in monthlyPrices) {
                const averagePrice = monthlyPrices[yearMonth].sum / monthlyPrices[yearMonth].count;
                const nisabValue = averagePrice * 85; // 85 grams of gold for nisab
                
                // Round to 2 decimal places
                this.nisabData[yearMonth] = Math.round(nisabValue * 100) / 100;
            }
            
            this.isFromApi = false;
            this.saveCache();
            
            return {
                fromApi: this.isFromApi,
                data: this.nisabData,
            };
        } catch (error) {
            console.error('Error loading gold price data:', error);
            return {
                fromApi: this.isFromApi,
                data: this.nisabData,
            };
        }
    }

    async fetchNisabValue(year) {    
        if (this.pendingRequests.has(year)) {return this.pendingRequests.get(year)};

        // Check for cached data first if no API key
        if (!this.goldApiKey) {
            if (this.nisabData[year]) {
                this.isFromApi = false;
                return this.nisabData[year];
            }
            throw new Error('API key required to fetch nisab value');
        }

        const request = this.createRequest(year);
        this.pendingRequests.set(year, request);
        
        try {
            return await request;
        } finally {
            this.pendingRequests.delete(year);
        }
    }

    async createRequest(year) {
        // Track if we've already shown the CORS warning
        if (!this.corsWarningShown) {
            console.warn("API access may be limited due to browser CORS restrictions. Using cached data when available.");
            this.corsWarningShown = true;
        }
        
        for (let attempt = 0; attempt <= NisabService.MAX_RETRIES; attempt++) {
            try {
                this.validateApiKey();
                
                // Try direct API call first - this will work in non-browser environments
                // or if the API enables CORS in the future
                try {
                    const response = await fetch(NisabService.API_ENDPOINT, {
                        headers: { 'x-access-token': this.goldApiKey },
                        signal: AbortSignal.timeout(5000)
                    });
                    
                    // Handle rate limiting (429 status)
                    if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After') || 60;
                        console.log(`Rate limited. Retrying after ${retryAfter} seconds.`);
                        await new Promise(r => setTimeout(r, retryAfter * 1000));
                        continue;
                    }
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error ${response.status}`);
                    }
                    
                    const responseData = await response.json();
                    
                    if (responseData.error && responseData.error.includes("Monthly API quota exceeded")) {
                        throw new Error("Monthly API quota exceeded");
                    }
                    
                    this.isFromApi = true;
                    return this.handleResponse(year, responseData);
                } catch (directError) {
                    // If we have cached data, use it immediately without trying proxies
                    if (this.nisabData[year]) {
                        this.isFromApi = false;
                        return this.nisabData[year];
                    }
                    
                    // If no cached data, throw the error to be handled below
                    throw directError;
                }
                
            } catch (error) {
                // Check if this is a quota exceeded error
                if (error.message.includes("Monthly API quota exceeded")) {
                    if (!this.quotaExceededWarningShown) {
                        console.error("Monthly API quota exceeded. Please upgrade your plan.");
                        this.quotaExceededWarningShown = true;
                    }
                    
                    // Use cached data if available
                    if (this.nisabData[year]) {
                        this.isFromApi = false;
                        return this.nisabData[year];
                    }
                    
                    // Otherwise, propagate the quota error
                    throw this.processError(error);
                }
                
                // For all other errors, try to use cached data
                if (this.nisabData[year]) {
                    this.isFromApi = false;
                    return this.nisabData[year];
                }
                
                // Only log the error on the final attempt to avoid console spam
                if (attempt === NisabService.MAX_RETRIES) {
                    console.error("Failed to fetch nisab value:", error.message);
                    throw this.processError(error);
                }
                
                // Exponential backoff for retries
                const delay = NisabService.RETRY_DELAY * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    validateApiKey() {
        if (!this.goldApiKey) {
            throw new Error('No API key provided')
        };
    }

    handleResponse(year, data) {
        if (!data?.price_gram_24k || typeof data.price_gram_24k !== 'number') {
            throw new Error('Invalid API response format');
        }

        const value = data.price_gram_24k * 85;
        this.nisabData[year] = value;
        this.isFromApi = true;
        this.saveCache();
        return value;
    }

    async fetchNisabValueForYearMonth(year, month) {
        const key = `${year}-${month.toString().padStart(2, '0')}`;
        
        if (this.pendingRequests.has(key)) {
            return this.pendingRequests.get(key);
        }

        // Check for cached data first if no API key
        if (!this.goldApiKey) {
            if (this.nisabData[key]) {
                this.isFromApi = false;
                return this.nisabData[key];
            }
            throw new Error('API key required to fetch nisab value');
        }

        const request = this.createRequestForYearMonth(year, month);
        this.pendingRequests.set(key, request);
        
        try {
            return await request;
        } finally {
            this.pendingRequests.delete(key);
        }
    }

    async createRequestForYearMonth(year, month) {
        const key = `${year}-${month.toString().padStart(2, '0')}`;
        
        // Don't show duplicate warnings
        if (!this.corsWarningShown) {
            console.warn("API access may be limited due to browser CORS restrictions. Using cached data when available.");
            this.corsWarningShown = true;
        }
        
        for (let attempt = 0; attempt <= NisabService.MAX_RETRIES; attempt++) {
            try {
                this.validateApiKey();
                
                // Try direct API call first
                try {
                    const response = await fetch(NisabService.API_ENDPOINT, {
                        headers: { 'x-access-token': this.goldApiKey },
                        signal: AbortSignal.timeout(5000)
                    });
                    
                    // Handle rate limiting (429 status)
                    if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After') || 60;
                        console.log(`Rate limited. Retrying after ${retryAfter} seconds.`);
                        await new Promise(r => setTimeout(r, retryAfter * 1000));
                        continue;
                    }
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error ${response.status}`);
                    }
                    
                    const responseData = await response.json();
                    
                    if (responseData.error && responseData.error.includes("Monthly API quota exceeded")) {
                        throw new Error("Monthly API quota exceeded");
                    }
                    
                    this.isFromApi = true;
                    return this.handleResponseForYearMonth(key, responseData);
                } catch (directError) {
                    // If we have cached data, use it immediately without trying proxies
                    if (this.nisabData[key]) {
                        this.isFromApi = false;
                        return this.nisabData[key];
                    }
                    
                    // If no cached data, throw the error to be handled below
                    throw directError;
                }
                
            } catch (error) {
                // Check if this is a quota exceeded error
                if (error.message.includes("Monthly API quota exceeded")) {
                    if (!this.quotaExceededWarningShown) {
                        console.error("Monthly API quota exceeded. Please upgrade your plan.");
                        this.quotaExceededWarningShown = true;
                    }
                    
                    // Use cached data if available
                    if (this.nisabData[key]) {
                        this.isFromApi = false;
                        return this.nisabData[key];
                    }
                    
                    // Otherwise, propagate the quota error
                    throw this.processError(error);
                }
                
                // For all other errors, try to use cached data
                if (this.nisabData[key]) {
                    this.isFromApi = false;
                    return this.nisabData[key];
                }
                
                // Only log the error on the final attempt to avoid console spam
                if (attempt === NisabService.MAX_RETRIES) {
                    console.error("Failed to fetch nisab value:", error.message);
                    throw this.processError(error);
                }
                
                // Exponential backoff for retries
                const delay = NisabService.RETRY_DELAY * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    handleResponseForYearMonth(key, data) {
        if (!data?.price_gram_24k || typeof data.price_gram_24k !== 'number') {
            throw new Error('Invalid API response format');
        }

        const value = data.price_gram_24k * 85;
        this.nisabData[key] = value;
        this.isFromApi = true;
        this.saveCache();
        return value;
    }

    // Helper method to get nisab value for a specific year and month
    getNisabValueForYearMonth(year, month) {
        const key = `${year}-${month.toString().padStart(2, '0')}`;
        return this.nisabData[key] || this.nisabData[year] || null;
    }

    // Helper method to save cache with the new structure
    saveCache() {
        this.cacheManager.save({
            fromApi: this.isFromApi,
            data: this.nisabData,
        });
    }

    processError(error) {
        const statusMessages = {
            401: 'Authentication failed: Invalid API key',
            403: 'Permission denied: Insufficient access rights',
            404: 'API endpoint not found',
            429: 'Rate limit exceeded: Too many requests'
        };

        if (error.message.includes("Monthly API quota exceeded")) {
            return new Error("Monthly API quota exceeded. Add billing details to upgrade to Unlimited requests/month plan.");
        }
        
        if (error.message.includes("CORS") || error.name === "TypeError") {
            return new Error("Browser security (CORS) prevented API access. Try using the application from a different environment or with cached data.");
        }

        return new Error(statusMessages[error.message.match(/\d+/)?.[0]] || 
                       `API request failed: ${error.message}`);
    }

    isDataFromApi() {
        return this.isFromApi;
    }
}