import { CacheManager } from './cacheManager.js';

export class NisabService {
  constructor() {
    this.cacheManager = new CacheManager(
      'nisabCache',
      24 * 60 * 60 * 1000,
      (data) => data
    );
    this.nisabData = this.cacheManager.load({});
    this.goldApiKey = '';
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
      if (this.nisabData[year]) return this.nisabData[year];

      if (!this.goldApiKey) throw new Error('No API key provided');

      const response = await fetch('https://www.goldapi.io/api/XAU/EUR', {
        headers: { 'x-access-token': this.goldApiKey }
      });

      if (!response.ok) throw new Error('Gold API failed');
      const data = await response.json();
      const nisabValue = data.price_gram_24k * 85;

      this.nisabData[year] = nisabValue;
      this.cacheManager.save(this.nisabData);
      return nisabValue;
    } catch (error) {
      console.error("Nisab value fetch error:", error);
      throw error;
    }
  }
}