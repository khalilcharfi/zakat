/**
 * Unit tests for the nisabService module.
 * 
 * Since this is an ES module, we're using dynamic imports to test it.
 */

// Mock the CacheManager
jest.mock('../../js/cacheManager.js', () => ({
  CacheManager: jest.fn().mockImplementation(() => ({
    load: jest.fn().mockReturnValue({ fromApi: false, data: {} }),
    save: jest.fn()
  }))
}));

// Mock fetch globally
global.fetch = jest.fn();

// Sample test data for API response
const mockApiResponse = {
  price_gram_24k: 60,  // 60 euros per gram
  price: 1835.50  // Price per ounce
};

describe('NisabService', () => {
  let nisabService;
  
  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Reset the fetch mock
    global.fetch.mockReset();
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockApiResponse)
    });
    
    // Mock console methods to reduce noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Mock AbortSignal.timeout
    AbortSignal.timeout = jest.fn().mockReturnValue({});
    
    // Import the service (dynamically to handle ES modules)
    const NisabServiceModule = await import('../../js/nisabService.js');
    const NisabService = NisabServiceModule.NisabService;
    
    // Create a new instance
    nisabService = new NisabService();
  });
  
  // Test core functionality
  test('initializes with default values', () => {
    const data = nisabService.getNisabData();
    expect(data.data).toEqual({});
    expect(data.fromApi).toBe(false);
  });
  
  test('setApiKey and setNisabData work correctly', () => {
    nisabService.setApiKey('test-api-key');
    expect(nisabService.goldApiKey).toBe('test-api-key');
    
    const testData = { '2023': { '1': 5000 } };
    nisabService.setNisabData(testData);
    expect(nisabService.nisabData).toEqual(testData);
    
    const result = nisabService.getNisabData();
    expect(result.data).toEqual(testData);
    expect(result.fromApi).toBe(false);
  });
  
  // Test data loading
  test('loadGoldPriceData makes appropriate API calls', async () => {
    // Setup mock response
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue([
        { date: '2023-01-01', price: '1800.50' },
        { date: '2023-01-02', price: '1820.75' }
      ])
    });
    
    await nisabService.loadGoldPriceData();
    
    // Should call the correct URL
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('gold-price-data.json'));
  });
  
  test('loadGoldPriceData handles errors gracefully', async () => {
    // Setup mock response to fail
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    
    const result = await nisabService.loadGoldPriceData();
    
    // Should return a result even with errors
    expect(result).toBeDefined();
    expect(result.fromApi).toBe(false);
  });
  
  // Test API behavior
  test('fetchNisabValue checks cache before making API calls', async () => {
    // Reset fetch mock before this specific test
    global.fetch.mockReset();
    
    // Set up cached data
    nisabService.nisabData = { '2022-01': 5000 };
    
    // Try to fetch data that's already cached
    const result = await nisabService.fetchNisabValue('2022-01');
    
    // Should return cached data without making API call
    expect(result).toBe(5000);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  
  test('fetchNisabValue throws error when no API key and no cached data', async () => {
    // Reset fetch mock 
    global.fetch.mockReset();
    
    // Ensure no cached data and no API key
    nisabService.nisabData = {};
    nisabService.goldApiKey = '';
    
    // Should throw an error
    await expect(nisabService.fetchNisabValue('2022-01')).rejects.toThrow();
  });
  
  test('fetchNisabValue uses API when needed', async () => {
    // Reset fetch mock
    global.fetch.mockReset();
    
    // Set API key but no cached data
    nisabService.setApiKey('test-api-key');
    nisabService.nisabData = {};
    
    // Mock successful API response
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ price_gram_24k: 55 })
    });
    
    // Call should succeed and use API
    await nisabService.fetchNisabValue('2022-01');
    
    // Should have made an API call
    expect(global.fetch).toHaveBeenCalled();
  });
  
  test('isDataFromApi returns correct value', () => {
    // Explicitly set isFromApi to false first
    nisabService.isFromApi = false;
    expect(nisabService.isDataFromApi()).toBe(false);
    
    // Then test with true
    nisabService.isFromApi = true;
    expect(nisabService.isDataFromApi()).toBe(true);
  });
  
  test('error processing returns appropriate error messages', () => {
    // Test various error types
    const error400 = new Error('400');
    const error401 = new Error('401');
    const error429 = new Error('429');
    const errorGeneric = new Error('Something went wrong');
    
    // All should return Error instances with meaningful messages
    expect(nisabService.processError(error400)).toBeInstanceOf(Error);
    expect(nisabService.processError(error401)).toBeInstanceOf(Error);
    expect(nisabService.processError(error429)).toBeInstanceOf(Error);
    expect(nisabService.processError(errorGeneric)).toBeInstanceOf(Error);
  });
}); 