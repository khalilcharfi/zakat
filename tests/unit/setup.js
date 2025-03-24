/**
 * Jest setup file for Zakat Calculator unit tests
 */

// Mock fetch if it's not available in the test environment
global.fetch = global.fetch || jest.fn();

// Mock browser objects and functions that aren't available in jsdom
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

// Mock localStorage
class LocalStorageMock {
  constructor() {
    this.store = {};
  }

  clear() {
    this.store = {};
  }

  getItem(key) {
    return this.store[key] || null;
  }

  setItem(key, value) {
    this.store[key] = String(value);
  }

  removeItem(key) {
    delete this.store[key];
  }
}

global.localStorage = new LocalStorageMock();

// Mock browser navigation
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost/',
    search: '',
    pathname: '/',
    hash: '',
    reload: jest.fn()
  },
  writable: true
});

// Mock date functions for predictable date handling
const mockDate = new Date('2023-10-01T12:00:00Z');
global.Date = jest.fn(() => mockDate);
global.Date.now = jest.fn(() => mockDate.getTime());
global.Date.parse = jest.fn().mockImplementation(Date.parse);
global.Date.UTC = jest.fn().mockImplementation(Date.UTC);
global.Date.prototype = Date.prototype;

// Provide a custom matching function for testing events
expect.extend({
  toHaveBeenCalledWithEvent(received, eventName, eventDetail) {
    const calls = received.mock.calls;
    const matchingCall = calls.find(call => {
      const event = call[0];
      return (
        event.type === eventName &&
        JSON.stringify(event.detail) === JSON.stringify(eventDetail)
      );
    });

    return {
      pass: !!matchingCall,
      message: () => 
        this.utils.matcherHint(
          `${this.isNot ? '.not' : ''}.toHaveBeenCalledWithEvent`,
          'mockFunction',
          'eventName, eventDetail'
        ) +
        '\n\n' +
        `Expected: ${this.isNot ? 'not ' : ''}${this.utils.printExpected({ 
          type: eventName, 
          detail: eventDetail 
        })}\n` +
        `Received: ${this.utils.printReceived(
          calls.map(call => ({ 
            type: call[0].type, 
            detail: call[0].detail 
          }))
        )}`
    };
  }
}); 