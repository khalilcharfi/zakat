import { CacheManager } from './cacheManager.js';

export class DateConverter {
    static API_ENDPOINT = 'https://api.aladhan.com/v1/gToH';
    static MAX_RETRIES = 2;

    constructor() {
        this.cacheManager = new CacheManager(
            'hijriCache',
            24 * 60 * 60 * 1000,
            (data) => new Map(data)
        );
        this.hijriDateCache = this.cacheManager.load(new Map());
        this.pendingRequests = new Set();
        
        this.requestQueue = [];
        this.isProcessing = false;
    }

    async getHijriDate(gregDate) {
        if (this.hijriDateCache.has(gregDate)) {
            return this.hijriDateCache.get(gregDate);
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
            const request = this.requestQueue.shift();
            
            try {
                const result = await this.fetchWithRetry(request.gregDate, request.retries);
                request.resolve(result);
            } catch (error) {
                if (request.retries < DateConverter.MAX_RETRIES) {
                    const retryDelay = 1000 * Math.pow(2, request.retries);
                    await new Promise(r => setTimeout(r, retryDelay));
                    request.retries++;
                    this.requestQueue.unshift(request);
                } else {
                    request.resolve('N/A');
                    this.pendingRequests.delete(request.gregDate);
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

            if (!response.ok) throw new Error('API request failed');
            
            const data = await response.json();
            return this.handleApiResponse(gregDate, data);
        } catch (error) {
            if (retryCount < DateConverter.MAX_RETRIES) throw error;
            return 'N/A';
        }
    }

    handleApiResponse(gregDate, data) {
        if (data.code === 200) {
            const hijriDate = data.data.hijri.date
                .split('-').slice(1).reverse().join('/');
            
            this.hijriDateCache.set(gregDate, hijriDate);
            this.cacheManager.save([...this.hijriDateCache.entries()]);
            this.pendingRequests.delete(gregDate);
            return hijriDate;
        }
        throw new Error('Invalid API response');
    }
}