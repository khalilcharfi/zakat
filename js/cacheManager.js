export class CacheManager {
  constructor(cacheKey, ttl, parseFunction) {
    this.cacheKey = cacheKey;
    this.ttl = ttl;
    this.parseFunction = parseFunction;
  }

  load(defaultValue) {
    const storedData = localStorage.getItem(this.cacheKey);
    if (storedData) {
      try {
        const { data, timestamp } = JSON.parse(storedData);
        if (Date.now() - timestamp < this.ttl) {
          return this.parseFunction(data);
        }
      } catch (e) {
        console.error('Cache parse error:', e);
      }
    }
    return defaultValue;
  }

  save(data) {
    const cacheData = {
      data: data,
      timestamp: Date.now()
    };
    localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
  }
}