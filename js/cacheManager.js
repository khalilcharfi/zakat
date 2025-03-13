export class CacheManager {
    constructor(cacheKey, ttl, parseFunction) {
        this.cacheKey = cacheKey;
        this.ttl = ttl;
        this.parseFunction = parseFunction || (data => data);
    }

    load(defaultValue) {
        try {
            const storedData = localStorage.getItem(this.cacheKey);
            if (!storedData) return defaultValue;

            const { data, timestamp } = JSON.parse(storedData);
            return (Date.now() - timestamp < this.ttl)
                ? this.parseFunction(data)
                : defaultValue;
        } catch (e) {
            console.error('Cache load error:', e);
            return defaultValue;
        }
    }

    save(data) {
        try {
            localStorage.setItem(
                this.cacheKey,
                JSON.stringify({
                    data,
                    timestamp: Date.now()
                })
            );
            return true;
        } catch (e) {
            console.error('Cache save error:', e);
            return false;
        }
    }
}