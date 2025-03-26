import {ZakatUIController} from "./zakatUIController.js";
import {initVersionInfo} from "./version.js";
import {LanguageManager} from "./languageManager.js";

// Preload essential resources
const preloadResources = async () => {
    // Preload fonts for different languages
    const fonts = [
        { id: 'arFont', href: 'https://fonts.googleapis.com/css2?family=Amiri&display=swap' }
    ];
    
    fonts.forEach(font => {
        if (!document.getElementById(font.id)) {
            const link = document.createElement('link');
            link.id = font.id;
            link.rel = 'stylesheet';
            link.href = font.href;
            document.head.appendChild(link);
        }
    });
};

// Preload translations to prevent rendering issues
const preloadTranslations = () => {
    const languageManager = new LanguageManager();
    
    // Get the user's saved language or default to English
    const savedLanguage = localStorage.getItem('language') || 'en';
    languageManager.setLanguage(savedLanguage);
    
    // Set document direction based on language
    document.documentElement.dir = savedLanguage === 'ar' ? 'rtl' : 'ltr';
    
    // Preload common translations
    languageManager.preloadCommonTranslations();
    
    return languageManager;
};

// Initialize the app as soon as possible
document.addEventListener('DOMContentLoaded', async () => {
    // Preload resources and translations before initializing the UI
    await preloadResources();
    const preloadedLanguageManager = preloadTranslations();
    
    // Pass the preloaded language manager to the UI controller
    new ZakatUIController(preloadedLanguageManager);
    initVersionInfo();
});