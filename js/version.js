// Auto-generated file - do not edit manually
export const appVersion = '1.0.0';
export const buildTimestamp = '20250319-225452';
export const buildDate = '2025-03-19 23:54:52';

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
