/**
 * Unit tests for the FormManager class
 */

// Using dynamic import for ES modules
let FormManager;

// Mock LanguageManager
const mockLanguageManager = {
  translate: jest.fn(key => key),
  getLanguage: jest.fn(() => 'en')
};

// Mock document elements
document.getElementById = jest.fn();
document.querySelector = jest.fn();
document.querySelectorAll = jest.fn(() => []);

describe('FormManager', () => {
  let formManager;
  
  // Load the module before tests
  beforeAll(async () => {
    const module = await import('../../js/formManager.js');
    FormManager = module.FormManager;
  });
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock form and elements
    const mockForm = {
      addEventListener: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn(() => []),
      reset: jest.fn()
    };
    
    document.getElementById.mockReturnValue(mockForm);
    
    // Create a new FormManager instance for each test
    formManager = new FormManager(mockLanguageManager);
  });
  
  describe('Constructor', () => {
    test('should initialize with language manager', () => {
      expect(formManager.languageManager).toBe(mockLanguageManager);
    });
    
    test('should set up form events', () => {
      const mockForm = document.getElementById.mock.results[0].value;
      expect(mockForm.addEventListener).toHaveBeenCalledWith('submit', expect.any(Function));
    });
  });
  
  describe('setupForm', () => {
    test('should set up date pickers and validation', () => {
      // Mock date input fields
      const mockDateInputs = [
        { addEventListener: jest.fn(), dataset: {} },
        { addEventListener: jest.fn(), dataset: {} }
      ];
      
      const mockForm = document.getElementById.mock.results[0].value;
      mockForm.querySelectorAll.mockReturnValue(mockDateInputs);
      
      formManager.setupForm();
      
      // Should set up event listeners for each date input
      expect(mockDateInputs[0].addEventListener).toHaveBeenCalledWith('blur', expect.any(Function));
      expect(mockDateInputs[1].addEventListener).toHaveBeenCalledWith('blur', expect.any(Function));
    });
  });
  
  describe('validateDateFormat', () => {
    test('should pass validation for valid MM/YYYY format', () => {
      const mockInput = { 
        value: '05/2023',
        setCustomValidity: jest.fn(),
        reportValidity: jest.fn()
      };
      
      formManager.validateDateFormat(mockInput);
      
      expect(mockInput.setCustomValidity).toHaveBeenCalledWith('');
      expect(mockInput.reportValidity).toHaveBeenCalled();
    });
    
    test('should fail validation for invalid format', () => {
      const mockInput = { 
        value: 'invalid',
        setCustomValidity: jest.fn(),
        reportValidity: jest.fn()
      };
      
      formManager.validateDateFormat(mockInput);
      
      expect(mockInput.setCustomValidity).toHaveBeenCalledWith(expect.any(String));
      expect(mockLanguageManager.translate).toHaveBeenCalledWith('validation.date_format');
    });
    
    test('should fail validation for invalid month', () => {
      const mockInput = { 
        value: '13/2023', // Invalid month
        setCustomValidity: jest.fn(),
        reportValidity: jest.fn()
      };
      
      formManager.validateDateFormat(mockInput);
      
      expect(mockInput.setCustomValidity).toHaveBeenCalledWith(expect.any(String));
    });
  });
  
  describe('handleFormSubmit', () => {
    test('should prevent default form submission', () => {
      const mockEvent = {
        preventDefault: jest.fn()
      };
      
      formManager.handleFormSubmit(mockEvent);
      
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });
    
    test('should process form data and trigger calculation', () => {
      // Mock form data elements
      const mockDateInput = { value: '05/2023' };
      const mockAmountInput = { value: '10000' };
      const mockInterestInput = { value: '500' };
      
      const mockForm = document.getElementById.mock.results[0].value;
      mockForm.querySelector.mockImplementation((selector) => {
        if (selector === '[name="date"]') return mockDateInput;
        if (selector === '[name="amount"]') return mockAmountInput;
        if (selector === '[name="interest"]') return mockInterestInput;
        return null;
      });
      
      // Mock the addEntry method
      formManager.addEntry = jest.fn();
      
      // Setup spy on calculateZakat
      formManager.triggerCalculation = jest.fn();
      
      // Submit the form
      formManager.handleFormSubmit({ preventDefault: jest.fn() });
      
      // Verify data is processed correctly
      expect(formManager.addEntry).toHaveBeenCalledWith({
        date: '05/2023',
        amount: 10000,
        interest: 500
      });
      
      // Verify calculation is triggered
      expect(formManager.triggerCalculation).toHaveBeenCalled();
    });
  });
  
  describe('addEntry', () => {
    test('should add entry to monthly data', () => {
      // Setup initial data
      formManager.monthlyData = [
        { date: '01/2023', amount: 5000, interest: 0 }
      ];
      
      // Add new entry
      formManager.addEntry({
        date: '02/2023',
        amount: 7000,
        interest: 300
      });
      
      // Check data was added correctly
      expect(formManager.monthlyData).toHaveLength(2);
      expect(formManager.monthlyData[1]).toEqual({
        date: '02/2023',
        amount: 7000,
        interest: 300
      });
    });
    
    test('should update existing entry with same date', () => {
      // Setup initial data
      formManager.monthlyData = [
        { date: '01/2023', amount: 5000, interest: 0 },
        { date: '02/2023', amount: 7000, interest: 300 }
      ];
      
      // Update existing entry
      formManager.addEntry({
        date: '01/2023',
        amount: 6000,
        interest: 100
      });
      
      // Check data was updated correctly
      expect(formManager.monthlyData).toHaveLength(2);
      expect(formManager.monthlyData[0]).toEqual({
        date: '01/2023',
        amount: 6000,
        interest: 100
      });
    });
  });
  
  describe('resetForm', () => {
    test('should reset form fields', () => {
      const mockForm = document.getElementById.mock.results[0].value;
      
      formManager.resetForm();
      
      expect(mockForm.reset).toHaveBeenCalled();
    });
  });
  
  describe('triggerCalculation', () => {
    test('should call the onCalculate callback with monthly data', () => {
      // Setup callback
      const mockCallback = jest.fn();
      formManager.onCalculate = mockCallback;
      
      // Setup data
      formManager.monthlyData = [
        { date: '01/2023', amount: 5000, interest: 0 }
      ];
      
      // Trigger calculation
      formManager.triggerCalculation();
      
      // Verify callback is called with data
      expect(mockCallback).toHaveBeenCalledWith(formManager.monthlyData);
    });
    
    test('should not throw if no callback is set', () => {
      // No callback set
      formManager.onCalculate = null;
      
      // Should not throw
      expect(() => formManager.triggerCalculation()).not.toThrow();
    });
  });
}); 