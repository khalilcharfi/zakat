import { CacheManager } from './cacheManager.js';

export class DateConverter {
    static API_ENDPOINT = 'https://api.aladhan.com/v1/gToH';
    static LOCAL_DATA_URL = 'https://raw.githubusercontent.com/khalilcharfi/zakat/refs/heads/main/data/hijri-dates.json';
    static MAX_RETRIES = 4;
    static RATE_LIMIT_DELAY = 600;
    static RATE_LIMIT_WINDOW = 1000;

    constructor() {
        this.cacheManager = new CacheManager(
            'hijriCache',
            24 * 60 * 60 * 1000,
            (data) => new Map(data)
        );
        this.hijriDateCache = this.cacheManager.load(new Map());
        this.failedRequestsCache = new Map(); // Track failed requests
        this.pendingRequests = new Set();

        this.requestQueue = [];
        this.isProcessing = false;
        this.rateLimitedUntil = 0;
        this.localDataLoaded = false;
        this.localData = {};
        
        // Load local data on initialization
        this.loadLocalData();
    }
    
    async loadLocalData() {
        try {
            const response = await fetch(DateConverter.LOCAL_DATA_URL);
            if (response.ok) {
                this.localData = await response.json();
                this.localDataLoaded = true;
                console.log('Loaded Hijri dates from local data source');
            } else {
                console.warn('Failed to load local Hijri dates data');
            }
        } catch (error) {
            console.error('Error loading local Hijri dates:', error);
        }
    }
    
    getDateFromLocalData(gregDate) {
        if (!this.localDataLoaded) return null;
        
        // Convert MM/YYYY to YYYY-MM-DD format for lookup
        const [month, year] = gregDate.split('/');
        
        // Try to find the first day of the month first
        const firstDayKey = `${year}-${month.padStart(2, '0')}-01`;
        
        // If first day isn't available, try to find any day in that month
        if (!this.localData[firstDayKey]) {
            // Look for any entry in that month/year
            const monthYearPrefix = `${year}-${month.padStart(2, '0')}`;
            const matchingKey = Object.keys(this.localData).find(key => 
                key.startsWith(monthYearPrefix)
            );
            
            if (matchingKey) {
                const hijriData = this.localData[matchingKey];
                return `${hijriData.hijriMonth.number}/${hijriData.hijriYear}`;
            }
            
            return null;
        }
        
        // We found the first day of the month
        const hijriData = this.localData[firstDayKey];
        return `${hijriData.hijriMonth.number}/${hijriData.hijriYear}`;
    }

    async getHijriDate(gregDate) {
        // Check successful cache first
        if (this.hijriDateCache.has(gregDate)) {
            return this.hijriDateCache.get(gregDate);
        }
        
        // Check local data source
        const localHijriDate = this.getDateFromLocalData(gregDate);
        if (localHijriDate) {
            // Cache the result
            this.hijriDateCache.set(gregDate, localHijriDate);
            this.cacheManager.save([...this.hijriDateCache.entries()]);
            return localHijriDate;
        }

        if (this.failedRequestsCache.has(gregDate)) {
            const { timestamp } = this.failedRequestsCache.get(gregDate);
            if (Date.now() - timestamp < 300000) {
                return 'N/A';
            }
            this.failedRequestsCache.delete(gregDate);
        }

        if (this.pendingRequests.has(gregDate)) {
            return new Promise(resolve => {
                this.requestQueue.push({ gregDate, resolve, retries: 0 });
            });
        }

        this.pendingRequests.add(gregDate);
        return new Promise(resolve => {
            this.requestQueue.push({ gregDate, resolve, retries: 0 });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.requestQueue.length > 0) {
            // Check rate limit cooldown
            if (Date.now() < this.rateLimitedUntil) {
                const remaining = this.rateLimitedUntil - Date.now();
                await new Promise(r => setTimeout(r, remaining));
                continue;
            }

            const request = this.requestQueue.shift();

            try {
                const result = await this.fetchWithRetry(request.gregDate, request.retries);
                request.resolve(result);
            } catch (error) {
                if (request.retries < DateConverter.MAX_RETRIES) {
                    let delay = 1000 * Math.pow(2, request.retries);

                    // Handle rate limits specifically
                    if (error.message.startsWith('RATE_LIMIT')) {
                        const [, retryAfter] = error.message.split('|');
                        delay = Math.max(Number(retryAfter) * 1000, DateConverter.RATE_LIMIT_DELAY);
                        this.rateLimitedUntil = Date.now() + DateConverter.RATE_LIMIT_WINDOW;
                    }

                    await new Promise(r => setTimeout(r, delay));
                    request.retries++;
                    this.requestQueue.unshift(request);
                } else {
                    // Use moment-hijri as a fallback
                    const hijriDate = moment(request.gregDate, 'MM/YYYY').format('iMM/iYYYY');
                    request.resolve(hijriDate);
                    this.pendingRequests.delete(request.gregDate);
                    // Cache failed request
                    this.failedRequestsCache.set(request.gregDate, {
                        timestamp: Date.now()
                    });
                }
            }
        }

        this.isProcessing = false;
    }

    async fetchWithRetry(gregDate, retryCount = 0) {
        try {
            const [month, year] = gregDate.split('/');
            const params = new URLSearchParams({
                date: `01-${month.padStart(2, '0')}-${year}`
            });

            const response = await fetch(`${DateConverter.API_ENDPOINT}?${params}`, {
                signal: AbortSignal.timeout(5000)
            });

            // Handle rate limit headers
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After') || DateConverter.RATE_LIMIT_DELAY;
                throw new Error(`RATE_LIMIT|${retryAfter}`);
            }

            if (!response.ok) throw new Error('API request failed');

            const data = await response.json();
            return this.handleApiResponse(gregDate, data);
        } catch (error) {
            if (retryCount < DateConverter.MAX_RETRIES) {
                let delay = 1000 * Math.pow(2, retryCount);

                // Handle rate limit delay specifically
                if (error.message.startsWith('RATE_LIMIT')) {
                    const [, retryAfter] = error.message.split('|');
                    delay = Math.max(Number(retryAfter) * 1000, DateConverter.RATE_LIMIT_DELAY);
                }

                await new Promise(r => setTimeout(r, delay));
                return this.fetchWithRetry(gregDate, retryCount + 1);
            }
            // Use moment-hijri as a fallback
            return moment(gregDate, 'MM/YYYY').format('iMM/iYYYY');
        }
    }

    handleApiResponse(gregDate, data) {
        if (data.code === 200) {
            const hijriDate = data.data.hijri.date
                .split('-').slice(1).reverse().join('/');

            this.hijriDateCache.set(gregDate, hijriDate);
            this.cacheManager.save([...this.hijriDateCache.entries()]);
            this.pendingRequests.delete(gregDate);
            // Clear any failed cache entry on success
            this.failedRequestsCache.delete(gregDate);
            return hijriDate;
        }
        throw new Error('Invalid API response');
    }
}