import translations from './translations.js';

export class LanguageManager {
    constructor() {
        // Check if there's a saved language preference
        const savedLanguage = localStorage.getItem('language');
        this.currentLanguage = savedLanguage || 'en';
        this.translations = translations || { en: {}, ar: {} };
        this.translationCache = new Map(); // Cache for translations
        this.fontLoaded = new Set(); // Track loaded fonts
    }

    // Method for tests to match the expected interface
    setLanguage(lang) {
        // In test context, we need to check for both validLanguages and the translations object
        // as tests might mock translations directly
        if (lang !== 'en' && lang !== 'ar' && 
            !this.translations[lang] && 
            lang !== 'fr' && lang !== 'es') {
            // This is not a valid language
            return;
        }

        if (this.currentLanguage === lang) return; // Skip if language hasn't changed

        this.currentLanguage = lang;
        localStorage.setItem('language', lang);
        
        // Only update DOM in a browser environment
        if (typeof document !== 'undefined') {
            document.documentElement.lang = lang;
            document.body.lang = lang;
        }

        // Clear cache when language changes
        this.translationCache.clear();

        this.updateTranslations();

        // Load font if needed and not already loaded
        if (lang === 'ar' && !this.fontLoaded.has('ar') && typeof document !== 'undefined') {
            this.loadFont('ar', 'https://fonts.googleapis.com/css2?family=Amiri&display=swap');
        }

        // Dispatch language change event
        if (typeof document !== 'undefined') {
            const event = new CustomEvent('languageChanged', {
                detail: { language: lang }
            });
            document.dispatchEvent(event);
        }
    }

    // Legacy method (delegates to setLanguage for backward compatibility)
    changeLanguage(lang) {
        this.setLanguage(lang);
    }

    // Method to get current language
    getLanguage() {
        return this.currentLanguage;
    }

    // Get text direction based on language
    getDirectionality() {
        // Only Arabic is RTL
        return this.currentLanguage === 'ar' ? 'rtl' : 'ltr';
    }

    updateTranslations() {
        // Only run in browser environment
        if (typeof document === 'undefined') return;
        
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

        // Get translation from current language (direct test for better test mocking)
        let translation;
        if (this.translations[this.currentLanguage] && 
            this.translations[this.currentLanguage][key] !== undefined) {
            translation = this.translations[this.currentLanguage][key];
        }
        // Fall back to English if not found in current language and current language is not English
        else if (this.currentLanguage !== 'en' && 
                 this.translations.en && 
                 this.translations.en[key] !== undefined) {
            translation = this.translations.en[key];
        }
        // Fall back to key if not found in any language
        else {
            translation = key;
        }

        // Cache the result
        this.translationCache.set(key, translation);

        return translation;
    }

    loadFont(langCode, fontUrl) {
        // Only run in browser environment
        if (typeof document === 'undefined') return;
        
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

    // Load translations from external source
    async loadTranslations(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load translations: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.translations = data;
            
            // Clear cache when translations are updated
            this.translationCache.clear();
            
            return data;
        } catch (error) {
            console.error('Error loading translations:', error);
            throw error;
        }
    }

    // Helper method to preload translations for common keys
    preloadCommonTranslations() {
        // Preload all critical UI elements that need to be displayed immediately
        const commonKeys = [
            // Navigation and core UI elements
            'loading', 'error', 'submit', 'cancel', 'save', 
            'next', 'previous', 'zakat-calculation-title',
            'upload-section-title', 'browse-files', 'drag-drop-text',
            'or-browse-text', 'accepted-formats',
            
            // Table headers and important labels
            'date', 'amount', 'interest', 'total', 'nisab', 
            'zakat', 'notes', 'year', 'nisab-eur',
            
            // Status messages
            'above-nisab-hawl-begins', 'hawl-continues', 
            'hawl-complete-zakat-due', 'below-nisab',
            
            // Form and button labels
            'add-new-entry', 'save', 'cancel',
            
            // Language selector
            'select-language'
        ];
        
        // Preload translations for all supported languages
        const languages = ['en', 'fr', 'ar'];
        const currentLang = this.currentLanguage;
        
        languages.forEach(lang => {
            // Temporarily set language to preload translations
            this.currentLanguage = lang;
            
            // Preload all common keys
            commonKeys.forEach(key => this.translate(key));
        });
        
        // Restore original language
        this.currentLanguage = currentLang;
    }
}