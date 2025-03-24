/**
 * Unit tests for app.js
 */

const fs = require('fs');
const path = require('path');

describe('App.js Structure', () => {
  let appJsContent;
  
  beforeAll(() => {
    // Read the app.js file content
    const appJsPath = path.join(process.cwd(), 'js', 'app.js');
    appJsContent = fs.readFileSync(appJsPath, 'utf8');
  });
  
  test('should import ZakatUIController', () => {
    expect(appJsContent).toMatch(/import\s+{\s*ZakatUIController\s*}\s+from\s+['"]\.\/zakatUIController\.js['"]/);
  });
  
  test('should import initVersionInfo', () => {
    expect(appJsContent).toMatch(/import\s+{\s*initVersionInfo\s*}\s+from\s+['"]\.\/version\.js['"]/);
  });
  
  test('should add DOMContentLoaded event listener', () => {
    expect(appJsContent).toMatch(/document\.addEventListener\(\s*['"]DOMContentLoaded['"]/);
  });
  
  test('should initialize ZakatUIController in event listener', () => {
    expect(appJsContent).toMatch(/new\s+ZakatUIController\(\)/);
  });
  
  test('should call initVersionInfo in event listener', () => {
    expect(appJsContent).toMatch(/initVersionInfo\(\)/);
  });
});