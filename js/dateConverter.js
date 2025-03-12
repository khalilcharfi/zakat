import { CacheManager } from './cacheManager.js';

export class DateConverter {
  constructor() {
    this.cacheManager = new CacheManager(
      'hijriCache',
      24 * 60 * 60 * 1000,
      (data) => new Map(data)
    );
    this.hijriDateCache = this.cacheManager.load(new Map());
  }

  async getHijriDate(gregDate) {
    if (this.hijriDateCache.has(gregDate)) {
      return this.hijriDateCache.get(gregDate);
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
        return hijriDate;
      }
      return 'N/A';
    } catch (error) {
      console.error("Hijri date conversion failed:", error);
      return 'Error';
    }
  }
}