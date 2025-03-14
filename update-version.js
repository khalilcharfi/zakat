// update-version.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json to get application version
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const appVersion = packageJson.version;

// Generate current timestamp
const now = new Date();
const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
const formattedDate = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');

// Format timestamp for buildTimestamp (YYYYMMDD-HHMMSS)
const buildTimestamp = timestamp.slice(0, 8) + '-' + timestamp.slice(8);

// Read the current version.js file
const versionFilePath = path.join(__dirname, 'js', 'version.js');
let content = fs.readFileSync(versionFilePath, 'utf8');

// Update version, timestamp and build date
content = content.replace(/appVersion = '.*?'/, `appVersion = '${appVersion}'`);
content = content.replace(/buildTimestamp = '.*?'/, `buildTimestamp = '${buildTimestamp}'`);
content = content.replace(/buildDate = '.*?'/, `buildDate = '${formattedDate}'`);

// Write updated content back to file
fs.writeFileSync(versionFilePath, content);

console.log(`✅ Updated version.js with:`);
console.log(`   - Version: ${appVersion}`);
console.log(`   - Build timestamp: ${buildTimestamp}`);
console.log(`   - Build date: ${formattedDate}`);