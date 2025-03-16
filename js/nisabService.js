import { CacheManager } from './cacheManager.js';

export class NisabService {
    static API_ENDPOINT = 'https://www.goldapi.io/api/XAU/EUR';
    static MAX_RETRIES = 2;
    static RETRY_DELAY = 1000;

    constructor() {
        this.cacheManager = new CacheManager(
            'nisabCache',
            24 * 60 * 60 * 1000,
            data => data || {}
        );
        this.nisabData = this.cacheManager.load({});
        this.goldApiKey = '';
        this.pendingRequests = new Map();
    }

    setApiKey(apiKey) {
        this.goldApiKey = apiKey;
    }

    setNisabData(data) {
        this.nisabData = data;
        this.cacheManager.save(this.nisabData);
    }

    getNisabData() {
        return this.nisabData;
    }

    async fetchNisabValue(year) {
        if (this.nisabData[year]) return this.nisabData[year];
        if (this.pendingRequests.has(year)) return this.pendingRequests.get(year);

        const request = this.createRequest(year);
        this.pendingRequests.set(year, request);
        
        try {
            return await request;
        } finally {
            this.pendingRequests.delete(year);
        }
    }

    async createRequest(year) {
        for (let attempt = 0; attempt <= NisabService.MAX_RETRIES; attempt++) {
            try {
                this.validateApiKey();
                const response = await fetch(NisabService.API_ENDPOINT, {
                    headers: { 'x-access-token': this.goldApiKey },
                    signal: AbortSignal.timeout(5000)
                });
                return this.handleResponse(year, await response.json());
            } catch (error) {
                if (attempt === NisabService.MAX_RETRIES) throw this.processError(error);
                await new Promise(r => setTimeout(r, NisabService.RETRY_DELAY * (attempt + 1)));
            }
        }
    }

    validateApiKey() {
        if (!this.goldApiKey) throw new Error('No API key provided');
    }

    handleResponse(year, data) {
        if (!data?.price_gram_24k || typeof data.price_gram_24k !== 'number') {
            throw new Error('Invalid API response format');
        }

        const value = data.price_gram_24k * 85;
        this.nisabData[year] = value;
        this.cacheManager.save(this.nisabData);
        return value;
    }

    processError(error) {
        const statusMessages = {
            401: 'Authentication failed: Invalid API key',
            403: 'Permission denied: Insufficient access rights',
            404: 'API endpoint not found'
        };

        return new Error(statusMessages[error.message.match(/\d+/)?.[0]] || 
                       `API request failed: ${error.message}`);
    }
}