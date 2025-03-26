// Auto-generated file - do not edit manually
export const appVersion = '1.0.0';
export const buildTimestamp = '20250326-085447';
export const buildDate = '2025-03-26 09:54:47';

export function initVersionInfo() {
    const versionElement = document.getElementById('app-version');
    const buildElement = document.getElementById('build-info');

    if (versionElement) {
        versionElement.textContent = appVersion;
    }

    if (buildElement) {
        buildElement.textContent = 'Build ' + buildTimestamp;
    }

    console.log('Zakat Calculator v' + appVersion + ' (Build: ' + buildDate + ')');
}
