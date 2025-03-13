import {CacheManager} from './cacheManager.js';

export class NisabService {
    constructor() {
        this.cacheManager = new CacheManager(
            'nisabCache',
            24 * 60 * 60 * 1000,
            (data) => {
                return data;
            }
        );
        this.nisabData = this.cacheManager.load({});
        this.goldApiKey = '';
        // Track ongoing requests to prevent duplicates
        this.pendingRequests = {};
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
        try {
            // Return cached value if available
            if (this.nisabData[year]) {
                return this.nisabData[year];
            }

            // If there's already a pending request for this year, return that promise
            if (this.pendingRequests[year]) {
                return this.pendingRequests[year];
            }
            if (!this.goldApiKey) {
                throw new Error('No API key provided');
            }

            // Create the request and store its promise
            this.pendingRequests[year] = (async () => {
                try {
                    const response = await fetch('https://www.goldapi.io/api/XAU/EUR', {
                        headers: {'x-access-token': this.goldApiKey}
                    });

                    // Handle specific HTTP status codes
                    if (response.status === 401) {
                        throw new Error('Authentication failed: Invalid API key');
                    } else if (response.status === 403) {
                        throw new Error('Permission denied: Insufficient access rights');
                    } else if (response.status === 404) {
                        throw new Error('API endpoint not found');
                    } else if (!response.ok) {
                        throw new Error(`Gold API failed with status: ${response.status}`);
                    }

                    const data = await response.json();

                    // Validate the received data structure
                    if (!data || typeof data.price_gram_24k !== 'number') {
                        throw new Error('Invalid data format received from API');
                    }

                    const nisabValue = data.price_gram_24k * 85;

                    // Update cache
                    this.nisabData[year] = nisabValue;
                    this.cacheManager.save(this.nisabData);
                    return nisabValue;
                } finally {
                    // Clean up the pending request reference once done
                    delete this.pendingRequests[year];
                }
            })();

            return this.pendingRequests[year];
        } catch (error) {
            console.error("Nisab value fetch error:", error);

            // Rethrow with more context if needed
            if (error.message.includes('API key') ||
                error.message.includes('Authentication') ||
                error.message.includes('Permission')) {
                throw new Error(`API authorization error: ${error.message}`);
            }

            throw error;
        }
    }
}