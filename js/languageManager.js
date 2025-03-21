import translations from './translations.js';

export class LanguageManager {
    constructor() {
        this.currentLanguage = 'en';
        this.translationCache = new Map(); // Cache for translations
        this.fontLoaded = new Set(); // Track loaded fonts
    }

    changeLanguage(lang) {
        if (this.currentLanguage === lang) return; // Skip if language hasn't changed

        this.currentLanguage = lang;
        document.documentElement.lang = lang;
        document.body.lang = lang;

        // Clear cache when language changes
        this.translationCache.clear();

        this.updateTranslations();

        // Load font if needed and not already loaded
        if (lang === 'ar' && !this.fontLoaded.has('ar')) {
            this.loadFont('ar', 'https://fonts.googleapis.com/css2?family=Amiri&display=swap');
        }
    }

    updateTranslations() {
        // Use more efficient selector if available
        const elements = document.querySelectorAll('[data-i18n]');

        // Process elements in batches to avoid blocking the main thread
        if (elements.length > 100) {
            this.updateTranslationsBatched(elements);
        } else {
            elements.forEach(element => {
                const key = element.getAttribute('data-i18n');
                element.innerHTML = this.translate(key);
            });
        }
    }

    updateTranslationsBatched(elements) {
        const batchSize = 50;
        let index = 0;

        const processBatch = () => {
            const limit = Math.min(index + batchSize, elements.length);

            for (let i = index; i < limit; i++) {
                const element = elements[i];
                const key = element.getAttribute('data-i18n');
                element.innerHTML = this.translate(key);
            }

            index += batchSize;

            if (index < elements.length) {
                // Process next batch asynchronously
                setTimeout(processBatch, 0);
            }
        };

        processBatch();
    }

    translate(key) {
        // Check cache first
        if (this.translationCache.has(key)) {
            return this.translationCache.get(key);
        }

        // Get translation or fallback to key
        const translation = translations[this.currentLanguage]?.[key] || key;

        // Cache the result
        this.translationCache.set(key, translation);

        return translation;
    }

    loadFont(langCode, fontUrl) {
        // Check if already loaded
        if (document.getElementById(`${langCode}Font`)) {
            return;
        }

        const link = document.createElement('link');
        link.id = `${langCode}Font`;
        link.rel = 'stylesheet';
        link.href = fontUrl;

        // Mark as loaded when complete
        link.onload = () => this.fontLoaded.add(langCode);

        document.head.appendChild(link);
    }

    // Helper method to preload translations for common keys
    preloadCommonTranslations() {
        const commonKeys = ['loading', 'error', 'submit', 'cancel', 'next', 'previous'];
        commonKeys.forEach(key => this.translate(key));
    }
}