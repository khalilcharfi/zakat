/**
 * Unit tests for the ZakatCalculator class
 */

// Using dynamic import for ES modules
let ZakatCalculator;

// Mock dependencies
const mockLanguageManager = {
  translate: jest.fn(key => key) // Returns the key as the translation
};

const mockDateConverter = {
  getHijriDate: jest.fn(async date => {
    // Simple mock conversion: add 1 to month and subtract 579 from year
    const [month, year] = date.split('/');
    return `${parseInt(month) + 1}/${parseInt(year) - 579}`;
  })
};

const mockNisabService = {
  fetchNisabValueForYearMonth: jest.fn(async (year, month) => {
    // Return mock nisab values based on year and month
    return 5000; // Default nisab value for tests
  }),
  fetchNisabValue: jest.fn(async (year) => {
    // Fallback nisab value for the year
    return 4800;
  }),
  getNisabValueForYearMonth: jest.fn((year, month) => {
    // Synchronous fallback
    return 4500;
  })
};

describe('ZakatCalculator', () => {
  let calculator;
  
  // Load the module before tests
  beforeAll(async () => {
    const module = await import('../../js/zakatCalculator.js');
    ZakatCalculator = module.ZakatCalculator;
  });
  
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Create a fresh instance for each test
    calculator = new ZakatCalculator(
      mockLanguageManager, 
      mockDateConverter, 
      mockNisabService
    );
  });
  
  describe('Constructor and basic methods', () => {
    test('should initialize with empty array for monthly data', () => {
      expect(calculator.getMonthlyData()).toEqual([]);
    });
    
    test('should set monthly data correctly', () => {
      const testData = [
        { date: '1/2023', amount: 10000, interest: 0 }
      ];
      calculator.setMonthlyData(testData);
      expect(calculator.getMonthlyData()).toEqual(testData);
      expect(calculator.getMonthlyData()).not.toBe(testData); // Should be a copy
    });
    
    test('should throw error if monthly data is not an array', () => {
      expect(() => calculator.setMonthlyData('not an array')).toThrow('Monthly data must be an array');
    });
    
    test('should set date config correctly', () => {
      calculator.setDateConfig({ useHijri: false });
      expect(calculator.dateConfig.useHijri).toBe(false);
    });
  });
  
  describe('prepareMonthlyData', () => {
    test('should filter out entries with negative or zero net value', () => {
      const testData = [
        { date: '1/2023', amount: 10000, interest: 0 },
        { date: '2/2023', amount: 5000, interest: 5000 }, // Net zero
        { date: '3/2023', amount: 5000, interest: 6000 }  // Net negative
      ];
      calculator.setMonthlyData(testData);
      const result = calculator.prepareMonthlyData();
      expect(result.length).toBe(1);
      expect(result[0].date).toBe('1/2023');
    });
    
    test('should sort entries chronologically', () => {
      const testData = [
        { date: '3/2023', amount: 10000, interest: 0 },
        { date: '1/2023', amount: 8000, interest: 0 },
        { date: '2/2023', amount: 9000, interest: 0 }
      ];
      calculator.setMonthlyData(testData);
      const result = calculator.prepareMonthlyData();
      expect(result.length).toBe(3);
      expect(result[0].date).toBe('1/2023');
      expect(result[1].date).toBe('2/2023');
      expect(result[2].date).toBe('3/2023');
    });
  });
  
  describe('extractUniqueYearMonths', () => {
    test('should extract year and month as numbers from dates', () => {
      const testData = [
        { date: '1/2023', amount: 10000 },
        { date: '2/2023', amount: 11000 }
      ];
      const result = calculator.extractUniqueYearMonths(testData);
      expect(result).toEqual([
        { year: 2023, month: 1 },
        { year: 2023, month: 2 }
      ]);
    });
  });
  
  describe('fetchHijriDates', () => {
    test('should create a map of gregorian to hijri dates', async () => {
      const uniqueDates = ['1/2023', '2/2023'];
      const result = await calculator.fetchHijriDates(uniqueDates);
      
      expect(mockDateConverter.getHijriDate).toHaveBeenCalledTimes(2);
      expect(result.get('1/2023')).toBe('2/1444'); // From our mock conversion
      expect(result.get('2/2023')).toBe('3/1444');
    });
  });
  
  describe('fetchNisabValues', () => {
    test('should fetch nisab values for unique year-month combinations', async () => {
      const yearMonths = [
        { year: 2023, month: 1 },
        { year: 2023, month: 2 },
        { year: 2023, month: 1 } // Duplicate should be ignored
      ];
      
      const result = await calculator.fetchNisabValues(yearMonths);
      
      expect(mockNisabService.fetchNisabValueForYearMonth).toHaveBeenCalledTimes(2);
      expect(result.get('2023-1')).toBe(5000);
      expect(result.get('2023-2')).toBe(5000);
    });
    
    test('should fallback to yearly nisab when monthly fetch fails', async () => {
      mockNisabService.fetchNisabValueForYearMonth.mockRejectedValueOnce(new Error('API error'));
      
      const yearMonths = [{ year: 2023, month: 1 }];
      const result = await calculator.fetchNisabValues(yearMonths);
      
      expect(mockNisabService.fetchNisabValue).toHaveBeenCalledWith(2023);
      expect(result.get('2023-1')).toBe(4800);
    });
  });
  
  describe('getNisabValue', () => {
    test('should return nisab from the map if available', () => {
      const nisabMap = new Map([['2023-1', 5000]]);
      const result = calculator.getNisabValue(2023, 1, nisabMap);
      expect(result).toBe(5000);
    });
    
    test('should fallback to January of same year if specific month not found', () => {
      const nisabMap = new Map([['2023-1', 5000]]);
      const result = calculator.getNisabValue(2023, 2, nisabMap);
      expect(result).toBe(5000);
    });
    
    test('should use service fallback if no value in map', () => {
      const nisabMap = new Map([]);
      const result = calculator.getNisabValue(2023, 2, nisabMap);
      expect(mockNisabService.getNisabValueForYearMonth).toHaveBeenCalledWith(2023, 2);
      expect(result).toBe(4500);
    });
  });
  
  describe('calculateHijriMonthsElapsed', () => {
    test('should calculate months elapsed correctly', () => {
      // Same year, different months
      expect(calculator.calculateHijriMonthsElapsed(1444, 5, 1444, 1)).toBe(4);
      
      // Different years
      expect(calculator.calculateHijriMonthsElapsed(1445, 1, 1444, 1)).toBe(12);
      
      // More complex case
      expect(calculator.calculateHijriMonthsElapsed(1445, 3, 1443, 8)).toBe(19);
    });
    
    test('should handle invalid inputs gracefully', () => {
      // Just check that it returns a number and doesn't throw
      expect(typeof calculator.calculateHijriMonthsElapsed('invalid', 5, 1444, 1)).toBe('number');
      expect(typeof calculator.calculateHijriMonthsElapsed(1444, 'invalid', 1444, 1)).toBe('number');
    });
  });
  
  describe('processEntriesWithHawl', () => {
    const hijriDateMap = new Map([
      ['1/2023', '2/1444'],
      ['2/2023', '3/1444'],
      ['3/2023', '4/1444'],
      ['12/2023', '1/1445'],
      ['1/2024', '2/1445']
    ]);
    
    const nisabMap = new Map([
      ['2023-1', 5000],
      ['2023-2', 5000],
      ['2023-3', 5000],
      ['2023-12', 5000],
      ['2024-1', 5000]
    ]);
    
    test('should mark entries below nisab correctly', () => {
      const entries = [
        { date: '1/2023', amount: 4000, interest: 0 }
      ];
      
      const results = calculator.processEntriesWithHawl(entries, hijriDateMap, nisabMap);
      
      expect(results[0].note).toBe('below-nisab');
      expect(results[0].rowClass).toBe('below-nisab');
      expect(results[0].zakat).toBeNull();
    });
    
    test('should start hawl when amount exceeds nisab', () => {
      const entries = [
        { date: '1/2023', amount: 6000, interest: 0 }
      ];
      
      const results = calculator.processEntriesWithHawl(entries, hijriDateMap, nisabMap);
      
      expect(results[0].note).toBe('above-nisab-hawl-begins');
      expect(results[0].rowClass).toBe('hawl-start');
      expect(results[0].zakat).toBeNull();
    });
    
    test('should calculate zakat after hawl completion (12 lunar months)', () => {
      const entries = [
        { date: '1/2023', amount: 6000, interest: 0 },  // Hawl starts
        { date: '2/2023', amount: 7000, interest: 0 },  // Hawl continues
        { date: '12/2023', amount: 8000, interest: 0 }, // Not quite 12 months
        { date: '1/2024', amount: 10000, interest: 0 }  // 12+ months - zakat due
      ];
      
      const results = calculator.processEntriesWithHawl(entries, hijriDateMap, nisabMap);
      
      expect(results[0].note).toBe('above-nisab-hawl-begins');
      expect(results[0].zakat).toBeNull();
      
      expect(results[1].note).toBe('hawl-continues');
      expect(results[1].zakat).toBeNull();
      
      expect(results[2].note).toBe('hawl-continues');
      expect(results[2].zakat).toBeNull();
      
      expect(results[3].note).toBe('hawl-complete-zakat-due');
      expect(results[3].rowClass).toBe('zakat-due');
      expect(results[3].zakat).toBe(250); // 2.5% of 10000 = 250
    });
    
    test('should reset hawl if wealth falls below nisab', () => {
      const entries = [
        { date: '1/2023', amount: 6000, interest: 0 },  // Hawl starts
        { date: '2/2023', amount: 4000, interest: 0 },  // Below nisab, hawl resets
        { date: '3/2023', amount: 7000, interest: 0 }   // New hawl starts
      ];
      
      const results = calculator.processEntriesWithHawl(entries, hijriDateMap, nisabMap);
      
      expect(results[0].note).toBe('above-nisab-hawl-begins');
      expect(results[1].note).toBe('below-nisab');
      expect(results[2].note).toBe('above-nisab-hawl-begins');
    });
    
    test('should handle interest correctly in calculating total', () => {
      const entries = [
        { date: '1/2023', amount: 10000, interest: 2000 },  // Net: 8000
        { date: '1/2024', amount: 12000, interest: 1000 }   // Net: 11000
      ];
      
      const results = calculator.processEntriesWithHawl(entries, hijriDateMap, nisabMap);
      
      expect(results[0].total).toBe(8000);
      expect(results[1].total).toBe(11000);
      expect(results[1].zakat).toBe(275); // 2.5% of 11000 = 275
    });
  });
  
  describe('calculateZakat integration', () => {
    test('should process data end-to-end correctly', async () => {
      const testData = [
        { date: '1/2023', amount: 10000, interest: 0 },
        { date: '2/2023', amount: 12000, interest: 0 },
        { date: '1/2024', amount: 15000, interest: 0 }
      ];
      
      calculator.setMonthlyData(testData);
      const results = await calculator.calculateZakat();
      
      expect(results.length).toBe(3);
      expect(results[0].note).toBe('above-nisab-hawl-begins');
      expect(results[1].note).toBe('hawl-continues');
      expect(results[2].note).toBe('hawl-complete-zakat-due');
      expect(results[2].zakat).toBe(375); // 2.5% of 15000
    });
    
    test('should handle errors gracefully', async () => {
      mockDateConverter.getHijriDate.mockRejectedValueOnce(new Error('API error'));
      
      const testData = [{ date: '1/2023', amount: 10000, interest: 0 }];
      calculator.setMonthlyData(testData);
      
      await expect(calculator.calculateZakat()).rejects.toThrow();
    });
  });
  
  describe('roundToTwoDecimals', () => {
    test('should round numbers to 2 decimal places', () => {
      expect(calculator.roundToTwoDecimals(10.255)).toBe(10.26);
      expect(calculator.roundToTwoDecimals(10.251)).toBe(10.25);
      expect(calculator.roundToTwoDecimals(10)).toBe(10);
    });
  });
}); 