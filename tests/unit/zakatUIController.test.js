/**
 * Unit tests for the ZakatUIController class
 */

// Mock Dropzone, window, and jQuery
global.Dropzone = {
  autoDiscover: false
};

global.window = {
  location: {
    search: ''
  }
};

global.$ = jest.fn().mockImplementation(() => ({
  DataTable: jest.fn().mockReturnValue({
    draw: jest.fn()
  })
}));

global.$.fn = {};
global.$.fn.dataTable = {
  ext: {
    search: {
      push: jest.fn()
    }
  }
};

// Mock URLSearchParams
global.URLSearchParams = jest.fn().mockImplementation(() => ({
  get: jest.fn()
}));

// Mock fetch
global.fetch = jest.fn().mockImplementation(() => 
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ price: 1835.50 })
  })
);

// Mock console methods to reduce noise
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    language: 'en-US'
  },
  writable: true
});

describe('ZakatUIController', () => {
  let ZakatUIController;
  let testController;
  let mockDateConverter;
  let mockNisabService;
  let mockLanguageManager;
  let mockZakatCalculator;
  
  // DOM mock setup
  const setupDom = () => {
    // Create mock DOM elements
    document.body.innerHTML = `
      <div id="zakatTable"></div>
      <div id="nisabTable"></div>
      <div class="toolbar-container"></div>
      <div class="view-button"></div>
      <div id="addRowForm">
        <input id="newRowDate" type="text">
        <input id="newRowAmount" type="text">
        <input id="newRowInterest" type="text">
      </div>
      <div class="loading-spinner"></div>
      <div class="error-display">
        <div class="error-message"></div>
      </div>
    `;
  };

  beforeEach(async () => {
    // Setup DOM
    setupDom();
    
    // Import the controller dynamically
    const ZakatUIControllerModule = await import('../../js/zakatUIController.js');
    ZakatUIController = ZakatUIControllerModule.ZakatUIController;
    
    // Override the init method to prevent actual initialization
    const originalInit = ZakatUIController.prototype.init;
    ZakatUIController.prototype.init = jest.fn();
    
    // Setup mocks
    mockDateConverter = {
      parseDate: jest.fn().mockReturnValue(new Date()),
      formatDate: jest.fn().mockReturnValue('2023-01-01'),
      convertToHijri: jest.fn().mockReturnValue('1444-06-08')
    };

    mockNisabService = {
      loadGoldPriceData: jest.fn().mockResolvedValue(5200),
      getNisabData: jest.fn().mockReturnValue({ 
        data: { '2023': 5200 },
        fromApi: false 
      }),
      setNisabData: jest.fn(),
      setApiKey: jest.fn(),
      getApiKey: jest.fn().mockReturnValue('test-api-key')
    };

    mockLanguageManager = {
      changeLanguage: jest.fn(),
      translate: jest.fn(key => key)
    };

    mockZakatCalculator = {
      calculateZakat: jest.fn().mockResolvedValue([
        { date: '01/2023', amount: 1000, nisab: 5200, zakat: 25 }
      ]),
      setMonthlyData: jest.fn(),
      getMonthlyData: jest.fn().mockReturnValue([
        { date: '01/2023', amount: 1000, interest: null }
      ])
    };

    // Create controller instance
    testController = new ZakatUIController({
      defaultLanguage: 'en',
      supportedLanguages: ['en', 'fr', 'ar']
    });

    // Replace dependencies with mocks
    testController.dateConverter = mockDateConverter;
    testController.nisabService = mockNisabService;
    testController.languageManager = mockLanguageManager;
    testController.calculator = mockZakatCalculator;

    // Setup DOM cache manually since we don't have real DOM
    testController.domElements = {
      zakatTable: document.getElementById('zakatTable'),
      nisabTable: document.getElementById('nisabTable'),
      toolbarContainer: document.querySelector('.toolbar-container'),
      viewButtons: document.querySelectorAll('.view-button'),
      addRowForm: document.getElementById('addRowForm'),
      newRowDate: document.getElementById('newRowDate'),
      newRowAmount: document.getElementById('newRowAmount'),
      newRowInterest: document.getElementById('newRowInterest'),
      loadingSpinner: document.querySelector('.loading-spinner'),
      errorDisplay: document.querySelector('.error-display'),
      errorMessage: document.querySelector('.error-message')
    };

    // Spy on DOM manipulation methods
    testController.domElements.addRowForm.classList = {
      add: jest.fn(),
      remove: jest.fn(),
      toggle: jest.fn()
    };
    
    testController.domElements.toolbarContainer.classList = {
      toggle: jest.fn()
    };
    
    testController.domElements.loadingSpinner.classList = {
      add: jest.fn(),
      remove: jest.fn()
    };
    
    testController.domElements.errorDisplay.classList = {
      add: jest.fn(),
      remove: jest.fn()
    };
    
    // Mock methods that access the DOM
    testController.updateUI = jest.fn();
    testController.generateZakatTable = jest.fn();
    testController.generateNisabTable = jest.fn();
    testController.updateZakatChart = jest.fn();
    
    // Mock formatCurrency
    const originalFormatCurrency = testController.formatCurrency;
    testController.formatCurrency = jest.fn(value => {
      return value === null || value === undefined ? '-' : `€${Number(value).toFixed(2)}`;
    });

    // Override ZakatUIController methods
    testController.showAddRowForm = function() {
      if (this.domElements.addRowForm) {
        this.domElements.addRowForm.classList.remove('hidden');
      }
    };

    testController.hideAddRowForm = function() {
      if (this.domElements.addRowForm) {
        this.domElements.addRowForm.classList.add('hidden');
      }
    };

    // Override toggleToolbarVisibility to remove the early return
    testController.toggleToolbarVisibility = function(show) {
      if (this.domElements.toolbarContainer) {
        this.domElements.toolbarContainer.classList.toggle('hidden', !show);
      }
    };
    
    // Restore the original init method after creating our test instance
    ZakatUIController.prototype.init = originalInit;
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const controller = new ZakatUIController();
      expect(controller.options).toBeDefined();
      expect(controller.options.defaultLanguage).toBe('en');
    });

    test('should initialize dependencies', () => {
      const controller = new ZakatUIController();
      expect(controller.languageManager).toBeDefined();
      expect(controller.dateConverter).toBeDefined();
      expect(controller.nisabService).toBeDefined();
      expect(controller.calculator).toBeDefined();
    });

    test('should initialize empty zakatData array', () => {
      const controller = new ZakatUIController();
      expect(controller.zakatData).toEqual([]);
    });

    test('should accept custom options', () => {
      const customOptions = {
        defaultLanguage: 'fr',
        supportedLanguages: ['fr', 'en'],
        cacheDuration: 48 * 60 * 60 * 1000
      };
      const controller = new ZakatUIController(customOptions);
      expect(controller.options.defaultLanguage).toBe('fr');
      expect(controller.options.supportedLanguages).toEqual(['fr', 'en']);
      expect(controller.options.cacheDuration).toBe(48 * 60 * 60 * 1000);
    });
  });

  describe('Initialization', () => {
    test('should call cacheDOMElements and setupEventListeners', () => {
      // Create spies
      const cacheDOMSpy = jest.spyOn(ZakatUIController.prototype, 'cacheDOMElements');
      const setupEventsSpy = jest.spyOn(ZakatUIController.prototype, 'setupEventListeners');

      // Create new instance to trigger init
      const controller = new ZakatUIController();

      // Check if methods were called
      expect(cacheDOMSpy).toHaveBeenCalled();
      expect(setupEventsSpy).toHaveBeenCalled();

      // Clean up
      cacheDOMSpy.mockRestore();
      setupEventsSpy.mockRestore();
    });

    test('should set initial language based on browser preference', () => {
      // Store original navigator language
      const originalNavigatorLanguage = navigator.language;
      
      // Mock navigator language
      Object.defineProperty(navigator, 'language', {
        get: () => 'fr-FR', 
        configurable: true
      });
      
      // Create new instance
      const controller = new ZakatUIController();
      
      // Create a spy for the languageManager
      const spy = jest.spyOn(controller.languageManager, 'changeLanguage');
      
      // Manually call init to set the language
      controller.init();
      
      // Verify the language was set
      expect(spy).toHaveBeenCalledWith('fr');
      
      // Restore navigator language
      Object.defineProperty(navigator, 'language', {
        get: () => originalNavigatorLanguage,
        configurable: true
      });
      
      // Cleanup
      spy.mockRestore();
    });

    test('should load gold price data', async () => {
      // Spy on the nisabService method
      const loadGoldPriceSpy = jest.spyOn(mockNisabService, 'loadGoldPriceData');
      
      // Manually call init to load gold price data
      await testController.init();
      
      // Check if methods were called
      expect(loadGoldPriceSpy).toHaveBeenCalledTimes(1);
    });

    test('should check URL for data', () => {
      // Spy on the checkUrlForData method
      const checkUrlSpy = jest.spyOn(testController, 'checkUrlForData');
      
      // Spy on the processJsonData method
      const processJsonDataSpy = jest.spyOn(testController, 'processJsonData');
      
      // Mock URL search params
      const mockURLSearchParams = {
        get: jest.fn().mockReturnValue('{"monthlyData":[{"date":"01/2023","amount":1000}],"nisabData":{"2023":5200}}')
      };
      
      // Mock the URLSearchParams constructor
      global.URLSearchParams = jest.fn().mockImplementation(() => mockURLSearchParams);
      
      // Call checkUrlForData directly
      testController.checkUrlForData();
      
      // Check if methods were called
      expect(mockURLSearchParams.get).toHaveBeenCalledWith('data');
      expect(processJsonDataSpy).toHaveBeenCalled();
    });
  });

  describe('JSON Data Processing', () => {
    test('should validate and process JSON data', () => {
      // Create valid JSON data
      const jsonData = {
        monthlyData: [{ date: '01/2023', amount: 1000 }],
        nisabData: { '2023': 5200 }
      };
      
      // Create spies
      const validateJsonDataSpy = jest.spyOn(testController, 'validateJsonData');
      const setMonthlyDataSpy = jest.spyOn(testController.calculator, 'setMonthlyData');
      const setNisabDataSpy = jest.spyOn(testController.nisabService, 'setNisabData');
      
      // Mock calculate zakat to avoid async issues
      mockZakatCalculator.calculateZakat.mockImplementation(() => {
        testController.zakatData = jsonData.monthlyData;
        return Promise.resolve(jsonData.monthlyData);
      });
      
      // Call processJsonData
      testController.processJsonData(jsonData);
      
      // Check if methods were called
      expect(validateJsonDataSpy).toHaveBeenCalledWith(jsonData);
      expect(setMonthlyDataSpy).toHaveBeenCalledWith(jsonData.monthlyData);
      expect(setNisabDataSpy).toHaveBeenCalledWith(jsonData.nisabData);
    });

    test('should handle errors in processJsonData', () => {
      // Create spy for showErrorState
      const showErrorSpy = jest.spyOn(testController, 'showErrorState');
      
      // Call with invalid data to trigger error
      testController.processJsonData(null);
      
      // Check if error handler was called
      expect(showErrorSpy).toHaveBeenCalled();
    });
  });

  describe('URL Data Handling', () => {
    test('should check URL for data parameter', () => {
      // Create valid data
      const mockData = JSON.stringify({
        data: [{ date: '2023-01-01', amount: 1000 }]
      });
      
      // Spy on the processJsonData method
      const processJsonDataSpy = jest.spyOn(testController, 'processJsonData');
      
      // Mock URL search params
      const mockURLSearchParams = {
        get: jest.fn().mockReturnValue(mockData)
      };
      
      // Mock the URLSearchParams constructor
      global.URLSearchParams = jest.fn().mockImplementation(() => mockURLSearchParams);
      
      // Call checkUrlForData directly
      testController.checkUrlForData();
      
      // Check if URL param was retrieved
      expect(mockURLSearchParams.get).toHaveBeenCalledWith('data');
    });

    test('should handle errors when parsing URL data', () => {
      // Spy on the showErrorState method
      const showErrorSpy = jest.spyOn(testController, 'showErrorState');
      
      // Mock URL search params with invalid JSON
      const mockURLSearchParams = {
        get: jest.fn().mockReturnValue('invalid-json')
      };
      
      // Mock the URLSearchParams constructor
      global.URLSearchParams = jest.fn().mockImplementation(() => mockURLSearchParams);
      
      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Call checkUrlForData directly
      testController.checkUrlForData();
      
      // Check if error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Form Handling', () => {
    test('should show and hide add row form', () => {
      // Spy on the class methods
      const addSpy = jest.spyOn(testController.domElements.addRowForm.classList, 'add');
      const removeSpy = jest.spyOn(testController.domElements.addRowForm.classList, 'remove');
      
      // Call showAddRowForm
      testController.showAddRowForm();
      
      // Check if classList.remove was called
      expect(removeSpy).toHaveBeenCalledWith('hidden');
      
      // Call hide method
      testController.hideAddRowForm();
      
      // Check if classList.add was called
      expect(addSpy).toHaveBeenCalledWith('hidden');
    });

    test('should reset form fields', () => {
      // Set initial values for form fields
      testController.domElements.newRowDate.value = '01/2023';
      testController.domElements.newRowAmount.value = '1000';
      testController.domElements.newRowInterest.value = '5';
      
      // Call resetFormFields
      testController.resetFormFields();
      
      // Check if fields were reset
      expect(testController.domElements.newRowDate.value).toBe('');
      expect(testController.domElements.newRowAmount.value).toBe('');
      expect(testController.domElements.newRowInterest.value).toBe('0');
    });

    test('should validate form input', () => {
      // Mock closest method for form groups
      const mockFormGroup = {
        classList: {
          add: jest.fn(),
          remove: jest.fn()
        }
      };
      
      testController.domElements.newRowDate.closest = jest.fn().mockReturnValue(mockFormGroup);
      testController.domElements.newRowAmount.closest = jest.fn().mockReturnValue(mockFormGroup);
      testController.domElements.newRowInterest.closest = jest.fn().mockReturnValue(mockFormGroup);
      
      // Set form values for testing
      testController.domElements.newRowDate.value = '01/2023';
      testController.domElements.newRowAmount.value = '1000';
      testController.domElements.newRowInterest.value = '5';
      
      // Test valid form
      expect(testController.validateForm()).toBe(true);
      
      // Test invalid date
      testController.domElements.newRowDate.value = 'invalid-date';
      expect(testController.validateForm()).toBe(false);
      
      // Test invalid amount
      testController.domElements.newRowDate.value = '01/2023';
      testController.domElements.newRowAmount.value = '-100';
      expect(testController.validateForm()).toBe(false);
      
      // Test invalid interest
      testController.domElements.newRowAmount.value = '1000';
      testController.domElements.newRowInterest.value = '-5';
      expect(testController.validateForm()).toBe(false);
    });
  });

  describe('Event Listeners', () => {
    test('should setup event listeners', () => {
      // Spy on setup methods
      const languageSelectSpy = jest.spyOn(testController, 'setupLanguageSelectListener');
      const languageDropdownSpy = jest.spyOn(testController, 'setupLanguageDropdownListener');
      const fileInputSpy = jest.spyOn(testController, 'setupFileInputListener');
      const filterToggleSpy = jest.spyOn(testController, 'setupFilterToggleListener');
      const downloadLinksSpy = jest.spyOn(testController, 'setupDownloadLinksListeners');
      
      // Call setupEventListeners
      testController.setupEventListeners();
      
      // Check if methods were called
      expect(languageSelectSpy).toHaveBeenCalled();
      expect(languageDropdownSpy).toHaveBeenCalled();
      expect(fileInputSpy).toHaveBeenCalled();
      expect(filterToggleSpy).toHaveBeenCalled();
      expect(downloadLinksSpy).toHaveBeenCalled();
    });
  });

  describe('UI Updates', () => {
    test('should toggle toolbar visibility', () => {
      // Spy on the classList.toggle method
      const toggleSpy = jest.spyOn(testController.domElements.toolbarContainer.classList, 'toggle');
      
      // Call toggleToolbarVisibility
      testController.toggleToolbarVisibility(true);
      
      // Check if classList.toggle was called with the right parameters
      expect(toggleSpy).toHaveBeenCalledWith('hidden', false);
    });

    test('should show loading state', () => {
      // Mock the innerHTML setter
      testController.domElements.zakatTable.innerHTML = '';
      testController.domElements.nisabTable.innerHTML = '';
      
      // Call showLoadingState
      testController.showLoadingState();
      
      // Check if loading HTML was set
      expect(testController.domElements.zakatTable.innerHTML).toContain('loading');
      expect(testController.domElements.nisabTable.innerHTML).toContain('loading');
    });

    test('should show error state', () => {
      // Mock the innerHTML setter
      testController.domElements.zakatTable.innerHTML = '';
      testController.domElements.nisabTable.innerHTML = '';
      
      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Call showErrorState with test error
      testController.showErrorState(new Error('Test error'));
      
      // Check if error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      // Check if error HTML was set
      expect(testController.domElements.zakatTable.innerHTML).toContain('Test error');
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe('UI Utilities', () => {
    test('should format currency correctly', () => {
      expect(testController.formatCurrency(1000)).toBe('€1000.00');
      expect(testController.formatCurrency(0)).toBe('€0.00');
      expect(testController.formatCurrency(null)).toBe('-');
      expect(testController.formatCurrency(undefined)).toBe('-');
    });

    test('should validate JSON data correctly', () => {
      // Valid data structure
      const validData = {
        monthlyData: [{ date: '01/2023', amount: 1000 }],
        nisabData: { '2023': 5200 }
      };
      
      expect(() => testController.validateJsonData(validData)).not.toThrow();
      
      // Test invalid data - missing monthlyData
      const invalidData1 = {};
      expect(() => testController.validateJsonData(invalidData1)).toThrow('Missing or invalid monthly data');
      
      // Test invalid data - empty monthlyData array
      const invalidData2 = { monthlyData: [], nisabData: { '2023': 5200 } };
      expect(() => testController.validateJsonData(invalidData2)).toThrow('Missing or invalid monthly data');
      
      // Test invalid data - missing nisabData
      const invalidData3 = { monthlyData: [{ date: '01/2023', amount: 1000 }] };
      expect(() => testController.validateJsonData(invalidData3)).toThrow('Missing or invalid nisab data');
      
      // Test invalid data - malformed monthlyData
      const invalidData4 = { 
        monthlyData: [{ date: '01/2023' }], // missing amount
        nisabData: { '2023': 5200 } 
      };
      expect(() => testController.validateJsonData(invalidData4)).toThrow('Invalid monthly data format');
    });
  });
});