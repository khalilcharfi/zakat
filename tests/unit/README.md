# Zakat Calculator Unit Tests

This directory contains unit tests for the Zakat Calculator application. The tests are implemented using Jest and focus on testing the core functionality of the application's JavaScript modules.

## Test Structure

The unit tests follow a standard Jest testing pattern:

```
tests/unit/
├── dateConverter.test.js   # Tests for the DateConverter utility
├── formManager.test.js     # Tests for the FormManager class
├── languageManager.test.js # Tests for the LanguageManager class
├── zakatCalculator.test.js # Tests for the ZakatCalculator class
├── package.json            # Jest configuration and dependencies
├── setup.js                # Jest setup file for test environment
└── README.md               # This file
```

## Running Tests

To run the tests:

1. Navigate to the `tests/unit` directory:
   ```
   cd tests/unit
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Run the tests:
   ```
   npm test
   ```

### Additional Test Commands

- Run tests in watch mode (continuous testing):
  ```
  npm run test:watch
  ```

- Generate coverage report:
  ```
  npm run test:coverage
  ```

## Test Coverage

The tests aim to cover:

- Core business logic for calculating zakat
- Form validation and handling
- Date conversion between Gregorian and Hijri calendars
- Multilingual support and translations

## Mocking Strategy

The tests use mocks for:

- External API calls (for Hijri date conversion)
- DOM manipulation (using JSDOM)
- Browser APIs like localStorage
- Date objects for predictable date handling

## Adding New Tests

When adding new test files:

1. Create a file with the naming pattern `[module-name].test.js`
2. Import the module you want to test
3. Create mock dependencies as needed
4. Write test cases using Jest's `describe` and `test` functions
5. Run tests to verify functionality 