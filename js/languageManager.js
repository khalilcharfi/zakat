import translations from './translations.js';

export class LanguageManager {
  constructor() {
    this.currentLanguage = 'en';
  }

  changeLanguage(lang) {
    this.currentLanguage = lang;
    document.documentElement.lang = lang;
    document.body.lang = lang;
    this.updateTranslations();

    if (lang === 'ar' && !document.getElementById('arabicFont')) {
      this.loadArabicFont();
    }
  }

  updateTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      element.innerHTML = this.translate(key);
    });
  }

  translate(key) {
    return translations[this.currentLanguage][key] || key;
  }

  loadArabicFont() {
    const link = document.createElement('link');
    link.id = 'arabicFont';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Amiri&display=swap';
    document.head.appendChild(link);
  }
}