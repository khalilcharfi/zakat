import { CacheManager } from './cacheManager.js';

export class DateConverter {
    constructor() {
        this.cacheManager = new CacheManager(
            'hijriCache',
            24 * 60 * 60 * 1000,
            (data) => new Map(data)
        );
        this.hijriDateCache = this.cacheManager.load(new Map());

        // Add rate limiting properties
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.requestDelay = 1000; // 1 second between requests
    }

    async getHijriDate(gregDate) {
        if (this.hijriDateCache.has(gregDate)) {
            return this.hijriDateCache.get(gregDate);
        }

        // Return a promise that will be resolved when the request is processed
        return new Promise((resolve) => {
            this.requestQueue.push({ gregDate, resolve });
            this.processQueue();
        });
    }

    async processQueue() {
        // If already processing requests, just return
        if (this.isProcessingQueue) return;

        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const { gregDate, resolve } = this.requestQueue.shift();

            // Check cache again in case it was populated by a previous request
            if (this.hijriDateCache.has(gregDate)) {
                resolve(this.hijriDateCache.get(gregDate));
                continue;
            }

            try {
                const [month, year] = gregDate.split('/');
                const response = await fetch(
                    `https://api.aladhan.com/v1/gToH/01-${month.padStart(2, '0')}-${year}`
                );
                const data = await response.json();

                if (data.code === 200) {
                    const hijriDate = data.data.hijri.date.split('-').slice(1).reverse().join('/');
                    this.hijriDateCache.set(gregDate, hijriDate);
                    this.cacheManager.save([...this.hijriDateCache.entries()]);
                    resolve(hijriDate);
                } else {
                    resolve('N/A');
                }
            } catch (error) {
                console.error("Hijri date conversion failed:", error);
                resolve('Error');
            }

            // Wait before processing next request if queue is not empty
            if (this.requestQueue.length > 0) {
                await new Promise(r => setTimeout(r, this.requestDelay));
            }
        }

        this.isProcessingQueue = false;
    }
}