/**
 * Unit tests for the version.js module
 */

// Using dynamic import for ES modules
let versionModule;

describe('Version Module', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create DOM element mocks with proper textContent property
    const mockElements = {
      'app-version': { textContent: '' },
      'build-info': { textContent: '' }
    };
    
    // Mock document.getElementById
    document.getElementById = jest.fn().mockImplementation(id => {
      return mockElements[id] || null;
    });
    
    // Mock console.log
    console.log = jest.fn();
  });
  
  // Load the module before tests
  beforeAll(async () => {
    versionModule = await import('../../js/version.js');
  });
  
  describe('Exports', () => {
    test('should export appVersion constant', () => {
      expect(versionModule.appVersion).toBeDefined();
      expect(typeof versionModule.appVersion).toBe('string');
    });
    
    test('should export buildTimestamp constant', () => {
      expect(versionModule.buildTimestamp).toBeDefined();
      expect(typeof versionModule.buildTimestamp).toBe('string');
    });
    
    test('should export buildDate constant', () => {
      expect(versionModule.buildDate).toBeDefined();
      expect(typeof versionModule.buildDate).toBe('string');
    });
    
    test('should export initVersionInfo function', () => {
      expect(versionModule.initVersionInfo).toBeDefined();
      expect(typeof versionModule.initVersionInfo).toBe('function');
    });
  });
  
  describe('initVersionInfo', () => {
    test('should update version element text content', () => {
      // Set up the mock element to properly store the textContent
      const versionElement = { textContent: '' };
      document.getElementById = jest.fn(id => {
        if (id === 'app-version') return versionElement;
        return null;
      });
      
      // Call the function
      versionModule.initVersionInfo();
      
      // Check if getElementById was called with correct ID
      expect(document.getElementById).toHaveBeenCalledWith('app-version');
      
      // Check if text content was updated correctly
      expect(versionElement.textContent).toBe(versionModule.appVersion);
    });
    
    test('should update build info element text content', () => {
      // Set up the mock element to properly store the textContent
      const buildElement = { textContent: '' };
      document.getElementById = jest.fn(id => {
        if (id === 'build-info') return buildElement;
        if (id === 'app-version') return { textContent: '' };
        return null;
      });
      
      // Call the function
      versionModule.initVersionInfo();
      
      // Check if getElementById was called with correct ID
      expect(document.getElementById).toHaveBeenCalledWith('build-info');
      
      // Check if text content was updated correctly
      expect(buildElement.textContent).toBe('Build ' + versionModule.buildTimestamp);
    });
    
    test('should log version info to console', () => {
      // Mock document to return elements for all calls
      document.getElementById = jest.fn().mockImplementation(() => ({ textContent: '' }));
      
      // Call the function
      versionModule.initVersionInfo();
      
      // Check if console.log was called with version info
      expect(console.log).toHaveBeenCalled();
      const logCall = console.log.mock.calls[0][0];
      expect(logCall).toContain(versionModule.appVersion);
      expect(logCall).toContain('Build:');
    });
    
    test('should handle missing DOM elements gracefully', () => {
      // Mock getElementById to return null
      document.getElementById = jest.fn().mockReturnValue(null);
      
      // Function should not throw when elements don't exist
      expect(() => versionModule.initVersionInfo()).not.toThrow();
    });
  });
}); 